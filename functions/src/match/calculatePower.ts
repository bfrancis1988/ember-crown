// functions/src/match/calculatePower.ts
// Pure power-math helpers — no Firestore. Easy to unit-test in isolation.

import { laneToLocationState, isLaneLocation, type LocationState } from '../types/board';
import type { Lane } from '../lib/matchConstants';
import type { MatchSession } from '../types/match';

export type CardForPowerCalc = {
  instance_id: string;
  owner: 'player_a' | 'player_b';
  card_id: string;
  location_state: LocationState;
  current_power: number;
};

export type CardLibraryDataForPowerCalc = {
  card_id: string;
  card_type: 'Unit' | 'Spell';
  base_power: number;
  optimal_lane?: Lane;
};

/**
 * Computes new current_power for a single card.
 * Returns null if the card is not in a lane (hand/deck/discard).
 */
export function computeCardPower(
  card: CardForPowerCalc,
  cardData: CardLibraryDataForPowerCalc,
  session: MatchSession,
): number | null {
  if (!isLaneLocation(card.location_state)) return null;

  let power = cardData.base_power;

  if (cardData.card_type === 'Unit' && cardData.optimal_lane) {
    if (laneToLocationState(cardData.optimal_lane) === card.location_state) {
      power += 2;
    }
  }

  const debuffField = `${card.owner}_${card.location_state}_debuffed` as keyof MatchSession;
  if (session[debuffField] === true) {
    power -= 2;
  }

  if (power < 0) power = 0;
  return power;
}

/**
 * For each card in a lane, returns { instance_id, new_power } only when new_power
 * differs from current_power. Cards not in a lane are skipped entirely.
 */
export function computePowerUpdates(
  cards: CardForPowerCalc[],
  cardLibraryMap: Map<string, CardLibraryDataForPowerCalc>,
  session: MatchSession,
): Array<{ instance_id: string; new_power: number }> {
  const updates: Array<{ instance_id: string; new_power: number }> = [];
  for (const card of cards) {
    const cardData = cardLibraryMap.get(card.card_id);
    if (!cardData) continue;
    const newPower = computeCardPower(card, cardData, session);
    if (newPower === null) continue;
    if (newPower !== card.current_power) {
      updates.push({ instance_id: card.instance_id, new_power: newPower });
    }
  }
  return updates;
}
