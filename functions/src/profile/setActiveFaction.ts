// functions/src/profile/setActiveFaction.ts
// Phase 9.4.4-fix: server-side faction switch.
//
// firestore.rules locks active_faction to null → non-null transitions only
// (a Phase 7.1 design that expected switching to move server-side). This
// function completes that design: validates that the requested faction is
// in the player's union of campaign-unlocked and threshold-unlocked
// factions, then performs the update via the Admin SDK (which bypasses
// rules).
//
// Mirrors the prior client-side helper's side effects: also clears
// selected_commander so the Guild Hall doesn't render a stale tile from
// the previous faction.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type SetActiveFactionInput = { faction_id: string };

type SetActiveFactionResult = {
  success: true;
  active_faction: string;
};

export const setActiveFaction = onCall<SetActiveFactionInput, Promise<SetActiveFactionResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const { faction_id: factionId } = request.data;

    if (!factionId || typeof factionId !== 'string') {
      throw new HttpsError('invalid-argument', 'faction_id is required.');
    }

    const db = admin.firestore();
    const profileRef = db.collection('player_profiles').doc(uid);

    await db.runTransaction(async (tx) => {
      const profileSnap = await tx.get(profileRef);
      if (!profileSnap.exists) {
        throw new HttpsError('not-found', 'Profile not found.');
      }
      const profile = profileSnap.data()!;

      const campaignUnlocked = (profile.unlocked_factions ?? []) as string[];
      const soloUnlocked = (profile.solo_unlocked_factions ?? []) as string[];
      const allUnlocked = new Set<string>([...campaignUnlocked, ...soloUnlocked]);

      if (!allUnlocked.has(factionId)) {
        throw new HttpsError(
          'permission-denied',
          `Faction "${factionId}" is not unlocked.`,
        );
      }

      tx.update(profileRef, {
        active_faction: factionId,
        selected_commander: null,
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    logger.info('Active faction changed', { uid, faction_id: factionId });

    return { success: true as const, active_faction: factionId };
  },
);
