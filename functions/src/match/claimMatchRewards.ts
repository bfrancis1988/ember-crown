// functions/src/match/claimMatchRewards.ts
// Callable: pays out wallet currency on game-over and marks {side}_claimed.
// One-time per side per match. AI bot side is never claimed (no wallet).
//
// Update 1: wrapped in db.runTransaction so the claimed-flag check and the
// wallet write commit atomically. Without the transaction, two parallel
// calls could both pass the claimedFlag check and double-credit the wallet.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  MATCH_REWARD_COINS_MIN, MATCH_REWARD_COINS_MAX, MATCH_REWARD_COINS_LOSS,
  MATCH_REWARD_SHARDS_WIN, MATCH_REWARD_SHARDS_LOSS,
  MATCH_REWARD_SHARD_STREAK_WINS,
} from '../lib/matchConstants';
import type { MatchSession } from '../types/match';
import type { ClaimMatchRewardsResult } from '../types/actions';

type ClaimInput = { matchId: string };

export const claimMatchRewards = onCall<ClaimInput, Promise<ClaimMatchRewardsResult>>(
  { region: 'us-central1' },
  async (request) => {
    const { matchId } = request.data;
    if (!matchId) {
      throw new HttpsError('invalid-argument', 'matchId is required.');
    }
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;

    const db = admin.firestore();
    const sessionRef = db.collection('match_sessions').doc(matchId);
    const walletRef = db.collection('player_wallets').doc(uid);
    const profileRef = db.collection('player_profiles').doc(uid);

    const result = await db.runTransaction(async (tx) => {
      // ── Reads (all before any writes; Firestore transaction rule) ────────
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        throw new HttpsError('not-found', 'Match not found.');
      }
      const session = sessionSnap.data() as MatchSession;

      if (session.status !== 'game_over') {
        throw new HttpsError('failed-precondition', 'Match is not over yet.');
      }

      let callerSide: 'player_a' | 'player_b';
      if (uid === session.player_a_id) callerSide = 'player_a';
      else if (uid === session.player_b_id) callerSide = 'player_b';
      else throw new HttpsError('permission-denied', 'You are not a player in this match.');

      const claimedFlag = `${callerSide}_claimed` as const;
      if (session[claimedFlag]) {
        throw new HttpsError('failed-precondition', 'Rewards already claimed.');
      }

      const walletSnap = await tx.get(walletRef);
      const profileSnap = await tx.get(profileRef);

      // ── Compute reward ───────────────────────────────────────────────────
      const callerVP = callerSide === 'player_a' ? session.player_a_wins : session.player_b_wins;
      const oppVP = callerSide === 'player_a' ? session.player_b_wins : session.player_a_wins;
      const isVictory = callerVP > oppVP;

      const coinsEarned = isVictory
        ? Math.floor(Math.random() * (MATCH_REWARD_COINS_MAX - MATCH_REWARD_COINS_MIN + 1)) + MATCH_REWARD_COINS_MIN
        : MATCH_REWARD_COINS_LOSS;
      const baseShardsEarned = isVictory ? MATCH_REWARD_SHARDS_WIN : MATCH_REWARD_SHARDS_LOSS;

      // Streak-based shard: every Nth win grants +1 shard and resets the counter.
      const profileData = profileSnap.exists ? profileSnap.data() : undefined;
      const priorStreak = (profileData?.wins_since_last_shard as number | undefined) ?? 0;

      let newStreak = priorStreak;
      let streakShard = 0;
      if (isVictory) {
        const nextStreak = priorStreak + 1;
        if (nextStreak >= MATCH_REWARD_SHARD_STREAK_WINS) {
          streakShard = 1;
          newStreak = 0;
        } else {
          newStreak = nextStreak;
        }
      }

      const shardsEarned = baseShardsEarned + streakShard;

      // ── Writes ───────────────────────────────────────────────────────────
      // Wallet should exist (created during onboarding); defensive create if missing.
      if (!walletSnap.exists) {
        logger.warn('Wallet missing during claim; creating', { uid });
        tx.set(walletRef, {
          player_id: uid,
          coins: coinsEarned,
          shards: shardsEarned,
          keys: 0,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(walletRef, {
          coins: FieldValue.increment(coinsEarned),
          shards: FieldValue.increment(shardsEarned),
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      if (isVictory) {
        if (profileSnap.exists) {
          tx.update(profileRef, {
            wins_since_last_shard: newStreak,
            updated_at: FieldValue.serverTimestamp(),
          });
        } else {
          tx.set(
            profileRef,
            {
              wins_since_last_shard: newStreak,
              updated_at: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      }

      tx.update(sessionRef, {
        [claimedFlag]: true,
        updated_at: FieldValue.serverTimestamp(),
      });

      return {
        callerSide,
        isVictory,
        coinsEarned,
        shardsEarned,
        streakShard,
        priorStreak,
        newStreak,
      };
    });

    logger.info('Match rewards claimed', {
      match_id: matchId,
      uid,
      side: result.callerSide,
      is_victory: result.isVictory,
      coins_earned: result.coinsEarned,
      shards_earned: result.shardsEarned,
      streak_shard_granted: result.streakShard === 1,
      prior_wins_since_last_shard: result.priorStreak,
      new_wins_since_last_shard: result.newStreak,
    });

    return {
      success: true,
      coins_earned: result.coinsEarned,
      shards_earned: result.shardsEarned,
      is_victory: result.isVictory,
    };
  },
);
