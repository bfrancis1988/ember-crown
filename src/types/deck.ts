// src/types/deck.ts
// Shape of player_active_decks/{uid}/slots/{slot_id} docs. Each slot is one
// instance of a card in the active deck — duplicates of the same card_id are
// stored as separate slots with distinct slot_ids.

import { Timestamp } from 'firebase/firestore';
import type { FactionId } from '../lib/factions';

// `faction` was added in Phase 4. New slots always include it. Legacy slots
// from Phase 3 may be missing the field until the deck-builder hook lazy-
// migrates them — consumers should treat missing faction as 'Vanguard
// Kingdoms' for backward compat.
export type DeckSlot = {
  slot_id: string;
  card_id: string;
  faction: FactionId;
  added_at: Timestamp;
};
