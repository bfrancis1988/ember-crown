// functions/src/__tests__/match/ritual.test.ts
//
// Update 1.0.7 — regression tests for the Ritual keyword fix.
//
// Bug: applyRitualOnPlay wrote the sacrifice power gain to current_power on
// the played card, but the post-play recalc recomputes current_power from
// base + bonuses via computeCardPower — reverting the gain every time. The
// fix routes the gain through `base_power_bonus` (the field computeCardPower
// reads, same as Veteran).

import {
  computeCardPower,
  computePowerUpdates,
  type CardForPowerCalc,
  type CardLibraryDataForPowerCalc,
} from '../../match/calculatePower';
import { applyRitualOnPlay } from '../../match/keywordEffects';
import type { MatchSession } from '../../types/match';

// No lane debuffs set — the debuff branch of computeCardPower stays inert.
const SESSION = {} as MatchSession;

function unitLib(card_id: string, base_power: number): CardLibraryDataForPowerCalc {
  return { card_id, card_type: 'Unit', base_power };
}

// ---- minimal Firestore fake (collection/where/get + doc, and a batch) ----

type FakeDoc = Record<string, any>;

function makeFakeDb(docs: FakeDoc[]): any {
  const byId = new Map<string, FakeDoc>(docs.map((d) => [d.instance_id, d]));

  const makeRef = (id: string) => ({
    id,
    get: async () => ({ exists: byId.has(id), data: () => byId.get(id) }),
  });

  return {
    collection: () => {
      const filters: Array<[string, string, unknown]> = [];
      const query: any = {
        where(field: string, op: string, value: unknown) {
          filters.push([field, op, value]);
          return query;
        },
        get: async () => {
          const matched = [...byId.values()].filter((doc) =>
            filters.every(([f, op, v]) =>
              op === 'in' ? (v as unknown[]).includes(doc[f]) : doc[f] === v,
            ),
          );
          return {
            empty: matched.length === 0,
            docs: matched.map((doc) => ({
              data: () => doc,
              ref: makeRef(doc.instance_id),
            })),
          };
        },
        doc: (id: string) => makeRef(id),
      };
      return query;
    },
  };
}

function makeFakeBatch() {
  const writes: Array<{ id: string; data: FakeDoc }> = [];
  const batch: any = {
    update: (ref: { id: string }, data: FakeDoc) => {
      writes.push({ id: ref.id, data });
    },
  };
  return { batch, writes };
}

describe('Ritual — power gain persists past a power recalc', () => {
  test('computeCardPower includes base_power_bonus (the field Ritual writes)', () => {
    const card: CardForPowerCalc = {
      instance_id: 'r1',
      owner: 'player_a',
      card_id: 'c_ritualist',
      location_state: 'melee',
      current_power: 9,
      base_power_bonus: 5,
    };
    // base 4 + ritual gain 5 → 9
    expect(computeCardPower(card, unitLib('c_ritualist', 4), SESSION)).toBe(9);
  });

  test('recalc keeps the Ritual gain (computePowerUpdates yields no delta)', () => {
    // Post-Ritual state: base 4, gain 5 → base_power_bonus 5, current_power 9.
    const card: CardForPowerCalc = {
      instance_id: 'r1',
      owner: 'player_a',
      card_id: 'c_ritualist',
      location_state: 'melee',
      current_power: 9,
      base_power_bonus: 5,
    };
    const lib = new Map([['c_ritualist', unitLib('c_ritualist', 4)]]);
    expect(computePowerUpdates([card], lib, SESSION)).toEqual([]);
  });

  test('regression contrast: gain in current_power alone gets reverted (the 1.0.6 bug)', () => {
    // Pre-1.0.7 bug shape — gain lived only in current_power, no base_power_bonus.
    const card: CardForPowerCalc = {
      instance_id: 'r1',
      owner: 'player_a',
      card_id: 'c_ritualist',
      location_state: 'melee',
      current_power: 9, // gain not in any recalc-read field
    };
    const lib = new Map([['c_ritualist', unitLib('c_ritualist', 4)]]);
    expect(computePowerUpdates([card], lib, SESSION)).toEqual([
      { instance_id: 'r1', new_power: 4 }, // reverted to bare base
    ]);
  });
});

describe('applyRitualOnPlay — sacrifice + power transfer', () => {
  test('optional_single sacrifices the target and stages the gain on base_power_bonus', async () => {
    const sacrifice = {
      instance_id: 's1',
      match_id: 'm1',
      owner: 'player_a',
      card_id: 'c_ally',
      current_power: 6,
      location_state: 'melee',
    };
    const db = makeFakeDb([sacrifice]);
    const { batch, writes } = makeFakeBatch();

    const result = await applyRitualOnPlay({
      matchId: 'm1',
      callerSide: 'player_a',
      playedLane: 'Melee',
      playedInstanceId: 'p1',
      playedCardLib: {
        card_id: 'c_ritualist',
        base_power: 4,
        keywords: ['ritual'],
        keyword_params: { ritual: { mode: 'optional_single' } },
      },
      sacrificeTargetInstanceId: 's1',
      db,
      batch,
    });

    expect(result?.sacrificed).toEqual(['s1']);
    expect(result?.power_gain).toBe(6);

    // Sacrificed ally is removed from the board.
    const sacWrite = writes.find((w) => w.id === 's1');
    expect(sacWrite?.data.location_state).toBe('discard');
    expect(sacWrite?.data.current_power).toBe(0);

    // Played card gain lands on base_power_bonus, NOT current_power.
    const playedWrite = writes.find((w) => w.id === 'p1');
    expect(playedWrite).toBeDefined();
    expect(playedWrite!.data.base_power_bonus).toBeDefined(); // FieldValue.increment(6)
    expect(playedWrite!.data.current_power).toBeUndefined();
  });

  test('all_in_lane sacrifices every other allied unit in the played lane', async () => {
    const ally1 = {
      instance_id: 'a1',
      match_id: 'm1',
      owner: 'player_a',
      card_id: 'c_x',
      current_power: 3,
      location_state: 'siege',
    };
    const ally2 = {
      instance_id: 'a2',
      match_id: 'm1',
      owner: 'player_a',
      card_id: 'c_y',
      current_power: 5,
      location_state: 'siege',
    };
    const db = makeFakeDb([ally1, ally2]);
    const { batch, writes } = makeFakeBatch();

    const result = await applyRitualOnPlay({
      matchId: 'm1',
      callerSide: 'player_a',
      playedLane: 'Siege',
      playedInstanceId: 'p1',
      playedCardLib: {
        card_id: 'c_ritualist',
        base_power: 4,
        keywords: ['ritual'],
        keyword_params: { ritual: { mode: 'all_in_lane', power_per_sacrifice: 2 } },
      },
      sacrificeTargetInstanceId: null,
      db,
      batch,
    });

    expect(result?.sacrificed.sort()).toEqual(['a1', 'a2']);
    expect(result?.power_gain).toBe(4); // 2 sacrifices × 2

    expect(writes.find((w) => w.id === 'a1')?.data.location_state).toBe('discard');
    expect(writes.find((w) => w.id === 'a2')?.data.location_state).toBe('discard');

    const playedWrite = writes.find((w) => w.id === 'p1');
    expect(playedWrite?.data.base_power_bonus).toBeDefined();
  });
});
