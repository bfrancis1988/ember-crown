// Release 1.2.0 — commander passive ability resolution.
//
// Three lane-templated passives, all gated on the commander having been
// activated this match (player_X_commander_used = true, sticky). Once
// activated, the passive stays in force for the rest of the match — the
// per-round active_lane flag is cleared at every round end and is not the
// right indicator for these.
//
// Passive types (matching commander_library.passive.type from
// scripts/seed-firestore.ts:passiveForLane):
//
//   ignore_debuffs (Melee commander)
//     The owner's Melee lane ignores the lane-debuff power penalty.
//     Applied continuously inside calculatePower.computeCardPower.
//
//   foresight (Ranged commander)
//     +1 to the round-start hand-out at the start of rounds 2 and 3.
//     Applied in executeEndRound's round-advance branch.
//
//   apex_predator (Siege commander)
//     +2 to the currently highest-power friendly unit in the Siege lane,
//     re-evaluated on every power recalc (Rally-style aura). Applied as a
//     post-pass inside calculatePower.computePowerUpdates.
//
// Resolver pattern:
//   resolvePassiveContext(session, db) reads up to two commander_library
//   docs (one per side, only if that side has activated) and returns a
//   typed flag set. Callers take PassiveContext as an optional parameter
//   so pre-1.2 callers and unit tests stay valid without modification.

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { Lane } from '../lib/matchConstants';
import type { MatchSession, Side } from '../types/match';

export type PassiveType = 'ignore_debuffs' | 'foresight' | 'apex_predator';

// One flag per (side, passive). Closed shape so an unknown passive can't
// silently read undefined; missing flags default to false in EMPTY.
export type PassiveContext = {
  player_a_melee_ignore_debuffs: boolean;
  player_a_ranged_foresight: boolean;
  player_a_siege_apex_predator: boolean;
  player_b_melee_ignore_debuffs: boolean;
  player_b_ranged_foresight: boolean;
  player_b_siege_apex_predator: boolean;
};

const EMPTY: PassiveContext = {
  player_a_melee_ignore_debuffs: false,
  player_a_ranged_foresight: false,
  player_a_siege_apex_predator: false,
  player_b_melee_ignore_debuffs: false,
  player_b_ranged_foresight: false,
  player_b_siege_apex_predator: false,
};

// Map a (side, passive type, commander lane) to the corresponding flag.
// Returns null if the combination doesn't map — e.g. a passive type whose
// lane doesn't match what was seeded (shouldn't happen with the current
// passiveForLane seeder, but defensive).
function flagKeyFor(
  side: Side,
  passiveType: PassiveType,
  lane: Lane,
): keyof PassiveContext | null {
  if (passiveType === 'ignore_debuffs' && lane === 'Melee') {
    return `${side}_melee_ignore_debuffs`;
  }
  if (passiveType === 'foresight' && lane === 'Ranged') {
    return `${side}_ranged_foresight`;
  }
  if (passiveType === 'apex_predator' && lane === 'Siege') {
    return `${side}_siege_apex_predator`;
  }
  return null;
}

export function emptyPassiveContext(): PassiveContext {
  return { ...EMPTY };
}

// Pure helper for unit tests — builds a context from a fully resolved
// per-side passive descriptor without needing a Firestore fake.
export function buildPassiveContext(per: {
  player_a?: { passive_type: PassiveType; lane: Lane };
  player_b?: { passive_type: PassiveType; lane: Lane };
}): PassiveContext {
  const ctx = emptyPassiveContext();
  if (per.player_a) {
    const k = flagKeyFor('player_a', per.player_a.passive_type, per.player_a.lane);
    if (k) ctx[k] = true;
  }
  if (per.player_b) {
    const k = flagKeyFor('player_b', per.player_b.passive_type, per.player_b.lane);
    if (k) ctx[k] = true;
  }
  return ctx;
}

// ---------- foresight (Ranged commander) ----------
//
// Returns the number of extra cards a side draws at round-start because
// of an active Ranged commander. Always 0 or 1 today; structured as a
// function so future foresight params (e.g. higher-tier commanders) can
// extend without changing the call site in executeEndRound.
//
// Round-1 timing is handled at the call site, not here: executeEndRound's
// round-advance branch only ever advances into rounds 2 or 3 (the
// initial round-1 hand is dealt by initializeNewMatch, which never calls
// this), so the "Rounds 2 and 3 only" rule is structural.
export function foresightBonusFor(side: Side, ctx: PassiveContext): number {
  const flag = `${side}_ranged_foresight` as const;
  return ctx[flag] ? 1 : 0;
}

export async function resolvePassiveContext(
  session: MatchSession,
  db: Firestore,
): Promise<PassiveContext> {
  // Short-circuit: no commander activated → no passive effects, no
  // commander_library reads.
  const aUsed = session.player_a_commander_used === true;
  const bUsed = session.player_b_commander_used === true;
  if (!aUsed && !bUsed) return emptyPassiveContext();

  const refs: Array<{ side: Side; commander_id: string }> = [];
  if (aUsed && session.player_a_commander_id) {
    refs.push({ side: 'player_a', commander_id: session.player_a_commander_id });
  }
  if (bUsed && session.player_b_commander_id) {
    refs.push({ side: 'player_b', commander_id: session.player_b_commander_id });
  }
  if (refs.length === 0) return emptyPassiveContext();

  const docRefs = refs.map((r) => db.collection('commander_library').doc(r.commander_id));
  const snaps = await db.getAll(...docRefs);

  const ctx = emptyPassiveContext();
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i];
    if (!snap.exists) {
      logger.warn('resolvePassiveContext: commander_library doc not found', {
        commander_id: refs[i].commander_id,
        side: refs[i].side,
      });
      continue;
    }
    const data = snap.data()!;
    const lane = data.lane as Lane | undefined;
    const passive = data.passive as { type?: string } | undefined;
    if (!lane || !passive?.type) continue;
    if (
      passive.type !== 'ignore_debuffs' &&
      passive.type !== 'foresight' &&
      passive.type !== 'apex_predator'
    ) {
      continue;
    }
    const key = flagKeyFor(refs[i].side, passive.type, lane);
    if (key) ctx[key] = true;
  }

  return ctx;
}
