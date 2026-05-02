// SHARED CONSTANTS — keep src/lib/tutorialDecks.ts and functions/src/lib/tutorialDecks.ts identical.
// If you change one, change the other.
//
// Tutorial decks for player and bot. Hand-selected to teach mechanics.
// Player deck: 15 cards, balanced units + 1 curse + 1 cleanse for Beat 4.
// Bot deck: 12 cards, units only, predictable plays.
//
// All card_ids verified against scripts/seed-data/Card_Library.csv (Vanguard).

import type { Lane } from './matchConstants';

export const TUTORIAL_PLAYER_DECK_CARD_IDS: string[] = [
  'UNT-VAN-01', 'UNT-VAN-01', 'UNT-VAN-01', // 3x Vanguard Knight (Melee, P4)
  'UNT-VAN-02', 'UNT-VAN-02', 'UNT-VAN-02', // 3x Shield-Bearer (Melee, P3)
  'UNT-VAN-04', 'UNT-VAN-04', 'UNT-VAN-04', // 3x Royal Archer (Ranged, P3)
  'UNT-VAN-05', 'UNT-VAN-05',               // 2x Field Medic (Ranged, P2)
  'UNT-VAN-03', 'UNT-VAN-03',               // 2x Infantry Pikeman (Melee, P3)
  'SPL-VAN-01',                             // 1x Arrow Volley (Curse, Lane_1=Melee)
  'SPL-VAN-CLN',                            // 1x Holy Light (Cleanse)
];
// Total: 15 cards

export const TUTORIAL_BOT_DECK_CARD_IDS: string[] = [
  'UNT-VAN-01', 'UNT-VAN-01',
  'UNT-VAN-02', 'UNT-VAN-02',
  'UNT-VAN-04', 'UNT-VAN-04',
  'UNT-VAN-03',
  'UNT-VAN-05',
  'UNT-VAN-01', 'UNT-VAN-02', 'UNT-VAN-04',
  'UNT-VAN-05',
];
// Total: 12 cards (bot deck is intentionally smaller; tutorial only).

export const TUTORIAL_BOT_COMMANDER_ID = 'CMD-VAN-01'; // Vanguard General — Melee

export type ScriptedAction =
  | { action: 'play_card'; card_id: string; lane: Lane }
  | { action: 'pass' };

export const TUTORIAL_BOT_SCRIPTED_ACTIONS: ScriptedAction[] = [
  // Round 1
  { action: 'play_card', card_id: 'UNT-VAN-01', lane: 'Melee' },
  { action: 'play_card', card_id: 'UNT-VAN-04', lane: 'Ranged' },
  { action: 'pass' },
  // Round 2
  { action: 'play_card', card_id: 'UNT-VAN-02', lane: 'Melee' },
  { action: 'play_card', card_id: 'UNT-VAN-01', lane: 'Ranged' },
  { action: 'pass' },
  // Round 3 — bot plays one then passes; player can use commander/cleanse.
  { action: 'play_card', card_id: 'UNT-VAN-03', lane: 'Melee' },
  { action: 'pass' },
];
