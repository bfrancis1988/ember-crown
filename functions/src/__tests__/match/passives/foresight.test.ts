// functions/src/__tests__/match/passives/foresight.test.ts
//
// Release 1.2.0 — foresight commander passive (Ranged commanders).
// Once a Ranged commander has been activated, that side draws +1 card at
// the start of every subsequent round. Round-1 timing is structural: the
// initial hand is dealt by initializeNewMatch, which never consults
// passives, so foresight only ever applies at the round-2 / round-3
// advance handled in executeEndRound.

import {
  buildPassiveContext,
  emptyPassiveContext,
  foresightBonusFor,
} from '../../../match/commanderPassives';

describe('foresight — Ranged commander passive', () => {
  test('foresightBonusFor returns 1 when the side has the flag', () => {
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'foresight', lane: 'Ranged' },
    });
    expect(foresightBonusFor('player_a', ctx)).toBe(1);
  });

  test('foresightBonusFor returns 0 when the side lacks the flag', () => {
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'foresight', lane: 'Ranged' },
    });
    // player_b never activated → no bonus on their draws.
    expect(foresightBonusFor('player_b', ctx)).toBe(0);
  });

  test('returns 0 for an entirely empty context (no commanders activated)', () => {
    expect(foresightBonusFor('player_a', emptyPassiveContext())).toBe(0);
    expect(foresightBonusFor('player_b', emptyPassiveContext())).toBe(0);
  });

  test('bilateral: both sides activated a Ranged commander → both get +1', () => {
    // Brad's bilateral-case ask: confirm the resolver/flag layout stays
    // correct when the same passive fires on both sides simultaneously.
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'foresight', lane: 'Ranged' },
      player_b: { passive_type: 'foresight', lane: 'Ranged' },
    });
    expect(foresightBonusFor('player_a', ctx)).toBe(1);
    expect(foresightBonusFor('player_b', ctx)).toBe(1);
  });

  test('Melee commander activated → no foresight bonus (wrong passive type)', () => {
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'ignore_debuffs', lane: 'Melee' },
    });
    expect(foresightBonusFor('player_a', ctx)).toBe(0);
  });

  test('Siege commander activated → no foresight bonus (wrong passive type)', () => {
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'apex_predator', lane: 'Siege' },
    });
    expect(foresightBonusFor('player_a', ctx)).toBe(0);
  });
});

// Integration shape: the call site in executeEndRound is
//   const drawCount = Math.min(baseDraw + foresight, deckArr.length);
// where baseDraw is END_ROUND_DRAW_COUNT (+ bot_extra_round_draw for the
// bot side) and foresight is foresightBonusFor(side, passiveContext).
// The tests below confirm the math without spinning up a Firestore fake
// for the full executeEndRound flow.

describe('foresight — combined with base draw math', () => {
  const END_ROUND_DRAW_COUNT = 2; // matches matchConstants

  function computeDraw(
    side: 'player_a' | 'player_b',
    ctx: ReturnType<typeof emptyPassiveContext>,
    opts: { bot_extra_round_draw?: number; deck_remaining: number },
  ): number {
    const base =
      side === 'player_b'
        ? END_ROUND_DRAW_COUNT + (opts.bot_extra_round_draw ?? 0)
        : END_ROUND_DRAW_COUNT;
    const bonus = foresightBonusFor(side, ctx);
    return Math.min(base + bonus, opts.deck_remaining);
  }

  test('player_a with foresight draws 3 instead of 2 when deck has cards', () => {
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'foresight', lane: 'Ranged' },
    });
    expect(computeDraw('player_a', ctx, { deck_remaining: 10 })).toBe(3);
  });

  test('player_a without foresight draws the standard 2', () => {
    expect(
      computeDraw('player_a', emptyPassiveContext(), { deck_remaining: 10 }),
    ).toBe(2);
  });

  test('foresight stacks with bot_extra_round_draw on player_b', () => {
    // Boss-rule bot already draws +1 (3 total); foresight makes it 4.
    const ctx = buildPassiveContext({
      player_b: { passive_type: 'foresight', lane: 'Ranged' },
    });
    expect(
      computeDraw('player_b', ctx, { bot_extra_round_draw: 1, deck_remaining: 20 }),
    ).toBe(4);
  });

  test('deck floor: foresight never draws past available deck', () => {
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'foresight', lane: 'Ranged' },
    });
    // Only 1 card left in deck — clamped to 1 despite base+foresight = 3.
    expect(computeDraw('player_a', ctx, { deck_remaining: 1 })).toBe(1);
  });

  test('empty deck: both sides draw 0 even with foresight', () => {
    const ctx = buildPassiveContext({
      player_a: { passive_type: 'foresight', lane: 'Ranged' },
      player_b: { passive_type: 'foresight', lane: 'Ranged' },
    });
    expect(computeDraw('player_a', ctx, { deck_remaining: 0 })).toBe(0);
    expect(computeDraw('player_b', ctx, { deck_remaining: 0 })).toBe(0);
  });
});
