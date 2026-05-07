// functions/src/lib/computeDeckPower.ts
// Server-side mirror of src/lib/computeDeckPower.ts. Same formula, same
// constants. Splitting per environment because the client variant imports
// from src/types/card while the server reads card_library directly via
// Admin SDK and only needs the rarity field.

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
  cardLibrary: Map<string, { rarity: string }>,
  commander: { base_power: number },
): number {
  let cardPoints = 0;
  for (const cardId of cardIds) {
    const card = cardLibrary.get(cardId);
    if (!card) continue;
    cardPoints += RARITY_POINTS[card.rarity] ?? 0;
  }
  const commanderPoints = (commander.base_power ?? 0) * COMMANDER_POWER_MULTIPLIER;
  return cardPoints + commanderPoints;
}
