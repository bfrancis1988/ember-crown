// functions/src/__tests__/match/passives/apexPredator.test.ts
//
// Release 1.2.0 — apex_predator commander passive (Siege commanders).
// Once a Siege commander has been activated, +2 power goes to whichever
// friendly Siege unit currently has the highest computed power. Re-
// evaluated on every recalc, so the bonus "moves" as the board changes.
// Ties are broken by ascending instance_id for determinism across retries.

import {
  computePowerUpdates,
  pickApexPredatorTarget,
  type CardForPowerCalc,
  type CardLibraryDataForPowerCalc,
} from '../../../match/calculatePower';
import { buildPassiveContext } from '../../../match/commanderPassives';
import type { MatchSession } from '../../../types/match';

const SESSION = {} as MatchSession;

function unitLib(card_id: string, base_power: number): CardLibraryDataForPowerCalc {
  return { card_id, card_type: 'Unit', base_power };
}

function siege(
  instance_id: string,
  owner: 'player_a' | 'player_b',
  card_id: string,
  current_power: number,
): CardForPowerCalc {
  return { instance_id, owner, card_id, location_state: 'siege', current_power };
}

// ---------- pickApexPredatorTarget (selection rule unit tests) ----------

describe('pickApexPredatorTarget — selection rule', () => {
  test('single friendly Siege unit is selected', () => {
    const cards = [siege('u1', 'player_a', 'c5', 5)];
    const computed = new Map([['u1', 5]]);
    expect(pickApexPredatorTarget('player_a', cards, computed)).toBe('u1');
  });

  test('among multiple friendlies, the highest-power one wins', () => {
    const cards = [
      siege('u1', 'player_a', 'c4', 4),
      siege('u2', 'player_a', 'c7', 7),
      siege('u3', 'player_a', 'c5', 5),
    ];
    const computed = new Map([
      ['u1', 4],
      ['u2', 7],
      ['u3', 5],
    ]);
    expect(pickApexPredatorTarget('player_a', cards, computed)).toBe('u2');
  });

  test('ties broken by smaller instance_id (deterministic)', () => {
    // Both tied at 6; "u1" < "u2" lexicographically.
    const cards = [
      siege('u2', 'player_a', 'c6', 6),
      siege('u1', 'player_a', 'c6', 6),
    ];
    const computed = new Map([
      ['u1', 6],
      ['u2', 6],
    ]);
    expect(pickApexPredatorTarget('player_a', cards, computed)).toBe('u1');
  });

  test('tie-break is order-independent (re-orderings produce the same winner)', () => {
    const computed = new Map([
      ['u1', 6],
      ['u2', 6],
      ['u3', 6],
    ]);
    const a = [
      siege('u3', 'player_a', 'c6', 6),
      siege('u1', 'player_a', 'c6', 6),
      siege('u2', 'player_a', 'c6', 6),
    ];
    const b = [
      siege('u1', 'player_a', 'c6', 6),
      siege('u2', 'player_a', 'c6', 6),
      siege('u3', 'player_a', 'c6', 6),
    ];
    expect(pickApexPredatorTarget('player_a', a, computed)).toBe('u1');
    expect(pickApexPredatorTarget('player_a', b, computed)).toBe('u1');
  });

  test('only friendly units are considered (opponent siege ignored)', () => {
    const cards = [
      siege('u1', 'player_a', 'c4', 4),
      siege('u2', 'player_b', 'c9', 9), // enemy with higher power — ignored
    ];
    const computed = new Map([
      ['u1', 4],
      ['u2', 9],
    ]);
    expect(pickApexPredatorTarget('player_a', cards, computed)).toBe('u1');
  });

  test('only Siege-lane units are considered (other lanes ignored)', () => {
    const cards: CardForPowerCalc[] = [
      { instance_id: 'm1', owner: 'player_a', card_id: 'c9', location_state: 'melee', current_power: 9 },
      siege('s1', 'player_a', 'c4', 4),
    ];
    const computed = new Map([
      ['m1', 9],
      ['s1', 4],
    ]);
    expect(pickApexPredatorTarget('player_a', cards, computed)).toBe('s1');
  });

  test('no friendly Siege units → null (no-op, no crash)', () => {
    const cards = [siege('u1', 'player_b', 'c9', 9)]; // only enemy siege
    const computed = new Map([['u1', 9]]);
    expect(pickApexPredatorTarget('player_a', cards, computed)).toBeNull();
  });

  test('empty cards array → null', () => {
    expect(pickApexPredatorTarget('player_a', [], new Map())).toBeNull();
  });

  test('siege card missing from computed map is skipped', () => {
    // u1 present in cards but not in computed (e.g. card_library miss);
    // u2 is the only one apex can land on.
    const cards = [
      siege('u1', 'player_a', 'c_missing', 0),
      siege('u2', 'player_a', 'c5', 5),
    ];
    const computed = new Map([['u2', 5]]);
    expect(pickApexPredatorTarget('player_a', cards, computed)).toBe('u2');
  });
});

