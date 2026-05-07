// functions/src/decks/deleteSavedDeck.ts
// Phase 9.4.5A: callable for deleting a saved deck. Slot 1 is protected per
// faction — it's effectively the player's "active" loadout for that faction
// even when they have no other slots set up. To remove a slot 1 the player
// would need to overwrite it with a new build (the deck builder UI handles
// that flow).
//
// Slot numbers are not renumbered after delete; gaps are allowed (e.g.
// deleting slot 2 leaves slots 1 and 3, which is fine).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type DeleteSavedDeckInput = { deck_id: string };

type DeleteSavedDeckResult = { success: true; deck_id: string };

export const deleteSavedDeck = onCall<DeleteSavedDeckInput, Promise<DeleteSavedDeckResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const deckId = request.data?.deck_id;
    if (typeof deckId !== 'string' || deckId.length === 0) {
      throw new HttpsError('invalid-argument', 'deck_id is required.');
    }

    const db = admin.firestore();
    const deckRef = db
      .collection('player_saved_decks')
      .doc(uid)
      .collection('decks')
      .doc(deckId);
    const profileRef = db.collection('player_profiles').doc(uid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(deckRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', `Deck ${deckId} not found.`);
      }
      const deck = snap.data()!;
      if (deck.source_player_uid !== uid) {
        throw new HttpsError('permission-denied', 'Cannot delete another player\'s deck.');
      }
      if (deck.slot_number === 1) {
        throw new HttpsError(
          'failed-precondition',
          'Cannot delete slot 1. Overwrite it with a new build instead.',
        );
      }

      // If this deck is the player's selected active deck, clear the
      // pointer so the next match falls back to slot 1 of the active
      // faction (resolved client-side via getActiveSavedDeck).
      const profileSnap = await tx.get(profileRef);
      const activeDeckId =
        profileSnap.exists ? (profileSnap.data()?.active_saved_deck_id as string | undefined) : undefined;

      tx.delete(deckRef);

      if (activeDeckId === deckId) {
        tx.update(profileRef, {
          active_saved_deck_id: FieldValue.delete(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    });

    logger.info('Deleted saved deck', { uid, deck_id: deckId });

    return { success: true as const, deck_id: deckId };
  },
);
