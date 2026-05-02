// src/lib/deckBuilder.ts
// Mutations for the Guild Hall (Phase 4). Tap-to-add and tap-to-remove are
// instant — no Save button — so each helper writes a single Firestore op.
// Validation happens client-side per call; the rules surface as thrown errors
// for the screen to display via Alert.

import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
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

  // New-format slot id: faction prefix + card id + index. Index is the next
  // available copy (which equals the current quantity_in_deck before insert).
  const factionUnderscored = factionId.replace(/ /g, '_');
  const slotId = `${factionUnderscored}_${cardId}_${quantityInDeck}`;

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
