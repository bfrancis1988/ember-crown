// functions/src/match/calculatePower.ts
// Pure power-math helpers — no Firestore. Easy to unit-test in isolation.

import { laneToLocationState, isLaneLocation, type LocationState } from '../types/board';
import type { Lane } from '../lib/matchConstants';
import type { MatchSession, Side } from '../types/match';

export type CardForPowerCalc = {
  instance_id: string;
  owner: Side;
  card_id: string;
  location_state: LocationState;
  current_power: number;
  base_power_bonus?: number;
};

export type CardLibraryDataForPowerCalc = {
  card_id: string;
  card_type: 'Unit' | 'Spell';
  base_power: number;
  optimal_lane?: Lane;
  optimal_lane_bonus?: number;
  faction?: string;
  keywords?: string[];
  keyword_params?: Record<string, unknown>;
};

type RallyParams = {
  boost?: number;
  scope?: 'lane' | 'global';
  faction_filter?: string;
  lane_filter?: Lane;
};

/**
 * Sum of rally bonuses applicable to `target` from other allied units in play.
 * Skips the rallying unit itself, the wrong side, and rallies whose
 * faction/lane filter excludes the target.
 */
function sumRallyBonus(
  target: CardForPowerCalc,
  targetData: CardLibraryDataForPowerCalc,
  allCards: CardForPowerCalc[],
  cardLibraryMap: Map<string, CardLibraryDataForPowerCalc>,
): number {
  if (!isLaneLocation(target.location_state)) return 0;
  let bonus = 0;
  for (const other of allCards) {
    if (other.instance_id === target.instance_id) continue;
    if (other.owner !== target.owner) continue;
    if (!isLaneLocation(other.location_state)) continue;
    const otherData = cardLibraryMap.get(other.card_id);
    if (!otherData) continue;
    if (!otherData.keywords?.includes('rally')) continue;

    const params = (otherData.keyword_params?.rally ?? {}) as RallyParams;
    const scope = params.scope ?? 'lane';
    if (scope === 'lane' && other.location_state !== target.location_state) continue;
    if (params.faction_filter && targetData.faction !== params.faction_filter) continue;
    if (params.lane_filter && laneToLocationState(params.lane_filter) !== target.location_state) {
      continue;
    }

    bonus += params.boost ?? 0;
  }
  return bonus;
}

/**
 * Computes new current_power for a single card.
 * Returns null if the card is not in a lane (hand/deck/discard).
 *
 * `allCards` and `cardLibraryMap` are required to evaluate Rally auras from
 * other units on the board. Pass an empty array if you don't care about rally
 * (e.g. unit-test for a single-card scenario).
 */
export function computeCardPower(
  card: CardForPowerCalc,
  cardData: CardLibraryDataForPowerCalc,
  session: MatchSession,
  allCards: CardForPowerCalc[] = [],
  cardLibraryMap: Map<string, CardLibraryDataForPowerCalc> = new Map(),
): number | null {
  if (!isLaneLocation(card.location_state)) return null;

  let power = cardData.base_power + (card.base_power_bonus ?? 0);

  if (cardData.card_type === 'Unit' && cardData.optimal_lane) {
    if (laneToLocationState(cardData.optimal_lane) === card.location_state) {
      power += cardData.optimal_lane_bonus ?? 2;
    }
  }

  // Rally aura from other allied units in play (Phase 9.4.2A).
  power += sumRallyBonus(card, cardData, allCards, cardLibraryMap);

  const debuffField = `${card.owner}_${card.location_state}_debuffed` as keyof MatchSession;
  if (session[debuffField] === true) {
    // Lane debuffs on player_a are applied by player_b (the bot) — strength
    // can be increased by boss rules. Lane debuffs on player_b are applied by
    // player_a (the human) — always default 2.
    const debuffStrength =
      card.owner === 'player_a' ? (session.bot_debuff_strength ?? 2) : 2;
    power -= debuffStrength;
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
    const newPower = computeCardPower(card, cardData, session, cards, cardLibraryMap);
    if (newPower === null) continue;
    if (newPower !== card.current_power) {
      updates.push({ instance_id: card.instance_id, new_power: newPower });
    }
  }
  return updates;
}
