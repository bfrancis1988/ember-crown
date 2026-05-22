// functions/src/__tests__/match/cleave.test.ts
//
// Update 1.0.7 — regression tests for the Cleave keyword fix.
//
// Bug: applyCleaveOnPlay wrote damage straight to current_power, but the
// power recalc that fires immediately after every play recomputes
// current_power from base + bonuses via computeCardPower — which reverted
// non-lethal Cleave damage. The fix routes damage through `damage_taken`,
// a field computeCardPower subtracts.

import {
  computeCardPower,
  computePowerUpdates,
  type CardForPowerCalc,
  type CardLibraryDataForPowerCalc,
} from '../../match/calculatePower';
import { applyCleaveOnPlay } from '../../match/keywordEffects';
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

describe('Cleave — non-lethal damage persists past a power recalc', () => {
  test('computeCardPower subtracts damage_taken from base power', () => {
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_b',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 4,
      damage_taken: 3,
    };
    // base 7, took 3 → 4
    expect(computeCardPower(card, unitLib('c_grunt', 7), SESSION)).toBe(4);
  });

  test('recalc does NOT revert a Cleaved unit (computePowerUpdates yields no delta)', () => {
    // Post-Cleave state: base 7, took 3 damage → current_power 4, damage_taken 3.
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_b',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 4,
      damage_taken: 3,
    };
    const lib = new Map([['c_grunt', unitLib('c_grunt', 7)]]);
    // 7 - 3 === 4, already correct → recalc produces no revert.
    expect(computePowerUpdates([card], lib, SESSION)).toEqual([]);
  });

  test('regression contrast: WITHOUT damage_taken the recalc reverts to base (the 1.0.6 bug)', () => {
    // Pre-1.0.7 bug shape — damage lived only in current_power.
    const card: CardForPowerCalc = {
      instance_id: 'u1',
      owner: 'player_b',
      card_id: 'c_grunt',
      location_state: 'melee',
      current_power: 4, // damaged value, but damage_taken absent
    };
    const lib = new Map([['c_grunt', unitLib('c_grunt', 7)]]);
    expect(computePowerUpdates([card], lib, SESSION)).toEqual([
      { instance_id: 'u1', new_power: 7 }, // damage wiped
    ]);
  });
});

describe('applyCleaveOnPlay — staged writes', () => {
  test('non-lethal hit stages reduced current_power AND a damage_taken increment', async () => {
    const enemy = {
      instance_id: 'e1',
      match_id: 'm1',
      owner: 'player_b',
      card_id: 'c_tank',
      current_power: 7,
      location_state: 'melee',
    };
    const db = makeFakeDb([enemy]);
    const { batch, writes } = makeFakeBatch();

    const result = await applyCleaveOnPlay({
      matchId: 'm1',
      callerSide: 'player_a',
      playedLane: 'Ranged', // adjacent → Melee + Siege
      playedCardLib: {
        card_id: 'c_cleaver',
        card_type: 'Unit',
        base_power: 6,
        keywords: ['cleave'],
        keyword_params: { cleave: { damage: 5 } },
      },
      db,
      batch,
    });

    expect(result?.targets_hit).toEqual(['e1']);

    const w = writes.find((x) => x.id === 'e1');
    expect(w).toBeDefined();
    expect(w!.data.current_power).toBe(2); // 7 - 5
    expect(w!.data.damage_taken).toBeDefined(); // FieldValue.increment(5) sentinel
    expect(w!.data.location_state).toBeUndefined(); // survived — not discarded
  });

  test('lethal hit (damage >= power) still discards the unit', async () => {
    const enemy = {
      instance_id: 'e1',
      match_id: 'm1',
      owner: 'player_b',
      card_id: 'c_runt',
      current_power: 3,
      location_state: 'melee',
    };
    const db = makeFakeDb([enemy]);
    const { batch, writes } = makeFakeBatch();

    await applyCleaveOnPlay({
      matchId: 'm1',
      callerSide: 'player_a',
      playedLane: 'Ranged',
      playedCardLib: {
        card_id: 'c_cleaver',
        card_type: 'Unit',
        base_power: 6,
        keywords: ['cleave'],
        keyword_params: { cleave: { damage: 5 } },
      },
      db,
      batch,
    });

    const w = writes.find((x) => x.id === 'e1');
    expect(w).toBeDefined();
    expect(w!.data.location_state).toBe('discard');
    expect(w!.data.current_power).toBe(0);
  });
});
