// src/lib/savedDeckHelpers.ts
// Phase 9.4.5: client-side wrappers for the saved-deck callables. Keeps
// invocation details out of UI components. All validation is server-side
// (saveDeck.ts / deleteSavedDeck.ts / setActiveSavedDeck.ts) — these
// helpers exist purely to centralize the httpsCallable plumbing.

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { SavedDeckSlotNumber } from '../types/savedDeck';

export type SaveDeckPayload = {
  deck_id?: string | null;
  slot_number: SavedDeckSlotNumber;
  name: string;
  faction: string;
  commander_id: string;
  card_ids: string[];
};

export type SaveDeckResult = {
  success: true;
  deck_id: string;
  power_score: number;
};

export async function callSaveDeck(payload: SaveDeckPayload): Promise<SaveDeckResult> {
  const fn = httpsCallable<SaveDeckPayload, SaveDeckResult>(functions, 'saveDeck');
  const r = await fn(payload);
  return r.data;
}

export async function callDeleteSavedDeck(deckId: string): Promise<void> {
  const fn = httpsCallable<{ deck_id: string }, { success: true; deck_id: string }>(
    functions,
    'deleteSavedDeck',
  );
  await fn({ deck_id: deckId });
}

export type SetActiveSavedDeckResult = {
  success: true;
  deck_id: string;
  faction: string;
  commander_id: string;
};

export async function callSetActiveSavedDeck(
  deckId: string,
): Promise<SetActiveSavedDeckResult> {
  const fn = httpsCallable<{ deck_id: string }, SetActiveSavedDeckResult>(
    functions,
    'setActiveSavedDeck',
  );
  const r = await fn({ deck_id: deckId });
  return r.data;
}

/**
 * Replace the contents of player_active_decks/{uid}/slots with the given
 * card_ids. Used by SavedDecksList "Use This Deck" so the live editing
 * buffer stays in sync with whichever saved deck the player has chosen
 * (match flow continues to read player_active_decks/slots in v1; the
 * saved deck is the source of truth, and the buffer mirrors it).
 *
 * Rules already permit owner writes to player_active_decks/{uid}/slots/*.
 * Could move to a Cloud Function in Phase 9.5 if rules tighten.
 */
export async function syncActiveDeckBuffer(
  uid: string,
  faction: string,
  cardIds: string[],
): Promise<void> {
  const slotsCol = collection(db, 'player_active_decks', uid, 'slots');
  const existing = await getDocs(slotsCol);

  // Up to 15 deletes + 15 writes = 30 ops, well under the 500 batch limit.
  const batch = writeBatch(db);
  existing.forEach((d) => batch.delete(d.ref));
  const factionUnderscored = faction.replace(/ /g, '_');
  const seen = new Map<string, number>();
  cardIds.forEach((cardId) => {
    const idx = seen.get(cardId) ?? 0;
    seen.set(cardId, idx + 1);
    const slotId = `${factionUnderscored}_${cardId}_${idx}`;
    batch.set(doc(db, 'player_active_decks', uid, 'slots', slotId), {
      slot_id: slotId,
      card_id: cardId,
      faction,
      added_at: serverTimestamp(),
    });
  });
  await batch.commit();
}
