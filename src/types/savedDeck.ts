// SHARED TYPE — keep src/types/savedDeck.ts and functions/src/types/savedDeck.ts identical
// (only the Timestamp import path differs: 'firebase/firestore' vs 'firebase-admin/firestore').
//
// Phase 9.4.5: each player owns up to 3 saved decks per faction, stored at
// player_saved_decks/{uid}/decks/{deck_id}. The previously-singleton
// "active deck" (player_active_decks/{uid}/slots) becomes slot 1 of this
// collection. The deck the player has currently selected for matches is
// referenced by player_profiles.active_saved_deck_id.

import type { Timestamp } from 'firebase/firestore';
import type { FactionId } from '../lib/factions';

export type SavedDeckSlotNumber = 1 | 2 | 3;

export type SavedDeck = {
  deck_id: string;
  name: string;
  faction: FactionId;
  commander_id: string;
  slot_number: SavedDeckSlotNumber;
  // 15 entries; duplicates allowed up to the 4-copy max.
  card_ids: string[];
  // Computed at save time via src/lib/computeDeckPower.ts. Stored on the doc
  // so Battle Mode matchmaking can range-query without reading card_library.
  power_score: number;
  // Server-side opt-in flag. Defaults true; flips false if the player turns
  // off Battle Mode sharing in Settings (toggle ships in Phase 9.5).
  battle_mode_eligible: boolean;
  source_player_uid: string;
  created_at: Timestamp;
  updated_at: Timestamp;
};