// ---------- computePowerUpdates — end-to-end apex_predator integration ----------

describe('apex_predator via computePowerUpdates', () => {
  test('single Siege unit: gets +2 in the delta output', () => {
    const cards = [siege('u1', 'player_a', 'c5', 5)];
    const lib = new Map([['c5', unitLib('c5', 5)]]);
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    // Without passive: 5 == current 5 → no delta.
    expect(computePowerUpdates(cards, lib, SESSION)).toEqual([]);
    // With passive: 5 + 2 = 7, delta from 5.
    expect(computePowerUpdates(cards, lib, SESSION, ctx)).toEqual([
      { instance_id: 'u1', new_power: 7 },
    ]);
  });

  test('multiple Siege units: only the highest receives +2', () => {
    const cards = [
      siege('u1', 'player_a', 'c4', 4),
      siege('u2', 'player_a', 'c7', 7),
      siege('u3', 'player_a', 'c5', 5),
    ];
    const lib = new Map([
      ['c4', unitLib('c4', 4)],
      ['c7', unitLib('c7', 7)],
      ['c5', unitLib('c5', 5)],
    ]);
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    // Only u2 (the highest) gets the +2; u1/u3 are unchanged.
    expect(computePowerUpdates(cards, lib, SESSION, ctx)).toEqual([
      { instance_id: 'u2', new_power: 9 },
    ]);
  });

  test('ties: deterministic — smaller instance_id receives the +2', () => {
    const cards = [
      siege('u2', 'player_a', 'c6', 6),
      siege('u1', 'player_a', 'c6', 6),
    ];
    const lib = new Map([['c6', unitLib('c6', 6)]]);
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    // u1 wins tie-break; u2 stays at 6 (no delta because current === new).
    expect(computePowerUpdates(cards, lib, SESSION, ctx)).toEqual([
      { instance_id: 'u1', new_power: 8 },
    ]);
  });

  test('bilateral: both sides activated their Siege commander, each apex is independent', () => {
    // Brad's bilateral ask: two sides simultaneously firing the same
    // passive — verify both winners get their +2 and selections don't
    // cross sides.
    const cards = [
      siege('a1', 'player_a', 'c5', 5),
      siege('a2', 'player_a', 'c3', 3),
      siege('b1', 'player_b', 'c4', 4),
      siege('b2', 'player_b', 'c6', 6),
    ];
    const lib = new Map([
      ['c3', unitLib('c3', 3)],
      ['c4', unitLib('c4', 4)],
      ['c5', unitLib('c5', 5)],
      ['c6', unitLib('c6', 6)],
    ]);
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'apex_predator', lane: 'Siege' },
      player_b: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    const updates = computePowerUpdates(cards, lib, SESSION, ctx);
    // a1 (power 5) is player_a's apex → 7. b2 (power 6) is player_b's
    // apex → 8. a2 and b1 unchanged.
    expect(updates.sort((x, y) => x.instance_id.localeCompare(y.instance_id))).toEqual([
      { instance_id: 'a1', new_power: 7 },
      { instance_id: 'b2', new_power: 8 },
    ]);
  });

  test('buff moves with game state: the apex jumps when powers shift between recalcs', () => {
    // Recalc 1 — u1 is the apex by current state.
    const cardsR1 = [
      siege('u1', 'player_a', 'c8', 8),
      siege('u2', 'player_a', 'c5', 5),
    ];
    const libR1 = new Map([
      ['c8', unitLib('c8', 8)],
      ['c5', unitLib('c5', 5)],
    ]);
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    // u1 was already showing 8, gets +2 → 10. u2 stays 5.
    expect(computePowerUpdates(cardsR1, libR1, SESSION, ctx)).toEqual([
      { instance_id: 'u1', new_power: 10 },
    ]);

    // Recalc 2 — a curse or damage drops u1's base power below u2's. The
    // apex bonus jumps to u2, and u1 loses its +2.
    const cardsR2 = [
      // u1's card_id changed (simulate replacement, or imagine the library
      // entry now resolves a lower base for that card). Simpler: pretend
      // u1's underlying lib value moved down to 2 for this recalc.
      siege('u1', 'player_a', 'c_low', 10), // current_power still 10 from last recalc
      siege('u2', 'player_a', 'c5', 5),     // unchanged
    ];
    const libR2 = new Map([
      ['c_low', unitLib('c_low', 2)],
      ['c5', unitLib('c5', 5)],
    ]);
    // Now u2 (base 5) is the apex; u2 → 7. u1's base is 2 (no apex bonus),
    // so it should be written down from current 10 to 2.
    const r2 = computePowerUpdates(cardsR2, libR2, SESSION, ctx);
    expect(r2.sort((x, y) => x.instance_id.localeCompare(y.instance_id))).toEqual([
      { instance_id: 'u1', new_power: 2 },
      { instance_id: 'u2', new_power: 7 },
    ]);
  });

  test('no friendly Siege units → no-op, no crash', () => {
    // player_a has Siege apex_predator activated but only has Melee units
    // on the board. Should produce no apex-related deltas (and not throw).
    const cards: CardForPowerCalc[] = [
      { instance_id: 'm1', owner: 'player_a', card_id: 'c5', location_state: 'melee', current_power: 5 },
    ];
    const lib = new Map([['c5', unitLib('c5', 5)]]);
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    expect(computePowerUpdates(cards, lib, SESSION, ctx)).toEqual([]);
  });

  test('empty board with apex activated → no updates, no crash', () => {
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'apex_predator', lane: 'Siege' },
      player_b: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    expect(computePowerUpdates([], new Map(), SESSION, ctx)).toEqual([]);
  });

  test('opponent’s apex_predator does not buff my Siege units', () => {
    // Only player_b has apex_predator active. player_a's Siege unit gets
    // nothing; player_b's Siege unit gets the +2.
    const cards = [
      siege('a1', 'player_a', 'c9', 9), // player_a's strongest siege
      siege('b1', 'player_b', 'c4', 4),
    ];
    const lib = new Map([
      ['c9', unitLib('c9', 9)],
      ['c4', unitLib('c4', 4)],
    ]);
    const ctx = buildPassiveContext({
      player_b: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    expect(computePowerUpdates(cards, lib, SESSION, ctx)).toEqual([
      { instance_id: 'b1', new_power: 6 },
    ]);
  });

  test('apex_predator does not crash when passive context is omitted', () => {
    // Backward compat: pre-1.2 callers can skip passiveContext entirely.
    const cards = [siege('u1', 'player_a', 'c5', 5)];
    const lib = new Map([['c5', unitLib('c5', 5)]]);
    expect(computePowerUpdates(cards, lib, SESSION)).toEqual([]);
  });
});
