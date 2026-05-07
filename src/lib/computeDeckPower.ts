// src/lib/computeDeckPower.ts
// Phase 9.4.5: pure helper for computing a deck's power score. Used both at
// save time (server-authoritative, in functions/src/decks/saveDeck.ts via
// the mirror in functions/src/lib/computeDeckPower.ts) and at edit time in
// the Guild Hall deck builder for live feedback.
//
// Sums per-card rarity points + (commander base_power × 2). A missing card
// in the library map contributes 0 — defensive against stale references; in
// practice the server validates that all cards exist before saving.

import type { CardLibraryEntry } from '../types/card';

export const RARITY_POINTS: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 4,
  Epic: 8,
  Legendary: 15,
};

export const COMMANDER_POWER_MULTIPLIER = 2;

export function computeDeckPower(
  cardIds: string[],
  cardLibrary: Record<string, Pick<CardLibraryEntry, 'rarity'>> | Map<string, Pick<CardLibraryEntry, 'rarity'>>,
  commander: { base_power: number },
): number {
  const lookup = (id: string): Pick<CardLibraryEntry, 'rarity'> | undefined => {
    return cardLibrary instanceof Map ? cardLibrary.get(id) : cardLibrary[id];
  };
  let cardPoints = 0;
  for (const cardId of cardIds) {
    const card = lookup(cardId);
    if (!card) continue;
    cardPoints += RARITY_POINTS[card.rarity] ?? 0;
  }
  const commanderPoints = (commander.base_power ?? 0) * COMMANDER_POWER_MULTIPLIER;
  return cardPoints + commanderPoints;
}
