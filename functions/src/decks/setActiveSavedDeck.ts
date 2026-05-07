// functions/src/decks/setActiveSavedDeck.ts
// Phase 9.4.5B: callable that sets player_profiles.active_saved_deck_id.
//
// firestore.rules allows owner profile updates only on a small allowlist
// (username, selected_commander, active_faction, onboarding_step,
// updated_at) — adding active_saved_deck_id to that list would be
// permissive without server validation that the deck exists and is owned by
// the caller. Routing through a callable keeps the validation server-side
// and avoids loosening the allowlist further.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type SetActiveSavedDeckInput = { deck_id: string };

type SetActiveSavedDeckResult = {
  success: true;
  deck_id: string;
  faction: string;
  commander_id: string;
};

export const setActiveSavedDeck = onCall<SetActiveSavedDeckInput, Promise<SetActiveSavedDeckResult>>(
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

    const result = await db.runTransaction(async (tx) => {
      const deckSnap = await tx.get(deckRef);
      if (!deckSnap.exists) {
        throw new HttpsError('not-found', `Deck ${deckId} not found.`);
      }
      const deck = deckSnap.data()!;
      if (deck.source_player_uid !== uid) {
        throw new HttpsError('permission-denied', 'Cannot select another player\'s deck.');
      }

      // Also align the player's active faction + selected commander with
      // the deck so screens that still read profile.active_faction /
      // selected_commander stay coherent.
      tx.update(profileRef, {
        active_saved_deck_id: deckId,
        active_faction: deck.faction,
        selected_commander: deck.commander_id,
        updated_at: FieldValue.serverTimestamp(),
      });

      return {
        deck_id: deckId,
        faction: deck.faction as string,
        commander_id: deck.commander_id as string,
      };
    });

    logger.info('Active saved deck set', {
      uid,
      deck_id: result.deck_id,
      faction: result.faction,
    });

    return { success: true as const, ...result };
  },
);
