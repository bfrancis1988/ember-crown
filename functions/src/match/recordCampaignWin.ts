// functions/src/match/recordCampaignWin.ts
// Callable: pays out campaign rewards on stage win, records progression in
// player_campaign_progress, and unlocks new factions atomically when a
// stage_9 first-win has unlocks_factions populated.
//
// Distinct from claimMatchRewards (solo) and completeTutorial (tutorial).
// The match-flow client routes claim calls by session.mode.
//
// First-win vs replay is determined server-side by the presence of an entry
// in player_campaign_progress.completed_stages[stage_id]. Replays pay 50%
// coins/shards (rounded down) and 0 keys, and never unlock factions.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { MatchSession } from '../types/match';
import type { CampaignStage } from '../types/campaign';

type RecordCampaignWinInput = { match_id: string };

type RecordCampaignWinResult = {
  success: true;
  is_first_win: boolean;
  coins_earned: number;
  shards_earned: number;
  keys_earned: number;
  factions_unlocked: string[];
  next_stage_id: string | null;
};

export const recordCampaignWin = onCall<RecordCampaignWinInput, Promise<RecordCampaignWinResult>>(
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

    const result = await db.runTransaction(async (tx) => {
      // ── Reads (all before any writes) ────────────────────────────────────
      const sessionRef = db.collection('match_sessions').doc(match_id);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        throw new HttpsError('not-found', 'Match not found.');
      }
      const session = sessionSnap.data() as MatchSession;

      if (session.status !== 'game_over') {
        throw new HttpsError('failed-precondition', 'Match is not over yet.');
      }
      if (session.mode !== 'campaign') {
        throw new HttpsError(
          'failed-precondition',
          'Wrong claim function. Use claimMatchRewards for solo matches.',
        );
      }
      if (!session.stage_id) {
        throw new HttpsError('internal', 'Campaign match missing stage_id.');
      }
      if (uid !== session.player_a_id) {
        throw new HttpsError('permission-denied', 'Not your match.');
      }
      if (session.player_a_claimed) {
        throw new HttpsError('failed-precondition', 'Rewards already claimed.');
      }
      if (session.player_a_wins <= session.player_b_wins) {
        throw new HttpsError('failed-precondition', 'Match was not won.');
      }

      const stageRef = db.collection('campaign_stages').doc(session.stage_id);
      const stageSnap = await tx.get(stageRef);
      if (!stageSnap.exists) {
        throw new HttpsError('internal', `Stage not found: ${session.stage_id}`);
      }
      const stage = stageSnap.data() as CampaignStage;

      const progressRef = db.collection('player_campaign_progress').doc(uid);
      const progressSnap = await tx.get(progressRef);
      const progress = progressSnap.exists
        ? progressSnap.data()!
        : {
            player_id: uid,
            progress: {} as Record<string, number>,
            completed_stages: {} as Record<string, FirebaseFirestore.Timestamp>,
            claimed_stages: {} as Record<string, boolean>,
          };

      const isFirstWin = !progress.completed_stages?.[session.stage_id];

      // Profile read is conditional — only needed for stage_9 first-wins
      // with unlocks_factions populated. Still must happen before any writes.
      const profileRef = db.collection('player_profiles').doc(uid);
      const needsProfileRead =
        isFirstWin && !!stage.unlocks_factions && stage.unlocks_factions.length > 0;
      const profileSnap = needsProfileRead ? await tx.get(profileRef) : null;

      const walletRef = db.collection('player_wallets').doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new HttpsError('failed-precondition', 'Wallet not found.');
      }

      // ── Compute outcomes ─────────────────────────────────────────────────
      const baseRewards = stage.rewards;
      const coinsEarned = isFirstWin
        ? baseRewards.coins
        : Math.floor(baseRewards.coins / 2);
      const shardsEarned = isFirstWin
        ? baseRewards.shards
        : Math.floor(baseRewards.shards / 2);
      const keysEarned = isFirstWin ? baseRewards.keys : 0;

      const factionsUnlocked: string[] = [];
      if (needsProfileRead && profileSnap?.exists) {
        const profile = profileSnap.data()!;
        const currentUnlocked = (profile.unlocked_factions ?? []) as string[];
        for (const newFaction of stage.unlocks_factions!) {
          if (!currentUnlocked.includes(newFaction)) {
            factionsUnlocked.push(newFaction);
          }
        }
      }

      let nextStageId: string | null = null;
      if (stage.stage_number < 9) {
        const factionUnderscored = stage.faction.toLowerCase().replace(/ /g, '_');
        nextStageId = `${factionUnderscored}_${String(stage.stage_number + 1).padStart(2, '0')}`;
      }

      const newFactionProgress = Math.max(
        progress.progress?.[stage.faction] ?? 0,
        stage.stage_number,
      );

      // ── Writes ───────────────────────────────────────────────────────────
      tx.update(walletRef, {
        coins: FieldValue.increment(coinsEarned),
        shards: FieldValue.increment(shardsEarned),
        keys: FieldValue.increment(keysEarned),
        updated_at: FieldValue.serverTimestamp(),
      });

      if (progressSnap.exists) {
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
          completed_stages: { [session.stage_id]: FieldValue.serverTimestamp() },
          claimed_stages: isFirstWin ? { [session.stage_id]: true } : {},
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      if (factionsUnlocked.length > 0) {
        tx.update(profileRef, {
          unlocked_factions: FieldValue.arrayUnion(...factionsUnlocked),
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      tx.update(sessionRef, {
        player_a_claimed: true,
        updated_at: FieldValue.serverTimestamp(),
      });

      logger.info('Campaign win recorded', {
        uid,
        match_id,
        stage_id: session.stage_id,
        is_first_win: isFirstWin,
        coins_earned: coinsEarned,
        shards_earned: shardsEarned,
        keys_earned: keysEarned,
        factions_unlocked: factionsUnlocked,
      });

      return {
        success: true as const,
        is_first_win: isFirstWin,
        coins_earned: coinsEarned,
        shards_earned: shardsEarned,
        keys_earned: keysEarned,
        factions_unlocked: factionsUnlocked,
        next_stage_id: nextStageId,
      };
    });

    return result;
  },
);
