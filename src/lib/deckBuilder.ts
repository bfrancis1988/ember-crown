// src/lib/deckBuilder.ts
// Mutations for the Guild Hall (Phase 4). Tap-to-add and tap-to-remove are
// instant — no Save button — so each helper writes a single Firestore op.
// Validation happens client-side per call; the rules surface as thrown errors
// for the screen to display via Alert.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { FactionId } from './factions';

const DECK_SIZE = 15;

export async function addCardToDeck(
  uid: string,
  factionId: FactionId,
  cardId: string,
  currentDeckSize: number,
  quantityOwned: number,
  quantityInDeck: number
): Promise<void> {
  if (currentDeckSize >= DECK_SIZE) {
    throw new Error('Deck is full.');
  }
  if (quantityInDeck >= quantityOwned) {
    throw new Error('No more copies available.');
  }

  const factionUnderscored = factionId.replace(/ /g, '_');
  const prefix = `${factionUnderscored}_${cardId}_`;

  // Find the smallest unused index for this card_id. Using quantityInDeck as
  // the index would collide after a non-tail remove (e.g. removing _1 leaves
  // _0, _2; quantityInDeck=2 picks _2 and setDoc overwrites it silently).
  const slotsCol = collection(db, 'player_active_decks', uid, 'slots');
  const existing = await getDocs(query(slotsCol, where('card_id', '==', cardId)));
  const usedIndices = new Set<number>();
  existing.forEach((d) => {
    if (d.id.startsWith(prefix)) {
      const n = parseInt(d.id.slice(prefix.length), 10);
      if (Number.isFinite(n)) usedIndices.add(n);
    }
  });
  let i = 0;
  while (usedIndices.has(i)) i++;
  const slotId = `${prefix}${i}`;

  const slotRef = doc(db, 'player_active_decks', uid, 'slots', slotId);
  await setDoc(slotRef, {
    slot_id: slotId,
    card_id: cardId,
    faction: factionId,
    added_at: serverTimestamp(),
  });
}

export async function removeCardFromDeck(uid: string, slotId: string): Promise<void> {
  const slotRef = doc(db, 'player_active_decks', uid, 'slots', slotId);
  await deleteDoc(slotRef);
}

export async function setActiveCommander(
  uid: string,
  commanderId: string
): Promise<void> {
  const profileRef = doc(db, 'player_profiles', uid);
  await updateDoc(profileRef, {
    selected_commander: commanderId,
    updated_at: serverTimestamp(),
  });
}

// Switching the active faction also clears selected_commander so the Guild Hall
// doesn't briefly render a commander tile from the previous faction. The
// CommanderPicker re-fetches on factionId change and the player picks a
// commander from the new faction.
export async function setActiveFaction(
  uid: string,
  factionId: FactionId
): Promise<void> {
  const profileRef = doc(db, 'player_profiles', uid);
  await updateDoc(profileRef, {
    active_faction: factionId,
    selected_commander: null,
    updated_at: serverTimestamp(),
  });
}
