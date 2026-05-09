// functions/src/onboarding/completeTutorial.ts
// Callable: marks the tutorial complete and pays out the deferred Phase 3
// economy reward (100 coins + 1 shard + 1 key). Called either from the
// tutorial match's MatchCompleteOverlay (skipped: false) or from the Skip
// Tutorial button on the entry screen (skipped: true).
//
// Idempotent via the tutorial_completed flag: a second call throws
// 'failed-precondition' so wallet credit cannot be granted twice.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const TUTORIAL_REWARD_COINS = 100;
const TUTORIAL_REWARD_SHARDS = 1;
const TUTORIAL_REWARD_KEYS = 1;

type CompleteTutorialInput = { skipped?: boolean };

type CompleteTutorialResult = {
  success: true;
  coins_earned: number;
  shards_earned: number;
  keys_earned: number;
  skipped: boolean;
};

export const completeTutorial = onCall<CompleteTutorialInput, Promise<CompleteTutorialResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const skipped = request.data?.skipped ?? false;

    const db = admin.firestore();

    const result = await db.runTransaction(async (tx) => {
      const profileRef = db.collection('player_profiles').doc(uid);
      const walletRef = db.collection('player_wallets').doc(uid);

      const profileSnap = await tx.get(profileRef);
      if (!profileSnap.exists) {
        throw new HttpsError('failed-precondition', 'Profile not found.');
      }
      const profile = profileSnap.data()!;

      if (profile.tutorial_completed === true) {
        throw new HttpsError('failed-precondition', 'Tutorial already completed.');
      }

      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new HttpsError('failed-precondition', 'Wallet not found.');
      }

      tx.update(walletRef, {
        coins: FieldValue.increment(TUTORIAL_REWARD_COINS),
        shards: FieldValue.increment(TUTORIAL_REWARD_SHARDS),
        keys: FieldValue.increment(TUTORIAL_REWARD_KEYS),
        updated_at: FieldValue.serverTimestamp(),
      });

      tx.update(profileRef, {
        tutorial_completed: true,
        updated_at: FieldValue.serverTimestamp(),
      });

      return {
        success: true as const,
        coins_earned: TUTORIAL_REWARD_COINS,
        shards_earned: TUTORIAL_REWARD_SHARDS,
        keys_earned: TUTORIAL_REWARD_KEYS,
        skipped,
      };
    });

    logger.info('Tutorial completed', {
      uid,
      skipped: result.skipped,
      coins_earned: result.coins_earned,
      shards_earned: result.shards_earned,
      keys_earned: result.keys_earned,
    });

    return result;
  },
);
