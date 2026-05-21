// src/hooks/useBoardObserver.ts
// Single source of snapshot-to-snapshot diffing for the match board.
// Called once by the match screen; emits two event streams that the
// Phase B animations consume:
//   - powerDeltas:     a lane card's current_power changed   (damage numbers + power crossfade)
//   - playTransitions: a card moved from hand into a lane    (hand-to-lane animation)
//
// This is intentionally the ONLY place board snapshots are diffed. Both the
// damage-number overlay and the per-card power crossfade read its output
// rather than re-deriving deltas themselves.

import { useRef } from 'react';
import { isLaneLocation, type LiveBoardState, type LocationState } from '../types/board';
import type { Side } from '../types/match';
import type { Lane } from '../lib/matchConstants';

export type PowerDeltaEvent = {
  instanceId: string;
  delta: number; // negative = damage, positive = heal/buff
  seq: number;
};

export type PlayTransitionEvent = {
  instanceId: string;
  owner: Side;
  lane: Lane;
  seq: number;
};

export type BoardObservation = {
  powerDeltas: PowerDeltaEvent[];
  playTransitions: PlayTransitionEvent[];
};

type Tracked = { power: number; loc: LocationState };

const LANE_FROM_LOCATION: Record<'melee' | 'ranged' | 'siege', Lane> = {
  melee: 'Melee',
  ranged: 'Ranged',
  siege: 'Siege',
};

// Shared stable reference returned whenever a diff produced no events, so
// consumers keying effects off the observation don't re-fire needlessly.
const EMPTY_OBSERVATION: BoardObservation = { powerDeltas: [], playTransitions: [] };

export function useBoardObserver(cards: LiveBoardState[]): BoardObservation {
  // Previous snapshot, keyed by instance_id. null until the first snapshot is
  // recorded as the baseline — the baseline itself emits no events.
  const prevRef = useRef<Map<string, Tracked> | null>(null);
  // Identity guard: re-renders that don't change the `cards` array reference
  // must return the SAME observation and never re-diff. useMatchBoardState
  // allocates a fresh array per Firestore snapshot, so identity changes
  // exactly once per real board update.
  const lastCardsRef = useRef<LiveBoardState[] | null>(null);
  const lastObsRef = useRef<BoardObservation>(EMPTY_OBSERVATION);
  const seqRef = useRef(0);

  if (cards === lastCardsRef.current) {
    return lastObsRef.current;
  }

  const nextMap = new Map<string, Tracked>();
  for (const c of cards) {
    nextMap.set(c.instance_id, { power: c.current_power, loc: c.location_state });
  }

  const prev = prevRef.current;
  let observation: BoardObservation;

  if (prev === null) {
    observation = EMPTY_OBSERVATION; // baseline snapshot — no events
  } else {
    const powerDeltas: PowerDeltaEvent[] = [];
    const playTransitions: PlayTransitionEvent[] = [];

    for (const c of cards) {
      const before = prev.get(c.instance_id);
      if (!before) continue; // brand-new instance — not a delta, not a tracked transition

      // Power delta: only when the card sat in a lane in BOTH snapshots, so a
      // card arriving from hand (which also gets a power value set) is never
      // mistaken for a heal.
      if (
        isLaneLocation(before.loc) &&
        isLaneLocation(c.location_state) &&
        before.power !== c.current_power
      ) {
        seqRef.current += 1;
        powerDeltas.push({
          instanceId: c.instance_id,
          delta: c.current_power - before.power,
          seq: seqRef.current,
        });
      }

      // Play transition: hand -> any lane.
      if (before.loc === 'hand' && isLaneLocation(c.location_state)) {
        seqRef.current += 1;
        playTransitions.push({
          instanceId: c.instance_id,
          owner: c.owner,
          lane: LANE_FROM_LOCATION[c.location_state],
          seq: seqRef.current,
        });
      }
    }

    observation =
      powerDeltas.length === 0 && playTransitions.length === 0
        ? EMPTY_OBSERVATION
        : { powerDeltas, playTransitions };
  }

  prevRef.current = nextMap;
  lastCardsRef.current = cards;
  lastObsRef.current = observation;
  return observation;
}
