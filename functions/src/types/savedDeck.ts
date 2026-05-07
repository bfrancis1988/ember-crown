// SHARED TYPE — keep src/types/savedDeck.ts and functions/src/types/savedDeck.ts identical
// (only the Timestamp import path differs: 'firebase/firestore' vs 'firebase-admin/firestore').

import type { Timestamp } from 'firebase-admin/firestore';

export type SavedDeckSlotNumber = 1 | 2 | 3;

export type SavedDeck = {
  deck_id: string;
  name: string;
  faction: string;
  commander_id: string;
  slot_number: SavedDeckSlotNumber;
  card_ids: string[];
  power_score: number;
  battle_mode_eligible: boolean;
  source_player_uid: string;
  created_at: Timestamp;
  updated_at: Timestamp;
};
