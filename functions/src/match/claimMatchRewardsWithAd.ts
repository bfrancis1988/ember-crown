// functions/src/match/claimMatchRewardsWithAd.ts
// Phase 9.4 monetization: rewarded-video bonus claim. Replaces neither
// claimMatchRewards (solo no-ad) nor recordCampaignWin (campaign no-ad) — those
// stay for the no-ad path. Discriminates on session.mode and applies the bonus
// formula:
//   Solo / battle_mode win  + ad: floor(SOLO_WIN_COIN_BASELINE * 1.5)
//   Solo / battle_mode loss + ad: floor(MATCH_REWARD_COINS_LOSS * 1.5)
//   Campaign win  + ad: floor(base * 1.5) for coins/shards; keys unchanged (no ad bonus)
//   Campaign loss + ad: floor(firstWin * 0.5) for coins/shards, no keys, no progression
// Tutorial mode is rejected — completeTutorial keeps its 100c+1s+1k reward and
// has no ad option.
//
// Update 1.0.5: ad win multiplier reduced 2× → 1.5×; key ad bonus removed
// entirely on campaign first-clear; solo loss base switched from win-baseline
// to the no-ad loss constant.
//
// One ad per match: the new ad_reward_claimed flag plus player_a_claimed both
// gate further claims. The successful path sets both flags atomically with the
// wallet credit and (campaign-win only) progression updates.
//
// Trust model: client-side ad completion is trusted in v1. AdMob SSV
// (Server-Side Verification) is a v1.1 polish item if abuse appears.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  MATCH_REWARD_COINS_MIN,
  MATCH_REWARD_COINS_MAX,
  MATCH_REWARD_COINS_LOSS,
} from '../lib/matchConstants';
import type { MatchSession } from '../types/match';
import type { CampaignStage } from '../types/campaign';
import { settleInTx, countCardsLost, pickPlayerACounters } from '../quests/questSettlement';
import { incrementMatchStatsInTx } from '../lib/playerStats';
import { writeMatchHistoryInTx } from '../lib/matchHistory';

type ClaimWithAdInput = { match_id: string };

type ClaimWithAdResult = {
  success: true;
  is_win: boolean;
  coins_earned: number;
  shards_earned: number;
  keys_earned: number;
  // Empty unless this was a campaign first-win on a stage with unlocks_factions.
  // The client uses this to trigger FactionUnlockCelebration.
  factions_unlocked: string[];
  wallet_after: { coins: number; shards: number; keys: number; dust: number };
};

// Fixed midpoint of the random no-ad solo win range used by claimMatchRewards.
// Deterministic so the ad-bonus value is predictable to the player.
const SOLO_WIN_COIN_BASELINE = Math.floor(
  (MATCH_REWARD_COINS_MIN + MATCH_REWARD_COINS_MAX) / 2,
);

const AD_WIN_MULTIPLIER = 1.5;
const AD_LOSS_MULTIPLIER = 0.5;

