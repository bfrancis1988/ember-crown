// functions/src/profile/deleteUserAccount.ts
// Phase 9.5C2: full account deletion. App Store / Play Store require an
// in-app delete-account flow that wipes both auth and stored data.
//
// Order of operations:
//   1. Subcollections (cards, slots, decks) — batched deletes per collection
//   2. Top-level player docs (profile, inventory, wallet, active_deck,
//      saved_decks, campaign_progress)
//   3. In-flight match sessions where this player is player_a — flagged
//      cancelled rather than deleted (preserves opponent's history if any)
//   4. Auth user — done LAST so a mid-run failure leaves the account
//      reachable for re-attempt rather than orphaned (auth gone, data
//      partially gone)
//
// Non-atomic by necessity (Firestore transactions cannot iterate
// subcollections). Worst case partial cleanup leaves orphan player_*
// docs that the auth user no longer references — Phase 10 monitoring can
// flag these for manual sweep.
//
// Caller is responsible for re-authenticating with password before
// calling — Firebase Auth requires recent sign-in for delete operations
// (the client-side reauthenticateWithCredential pattern in 9.5C3).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type DeleteUserAccountInput = Record<string, never>;
type DeleteUserAccountResult = { success: true };

async function deleteSubcollection(
  db: FirebaseFirestore.Firestore,
  collectionPath: string,
): Promise<number> {
  const snap = await db.collection(collectionPath).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

export const deleteUserAccount = onCall<
  DeleteUserAccountInput,
  Promise<DeleteUserAccountResult>
>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    logger.info('Deleting user account', { uid });

    // 1. Subcollections.
    const cardsDeleted = await deleteSubcollection(db, `player_inventories/${uid}/cards`);
    const slotsDeleted = await deleteSubcollection(db, `player_active_decks/${uid}/slots`);
    const decksDeleted = await deleteSubcollection(db, `player_saved_decks/${uid}/decks`);

    // 2. Top-level player docs.
    const cleanupBatch = db.batch();
    cleanupBatch.delete(db.collection('player_profiles').doc(uid));
    cleanupBatch.delete(db.collection('player_inventories').doc(uid));
    cleanupBatch.delete(db.collection('player_wallets').doc(uid));
    cleanupBatch.delete(db.collection('player_active_decks').doc(uid));
    cleanupBatch.delete(db.collection('player_saved_decks').doc(uid));
    cleanupBatch.delete(db.collection('player_campaign_progress').doc(uid));
    await cleanupBatch.commit();

    // 3. In-flight matches as player_a (player_b is always the bot in v1).
    const inFlightSnap = await db.collection('match_sessions')
      .where('player_a_id', '==', uid)
      .where('status', '==', 'in_progress')
      .get();
    if (!inFlightSnap.empty) {
      const matchBatch = db.batch();
      inFlightSnap.docs.forEach((doc) =>
        matchBatch.update(doc.ref, {
          status: 'cancelled',
          cancelled_reason: 'account_deleted',
          updated_at: FieldValue.serverTimestamp(),
        }),
      );
      await matchBatch.commit();
    }

    // 4. Auth user — last. After this, the client's onAuthStateChanged
    //    fires null and the app routes back to /login.
    await admin.auth().deleteUser(uid);

    logger.info('User account deleted', {
      uid,
      cards_deleted: cardsDeleted,
      slots_deleted: slotsDeleted,
      decks_deleted: decksDeleted,
      matches_cancelled: inFlightSnap.size,
    });

    return { success: true as const };
  },
);
