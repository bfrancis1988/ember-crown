// functions/src/onboarding/completeOnboardingFn.ts
// Callable: finalizes new-player onboarding. Atomically provisions the
// player's wallet, starter inventory (one doc per card_id), and 15-slot
// active deck for the chosen faction, then advances onboarding_step 3 → 4.
//
// Replaces the prior client-side writeBatch implementation
// (src/lib/completeOnboarding.ts D10.5). A Firestore transaction guarantees
// true atomicity, and the dual idempotency layer (wallet + slots) is
// preserved so duplicate invocations are safe.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Mirror of the client's STARTER_SETS. Duplicated for now; Phase 6 may
// promote this to a shared package if more starter content is added.
const VANGUARD_STARTER = [
  { card_id: 'UNT-VAN-01', quantity: 3 },
  { card_id: 'UNT-VAN-02', quantity: 3 },
  { card_id: 'UNT-VAN-03', quantity: 3 },
  { card_id: 'UNT-VAN-04', quantity: 3 },
  { card_id: 'UNT-VAN-05', quantity: 2 },
  { card_id: 'SPL-VAN-CLN', quantity: 1 },
];

const STARTER_SETS: Record<string, typeof VANGUARD_STARTER> = {
  'Vanguard Kingdoms': VANGUARD_STARTER,
};

type CompleteOnboardingInput = {
  factionId: string;
};

type CompleteOnboardingResult = {
  success: true;
  onboarding_step: 4;
};

export const completeOnboardingFn = onCall<CompleteOnboardingInput, Promise<CompleteOnboardingResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const { factionId } = request.data;

    if (!factionId) {
      throw new HttpsError('invalid-argument', 'factionId is required.');
    }
    const starterSet = STARTER_SETS[factionId];
    if (!starterSet) {
      throw new HttpsError('invalid-argument', `No starter set for faction: ${factionId}`);
    }

    const db = admin.firestore();
    const profileRef = db.collection('player_profiles').doc(uid);
    const walletRef = db.collection('player_wallets').doc(uid);
    const slotsCol = db.collection('player_active_decks').doc(uid).collection('slots');

    await db.runTransaction(async (tx) => {
      const profileSnap = await tx.get(profileRef);
      if (!profileSnap.exists) {
        throw new HttpsError('failed-precondition', 'Player profile not found.');
      }
      const profile = profileSnap.data()!;

      if (profile.onboarding_step !== 3) {
        // Idempotent: if already advanced, return without changes.
        if (profile.onboarding_step >= 4) {
          logger.info('completeOnboardingFn: already completed', {
            uid,
            step: profile.onboarding_step,
          });
          return;
        }
        throw new HttpsError(
          'failed-precondition',
          `Cannot complete onboarding from step ${profile.onboarding_step}.`
        );
      }

      const walletSnap = await tx.get(walletRef);
      if (walletSnap.exists) {
        // Wallet already exists — provisioning previously ran. Just advance step.
        tx.update(profileRef, {
          onboarding_step: 4,
          updated_at: FieldValue.serverTimestamp(),
        });
        logger.info('completeOnboardingFn: skipping provision (wallet exists), step advanced', { uid });
        return;
      }

      // Paranoid second layer: catch the TOCTOU window where wallet write
      // hadn't started but slot writes had.
      const slotsSnap = await tx.get(slotsCol.limit(1));
      if (!slotsSnap.empty) {
        tx.update(profileRef, {
          onboarding_step: 4,
          updated_at: FieldValue.serverTimestamp(),
        });
        logger.info('completeOnboardingFn: skipping provision (slots exist), step advanced', { uid });
        return;
      }

      const factionUnderscored = factionId.replace(/ /g, '_');

      tx.set(walletRef, {
        player_id: uid,
        coins: 0,
        shards: 0,
        keys: 0,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      const inventoryCol = db.collection('player_inventories').doc(uid).collection('cards');
      for (const entry of starterSet) {
        const cardRef = inventoryCol.doc(entry.card_id);
        tx.set(cardRef, {
          card_id: entry.card_id,
          quantity_owned: entry.quantity,
          acquired_at: FieldValue.serverTimestamp(),
        });
      }

      for (const entry of starterSet) {
        for (let i = 0; i < entry.quantity; i++) {
          const slotId = `${factionUnderscored}_${entry.card_id}_${i}`;
          const slotRef = slotsCol.doc(slotId);
          tx.set(slotRef, {
            slot_id: slotId,
            card_id: entry.card_id,
            faction: factionId,
            added_at: FieldValue.serverTimestamp(),
          });
        }
      }

      tx.update(profileRef, {
        onboarding_step: 4,
        unlocked_factions: [factionId],
        tutorial_reward_claimed: false,
        updated_at: FieldValue.serverTimestamp(),
      });

      logger.info('completeOnboardingFn: provisioned', {
        uid,
        factionId,
        starter_card_count: starterSet.reduce((s, e) => s + e.quantity, 0),
      });
    });

    return { success: true, onboarding_step: 4 };
  }
);
