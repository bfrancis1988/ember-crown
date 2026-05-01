// src/types/deck.ts
// Shape of player_active_decks/{uid}/slots/{slot_id} docs. Each slot is one
// instance of a card in the active deck — duplicates of the same card_id are
// stored as separate slots with distinct slot_ids.

import { Timestamp } from 'firebase/firestore';

export type DeckSlot = {
  slot_id: string;
  card_id: string;
  added_at: Timestamp;
};
