// functions/src/match/calculatePower.ts
// Pure power-math helpers — no Firestore. Easy to unit-test in isolation.

import { laneToLocationState, isLaneLocation, type LocationState } from '../types/board';
import type { Lane } from '../lib/matchConstants';
import type { MatchSession, Side } from '../types/match';
import type { PassiveContext } from './commanderPassives';

export type CardForPowerCalc = {
  instance_id: string;
  owner: Side;
  card_id: string;
  location_state: LocationState;
  current_power: number;
  base_power_bonus?: number;
  damage_taken?: number;
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
 *
 * `passiveContext` (Release 1.2.0) gates commander passive effects. Optional
 * — callers that don't pass it get pre-1.2 behaviour (no passive override).
 */
export function computeCardPower(
  card: CardForPowerCalc,
  cardData: CardLibraryDataForPowerCalc,
  session: MatchSession,
  allCards: CardForPowerCalc[] = [],
  cardLibraryMap: Map<string, CardLibraryDataForPowerCalc> = new Map(),
  passiveContext?: PassiveContext,
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
  if (session[debuffField] === true && !isIgnoringDebuffs(card, passiveContext)) {
    // Lane debuffs on player_a are applied by player_b (the bot) — strength
    // can be increased by boss rules. Lane debuffs on player_b are applied by
    // player_a (the human) — always default 2.
    const debuffStrength =
      card.owner === 'player_a' ? (session.bot_debuff_strength ?? 2) : 2;
    power -= debuffStrength;
  }

  // Update 1.0.7 — accumulated direct damage (Cleave) reduces effective power.
  // Stored on the doc so it survives every recalc; a raw current_power write
  // would be reverted by computePowerUpdates on the next trigger fire.
  power -= card.damage_taken ?? 0;

  if (power < 0) power = 0;
  return power;
}

/**
 * For each card in a lane, returns { instance_id, new_power } only when new_power
 * differs from current_power. Cards not in a lane are skipped entirely.
 *
 * `passiveContext` (Release 1.2.0) gates commander passive effects. Optional.
 *
 * Three-pass shape (added for apex_predator):
 *   1. Per-card base power including Rally + ignore_debuffs.
 *   2. apex_predator post-pass — for each side that has activated a Siege
 *      commander, find the currently highest-power friendly Siege unit
 *      and grant +2. Re-evaluated every recalc, so the buff moves as
 *      game state changes (Rally-style aura, not a stored bonus).
 *   3. Emit only the cards whose power differs from current_power.
 */
export function computePowerUpdates(
  cards: CardForPowerCalc[],
  cardLibraryMap: Map<string, CardLibraryDataForPowerCalc>,
  session: MatchSession,
  passiveContext?: PassiveContext,
): Array<{ instance_id: string; new_power: number }> {
  // Pass 1: compute base power (incl. Rally + ignore_debuffs) for every
  // card that has a library entry and sits in a lane.
  const computed = new Map<string, number>();
  for (const card of cards) {
    const cardData = cardLibraryMap.get(card.card_id);
    if (!cardData) continue;
    const newPower = computeCardPower(
      card,
      cardData,
      session,
      cards,
      cardLibraryMap,
      passiveContext,
    );
    if (newPower === null) continue;
    computed.set(card.instance_id, newPower);
  }

  // Pass 2: apex_predator. For each side with the flag set, pick the
  // currently highest-power friendly Siege unit and add +2.
  if (passiveContext) {
    for (const side of ['player_a', 'player_b'] as const) {
      const flag = `${side}_siege_apex_predator` as const;
      if (!passiveContext[flag]) continue;
      const apexId = pickApexPredatorTarget(side, cards, computed);
      if (apexId !== null) {
        // Non-null assertion safe: pickApexPredatorTarget only returns
        // ids present in `computed`.
        computed.set(apexId, computed.get(apexId)! + 2);
      }
    }
  }

  // Pass 3: emit deltas.
  const updates: Array<{ instance_id: string; new_power: number }> = [];
  for (const card of cards) {
    const newPower = computed.get(card.instance_id);
    if (newPower === undefined) continue;
    if (newPower !== card.current_power) {
      updates.push({ instance_id: card.instance_id, new_power: newPower });
    }
  }
  return updates;
}

// ---------- Commander passive: ignore_debuffs (Melee) ----------

// True when the card sits in its owner's Melee lane and that side has
// activated a Melee commander (commander.passive.type === 'ignore_debuffs').
// Used inside computeCardPower to bypass the lane-debuff power penalty.
function isIgnoringDebuffs(
  card: CardForPowerCalc,
  ctx: PassiveContext | undefined,
): boolean {
  if (!ctx) return false;
  if (card.location_state !== 'melee') return false;
  if (card.owner === 'player_a') return ctx.player_a_melee_ignore_debuffs;
  return ctx.player_b_melee_ignore_debuffs;
}

// ---------- Commander passive: apex_predator (Siege) ----------

/**
 * Pick the instance_id of the friendly Siege unit that should receive the
 * apex_predator +2 bonus for `side`. Returns null if no friendly Siege
 * unit has a computed power (e.g. empty board, no friendlies in Siege,
 * cards missing from card_library).
 *
 * Selection rule: highest computed power wins; ties broken by smaller
 * instance_id (lexicographic) so the choice is deterministic across
 * retries and bot/human replays.
 *
 * Exported so the apex_predator selection logic can be unit-tested
 * directly without spinning up the full computePowerUpdates pipeline.
 */
export function pickApexPredatorTarget(
  side: Side,
  cards: CardForPowerCalc[],
  computed: Map<string, number>,
): string | null {
  let winnerId: string | null = null;
  let winnerPower = -Infinity;
  for (const card of cards) {
    if (card.owner !== side) continue;
    if (card.location_state !== 'siege') continue;
    const p = computed.get(card.instance_id);
    if (p === undefined) continue;
    if (
      p > winnerPower ||
      (p === winnerPower && winnerId !== null && card.instance_id < winnerId)
    ) {
      winnerId = card.instance_id;
      winnerPower = p;
    }
  }
  return winnerId;
}
