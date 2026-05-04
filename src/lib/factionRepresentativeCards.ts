// src/lib/factionRepresentativeCards.ts
// 9.3F: each faction tile on the campaign hub uses one card from that faction
// as its background art (rendered at low opacity behind a faction-color tint).
// These are placeholders pending v1.1 dedicated faction banner art — swap to
// dedicated asset URLs (or read from a faction_assets collection) by changing
// just this map.
//
// Card_id picks favor visual presence: a Rare where one exists for the faction,
// otherwise a strong-themed Uncommon.

import type { FactionId } from './factions';

export const FACTION_REPRESENTATIVE_CARDS: Record<FactionId, string> = {
  'Vanguard Kingdoms': 'rare_vanguard_high_paladin',
  'Iron Pact': 'UNT-IRO-08',           // Siege Golem
  'Arborea Kingdom': 'rare_arborean_spellweaver',
  'Ashen Swarm': 'UNT-ASH-08',         // Bone Colossus
  'Obsidian Empire': 'UNT-OBS-08',     // Inferno Drake
  'Feral Hollow': 'rare_feral_blood_shaman',
};

// Faction color hex → rgba so callers can tint the rep-card art with a
// translucent overlay. Returns black at the requested alpha if the input
// isn't a 6-char hex (defensive — every entry in FACTIONS today is #RRGGBB).
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
