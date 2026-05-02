// functions/src/match/claimMatchRewards.ts
// Callable: pays out wallet currency on game-over and marks {side}_claimed.
// One-time per side per match. AI bot side is never claimed (no wallet).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  MATCH_REWARD_COINS_MIN, MATCH_REWARD_COINS_MAX, MATCH_REWARD_COINS_LOSS,
  MATCH_REWARD_SHARDS_WIN, MATCH_REWARD_SHARDS_LOSS,
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
    const sessionSnap = await sessionRef.get();
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

    const callerVP = callerSide === 'player_a' ? session.player_a_wins : session.player_b_wins;
    const oppVP = callerSide === 'player_a' ? session.player_b_wins : session.player_a_wins;
    const isVictory = callerVP > oppVP;

    const coinsEarned = isVictory
      ? Math.floor(Math.random() * (MATCH_REWARD_COINS_MAX - MATCH_REWARD_COINS_MIN + 1)) + MATCH_REWARD_COINS_MIN
      : MATCH_REWARD_COINS_LOSS;
    const shardsEarned = isVictory ? MATCH_REWARD_SHARDS_WIN : MATCH_REWARD_SHARDS_LOSS;

    // Wallet should exist (created during onboarding); defensive create if missing.
    const walletRef = db.collection('player_wallets').doc(uid);
    const walletSnap = await walletRef.get();
    if (!walletSnap.exists) {
      logger.warn('Wallet missing during claim; creating', { uid });
      await walletRef.set({
        player_id: uid,
        coins: coinsEarned,
        shards: shardsEarned,
        keys: 0,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    } else {
      const wallet = walletSnap.data()!;
      await walletRef.update({
        coins: (wallet.coins || 0) + coinsEarned,
        shards: (wallet.shards || 0) + shardsEarned,
        updated_at: FieldValue.serverTimestamp(),
      });
    }

    await sessionRef.update({
      [claimedFlag]: true,
      updated_at: FieldValue.serverTimestamp(),
    });

    logger.info('Match rewards claimed', {
      match_id: matchId,
      uid,
      side: callerSide,
      is_victory: isVictory,
      coins_earned: coinsEarned,
      shards_earned: shardsEarned,
    });

    return {
      success: true,
      coins_earned: coinsEarned,
      shards_earned: shardsEarned,
      is_victory: isVictory,
    };
  },
);
