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
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
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

// Switching the active faction routes through the setActiveFaction Cloud
// Function (Phase 9.4.4-fix). The function validates the requested faction
// is in the player's union of unlocked_factions ∪ solo_unlocked_factions,
// then atomically updates active_faction and clears selected_commander
// (so the Guild Hall doesn't briefly render a commander tile from the
// previous faction).
//
// The firestore.rules clause that locks active_faction to null → non-null
// transitions blocks direct client writes after onboarding; the Cloud
// Function bypasses rules via the Admin SDK.
//
// uid is unused (the function takes the caller's auth.uid) but kept in the
// signature so existing call sites don't need to change.
export async function setActiveFaction(
  _uid: string,
  factionId: FactionId,
): Promise<void> {
  const fn = httpsCallable<
    { faction_id: string },
    { success: true; active_faction: string }
  >(functions, 'setActiveFaction');
  await fn({ faction_id: factionId });
}