export const claimMatchRewardsWithAd = onCall<ClaimWithAdInput, Promise<ClaimWithAdResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const { match_id } = request.data;

    if (!match_id) {
      throw new HttpsError('invalid-argument', 'match_id is required.');
    }

    const db = admin.firestore();

    // Release 1.2.0 — cards_lost is fetched once outside the tx (match is
    // already over so board state is stable) and cached lazily across tx
    // retries. Mirrors claimMatchRewards / recordCampaignWin.
    let cardsLostForQuest: number | null = null;

    const result = await db.runTransaction(async (tx) => {
      // ── Reads (all before any writes; Firestore transaction rule) ────────
      const sessionRef = db.collection('match_sessions').doc(match_id);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        throw new HttpsError('not-found', 'Match not found.');
      }
      const session = sessionSnap.data() as MatchSession;

      if (session.status !== 'game_over') {
        throw new HttpsError('failed-precondition', 'Match is not over.');
      }
      if (uid !== session.player_a_id) {
        throw new HttpsError('permission-denied', 'Not your match.');
      }
      if (session.player_a_claimed) {
        throw new HttpsError('failed-precondition', 'Rewards already claimed.');
      }
      if (session.ad_reward_claimed) {
        throw new HttpsError('failed-precondition', 'Ad reward already claimed.');
      }
      if (session.mode === 'tutorial') {
        throw new HttpsError('failed-precondition', 'Tutorial does not support ad rewards.');
      }

      const isWin = session.player_a_wins > session.player_b_wins;

      const walletRef = db.collection('player_wallets').doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new HttpsError('failed-precondition', 'Wallet not found.');
      }
      const wallet = walletSnap.data()!;

      // Mode-specific reads + base reward computation.
      let baseCoins = 0;
      let baseShards = 0;
      let baseKeys = 0;
      let stage: CampaignStage | null = null;
      let progressSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let profileSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let isFirstWin = false;
      let factionsToUnlock: string[] = [];

      const progressRef = db.collection('player_campaign_progress').doc(uid);
      const profileRef = db.collection('player_profiles').doc(uid);

      if (session.mode === 'solo' || session.mode === 'battle_mode') {
        // Phase 9.4.5C: Battle Mode reuses the solo reward baseline. No
        // campaign progression, no faction unlocks — just the same coin
        // baseline that solo matches pay.
        baseCoins = SOLO_WIN_COIN_BASELINE;
        baseShards = 0;
      } else if (session.mode === 'campaign') {
        if (!session.stage_id) {
          throw new HttpsError('internal', 'Campaign match missing stage_id.');
        }
        const stageRef = db.collection('campaign_stages').doc(session.stage_id);
        const stageSnap = await tx.get(stageRef);
        if (!stageSnap.exists) {
          throw new HttpsError('internal', `Stage not found: ${session.stage_id}`);
        }
        stage = stageSnap.data() as CampaignStage;

        progressSnap = await tx.get(progressRef);
        const completed = progressSnap.exists
          ? (progressSnap.data()?.completed_stages as Record<string, unknown> | undefined)
          : undefined;
        isFirstWin = !completed?.[session.stage_id];

        if (isWin && isFirstWin) {
          baseCoins = stage.rewards.coins;
          baseShards = stage.rewards.shards;
          baseKeys = stage.rewards.keys;
        } else if (isWin && !isFirstWin) {
          // Replay win: base is the 50%-of-stage replay amount; the ×2 below
          // brings it back to one full stage payout (no keys).
          baseCoins = Math.floor(stage.rewards.coins / 2);
          baseShards = Math.floor(stage.rewards.shards / 2);
          baseKeys = 0;
        } else {
          // Loss: base for the ad-on-loss formula is the FIRST-WIN amount
          // (regardless of whether the stage was previously completed),
          // because the rule is "50% of what a win would pay".
          baseCoins = stage.rewards.coins;
          baseShards = stage.rewards.shards;
          baseKeys = stage.rewards.keys;
        }

        // Profile read is conditional but must happen before any writes.
        const needsProfileRead =
          isWin &&
          isFirstWin &&
          !!stage.unlocks_factions &&
          stage.unlocks_factions.length > 0;
        if (needsProfileRead) {
          profileSnap = await tx.get(profileRef);
          if (profileSnap.exists) {
            const profile = profileSnap.data()!;
            const currentUnlocked = (profile.unlocked_factions ?? []) as string[];
            factionsToUnlock = stage.unlocks_factions!.filter(
              (f) => !currentUnlocked.includes(f),
            );
          }
        }
      } else {
        throw new HttpsError('failed-precondition', `Unsupported mode: ${session.mode}`);
      }

      // ── Quest settlement + lifetime stats (Release 1.2.0 — gap fix) ──────
      // Mirrors the no-ad claim paths so a match counted toward quests and
      // player_stats whether the player chose the ad bonus or not. Was
      // missed when player_stats / quests landed in 1.1.0 — fixed here so
      // record.tsx (which reads player_stats) reflects all claimed matches.
      //
      // Must run before the writes below — settleInTx does its own reads
      // (quest_progress) and Firestore enforces reads-before-writes.
      if (cardsLostForQuest === null) {
        cardsLostForQuest = await countCardsLost(match_id, db);
      }
      const increments = pickPlayerACounters(session);
      if (session.mode === 'campaign' && isWin) {
        increments.campaign_stages_won = 1;
      }
      await settleInTx(
        tx,
        uid,
        {
          counterIncrements: increments,
          match: {
            isVictory: isWin,
            isCompleted: true,
            player_a_faction: session.player_a_faction,
            cards_lost: cardsLostForQuest,
            mode: session.mode,
          },
        },
        db,
      );
      incrementMatchStatsInTx(tx, uid, { mode: session.mode, isVictory: isWin }, db);

      // ── Apply ad multiplier ──────────────────────────────────────────────
      // Update 1.0.5: 1.5× win bonus (down from 2×); keys no longer
      // ad-boosted on campaign first-clear; solo loss base is the no-ad loss
      // constant rather than the solo win baseline.
      let coinsEarned: number;
      let shardsEarned: number;
      let keysEarned: number;

      if (isWin) {
        if (session.mode === 'solo' || session.mode === 'battle_mode') {
          coinsEarned = Math.floor(SOLO_WIN_COIN_BASELINE * AD_WIN_MULTIPLIER);
          shardsEarned = Math.floor(baseShards * AD_WIN_MULTIPLIER);
          keysEarned = 0;
        } else {
          // Campaign win (first-clear or replay)
          coinsEarned = Math.floor(baseCoins * AD_WIN_MULTIPLIER);
          shardsEarned = Math.floor(baseShards * AD_WIN_MULTIPLIER);
          keysEarned = baseKeys;
        }
      } else {
        if (session.mode === 'solo' || session.mode === 'battle_mode') {
          coinsEarned = Math.floor(MATCH_REWARD_COINS_LOSS * AD_WIN_MULTIPLIER);
          shardsEarned = 0;
          keysEarned = 0;
        } else {
          // Campaign loss + ad: 50% of first-win amount; no keys, no progression.
          coinsEarned = Math.floor(baseCoins * AD_LOSS_MULTIPLIER);
          shardsEarned = Math.floor(baseShards * AD_LOSS_MULTIPLIER);
          keysEarned = 0;
        }
      }

      // ── Writes ───────────────────────────────────────────────────────────
      tx.update(walletRef, {
        coins: FieldValue.increment(coinsEarned),
        shards: FieldValue.increment(shardsEarned),
        keys: FieldValue.increment(keysEarned),
        updated_at: FieldValue.serverTimestamp(),
      });

      tx.update(sessionRef, {
        player_a_claimed: true,
        ad_reward_claimed: true,
        updated_at: FieldValue.serverTimestamp(),
      });

      // Release 1.2.0 — per-match history row. cardsLostForQuest is
      // guaranteed non-null here — settleInTx above populated it.
      writeMatchHistoryInTx(tx, uid, session, isWin, cardsLostForQuest ?? 0, db);

      // Campaign WIN — apply progression updates (mirrors recordCampaignWin).
      // Loss does NOT update progression: completed_stages stays empty so the
      // player can replay the stage as first-win later.
      if (session.mode === 'campaign' && isWin && stage) {
        const newFactionProgress = Math.max(
          progressSnap?.data()?.progress?.[stage.faction] ?? 0,
          stage.stage_number,
        );

        if (progressSnap?.exists) {
          const progressUpdate: Record<string, any> = {
            [`progress.${stage.faction}`]: newFactionProgress,
            [`completed_stages.${session.stage_id}`]: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          };
          if (isFirstWin) {
            progressUpdate[`claimed_stages.${session.stage_id}`] = true;
          }
          tx.update(progressRef, progressUpdate);
        } else {
          tx.set(progressRef, {
            player_id: uid,
            progress: { [stage.faction]: newFactionProgress },
            completed_stages: { [session.stage_id!]: FieldValue.serverTimestamp() },
            claimed_stages: isFirstWin ? { [session.stage_id!]: true } : {},
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
        }

        if (factionsToUnlock.length > 0) {
          tx.update(profileRef, {
            unlocked_factions: FieldValue.arrayUnion(...factionsToUnlock),
            updated_at: FieldValue.serverTimestamp(),
          });
        }
      }

      const walletAfter = {
        coins: (wallet.coins ?? 0) + coinsEarned,
        shards: (wallet.shards ?? 0) + shardsEarned,
        keys: (wallet.keys ?? 0) + keysEarned,
        dust: wallet.dust ?? 0,
      };

      logger.info('Match rewards claimed with ad', {
        uid,
        match_id,
        mode: session.mode,
        is_win: isWin,
        coins_earned: coinsEarned,
        shards_earned: shardsEarned,
        keys_earned: keysEarned,
        factions_unlocked: factionsToUnlock,
        ad_win_multiplier: AD_WIN_MULTIPLIER,
        ad_loss_multiplier: AD_LOSS_MULTIPLIER,
      });

      return {
        success: true as const,
        is_win: isWin,
        coins_earned: coinsEarned,
        shards_earned: shardsEarned,
        keys_earned: keysEarned,
        factions_unlocked: factionsToUnlock,
        wallet_after: walletAfter,
      };
    });

    return result;
  },
);
