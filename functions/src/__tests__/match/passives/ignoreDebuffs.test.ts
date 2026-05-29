// functions/src/__tests__/match/passives/ignoreDebuffs.test.ts
//
// Release 1.2.0 — ignore_debuffs commander passive (Melee commanders).
// Activating a Melee commander causes the owner's Melee lane to ignore
// the lane-debuff power penalty for the rest of the match.

import {
  computeCardPower,
  computePowerUpdates,
  type CardForPowerCalc,
  type CardLibraryDataForPowerCalc,
} from '../../../match/calculatePower';
import { buildPassiveContext } from '../../../match/commanderPassives';
import type { MatchSession } from '../../../types/match';

function unitLib(card_id: string, base_power: number): CardLibraryDataForPowerCalc {
  return { card_id, card_type: 'Unit', base_power };
}

// Session with player_a's Melee lane debuffed (the standard scenario the
// passive is supposed to negate). bot_debuff_strength defaults to 2 when
// undefined, so a debuffed melee card with base 5 sits at 3 with no passive.
const SESSION_A_MELEE_DEBUFFED = {
  player_a_melee_debuffed: true,
} as unknown as MatchSession;

const SESSION_B_MELEE_DEBUFFED = {
  player_b_melee_debuffed: true,
} as unknown as MatchSession;

describe('ignore_debuffs — Melee commander passive', () => {
  test('with passive active, debuffed Melee card keeps full base power', () => {
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_a',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 5,
    };
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'ignore_debuffs', lane: 'Melee' },
    });
    // Base 5, debuff 2 would normally drop to 3; passive bypasses it.
    expect(
      computeCardPower(card, unitLib('c_grunt', 5), SESSION_A_MELEE_DEBUFFED, [], new Map(), ctx),
    ).toBe(5);
  });

  test('without passive context, debuff still applies (baseline regression)', () => {
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_a',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 3,
    };
    // No passive context passed at all → pre-1.2 behaviour, debuff lands.
    expect(
      computeCardPower(card, unitLib('c_grunt', 5), SESSION_A_MELEE_DEBUFFED),
    ).toBe(3);
  });

  test('passive flag for player_a does not protect player_b', () => {
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_b',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 3,
    };
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'ignore_debuffs', lane: 'Melee' },
    });
    // Only player_a's flag is set; player_b's debuffed melee card still
    // pays the penalty.
    expect(
      computeCardPower(card, unitLib('c_grunt', 5), SESSION_B_MELEE_DEBUFFED, [], new Map(), ctx),
    ).toBe(3);
  });

  test('passive only protects the Melee lane, not Ranged or Siege', () => {
    const ranged: CardForPowerCalc = {
      instance_id: 'r1',
      owner: 'player_a',
      card_id: 'c_archer',
      location_state: 'ranged',
      current_power: 3,
    };
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'ignore_debuffs', lane: 'Melee' },
    });
    const sessionRangedDebuffed = {
      player_a_ranged_debuffed: true,
    } as unknown as MatchSession;
    // Base 5, Ranged debuff 2, passive irrelevant → 3.
    expect(
      computeCardPower(ranged, unitLib('c_archer', 5), sessionRangedDebuffed, [], new Map(), ctx),
    ).toBe(3);
  });

  test('boss-strength debuff is also bypassed when the passive is active', () => {
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_a',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 5,
    };
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'ignore_debuffs', lane: 'Melee' },
    });
    const bossSession = {
      player_a_melee_debuffed: true,
      bot_debuff_strength: 4, // boss rule — would normally drop a base-5 unit to 1
    } as unknown as MatchSession;
    expect(
      computeCardPower(card, unitLib('c_grunt', 5), bossSession, [], new Map(), ctx),
    ).toBe(5);
  });

  test('computePowerUpdates threads the passive context through to per-card calc', () => {
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_a',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 3, // pre-passive state: debuffed value on the doc
    };
    const lib = new Map([['c_grunt', unitLib('c_grunt', 5)]]);
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'ignore_debuffs', lane: 'Melee' },
    });
    // Without ctx: 5 - 2 = 3, same as current_power → no delta.
    expect(computePowerUpdates([card], lib, SESSION_A_MELEE_DEBUFFED)).toEqual([]);
    // With ctx: 5 ignored debuff → 5, delta from 3.
    expect(computePowerUpdates([card], lib, SESSION_A_MELEE_DEBUFFED, ctx)).toEqual([
      { instance_id: 'u1', new_power: 5 },
    ]);
  });

  test('passive context with no flags set is equivalent to no context', () => {
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_a',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 3,
    };
    // Empty per-side input → all flags false → debuff still applies.
    const ctx = buildPassiveContext({});
    expect(
      computeCardPower(card, unitLib('c_grunt', 5), SESSION_A_MELEE_DEBUFFED, [], new Map(), ctx),
    ).toBe(3);
  });
});
