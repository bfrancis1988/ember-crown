// src/lib/starterSets.ts
// Per-faction starter card sets granted at the end of onboarding.
// Card IDs verified against the live card_library collection on 2026-04-30
// via scripts/verify-starter-ids.ts.

import type { FactionId } from './factions';

export type StarterSetEntry = {
  card_id: string;
  quantity: number;
};

// Vanguard Kingdoms starter — 15 cards total. Mostly common rarity, with one
// uncommon (UNT-VAN-01 Vanguard Knight). Mix of melee, ranged, healer, and a
// cleanse spell.
export const VANGUARD_STARTER: StarterSetEntry[] = [
  { card_id: 'UNT-VAN-01', quantity: 3 },  // Vanguard Knight (Uncommon, Melee)
  { card_id: 'UNT-VAN-02', quantity: 3 },  // Shield-Bearer (Common, Melee)
  { card_id: 'UNT-VAN-03', quantity: 3 },  // Infantry Pikeman (Common, Melee)
  { card_id: 'UNT-VAN-04', quantity: 3 },  // Royal Archer (Common, Ranged)
  { card_id: 'UNT-VAN-05', quantity: 2 },  // Field Medic (Common, Healer)
  { card_id: 'SPL-VAN-CLN', quantity: 1 }, // Holy Light (Common, Cleanse)
];

// TODO: Phase 7 (campaign) will populate the other 5 factions' starter sets
// when their campaigns ship.
export const STARTER_SETS: Partial<Record<FactionId, StarterSetEntry[]>> = {
  'Vanguard Kingdoms': VANGUARD_STARTER,
};
