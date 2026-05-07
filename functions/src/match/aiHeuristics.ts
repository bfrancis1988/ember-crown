// functions/src/match/aiHeuristics.ts
// Pure decision logic for the AI bot. No Firestore. Inputs are pre-loaded
// hand cards + on-board lane cards + match session; output is one decision.
//
// Standard difficulty heuristic (ported from base44):
//   1. Empty hand → pass.
//   2. Opponent has passed this round → defensive mode (Phase 9.4.3A):
//        - Already winning ≥ 2 lanes → pass (save hand for next round).
//        - Find minimum play that flips a lane to winning. Pass if none exists.
//   3. Hand > 8 → 20% chance to pass tactically (preserve cards for later rounds).
//   4. Otherwise pick the strongest card and route it to a lane via:
//        Priority 1: Flip a losing lane (where playPower closes the gap).
//        Priority 2: Break a tie.
//        Priority 3: Reinforce slimmest lead.
//        Priority 4: Random fallback.

import { LANES, type Lane } from '../lib/matchConstants';
import type { MatchSession } from '../types/match';

export type AIDecision =
  | { action: 'PASS' }
  | { action: 'PLAY'; instanceId: string; targetLane: Lane };

export type HandCard = {
  instance_id: string;
  card_id: string;
  base_power: number;
};

export type LaneCard = {
  instance_id: string;
  owner: 'player_a' | 'player_b';
  card_id: string;
  location_state: 'melee' | 'ranged' | 'siege';
  current_power: number;
};

type LaneLoc = 'melee' | 'ranged' | 'siege';
type SideScores = Record<LaneLoc, number>;

export function decideAIAction(
  hand: HandCard[],
  laneCards: LaneCard[],
  session: MatchSession,
): AIDecision {
  if (hand.length === 0) return { action: 'PASS' };

  // Phase 9.4.3A — Defensive mode when the human has passed for the round.
  // Avoids dumping the rest of the hand into a round we either already won
  // or can't reach with the cards available.
  if (session.player_a_passed) {
    return decideAfterOpponentPass(hand, laneCards, session);
  }

  if (hand.length > 8) {
    const roll = Math.floor(Math.random() * 10) + 1;
    if (roll <= 2) return { action: 'PASS' };
  }

  // Strongest card; deterministic tiebreak by instance_id.
  const sortedHand = [...hand].sort((a, b) => {
    if (b.base_power !== a.base_power) return b.base_power - a.base_power;
    return a.instance_id.localeCompare(b.instance_id);
  });
  const chosen = sortedHand[0];
  const playPower = chosen.base_power;

  const scores = computeLaneScores(laneCards, session);
  let bestLane: Lane | null = null;

  // Priority 1: Flip a losing-or-tied lane this card can win.
  for (const lane of LANES) {
    const loc = lane.toLowerCase() as LaneLoc;
    const diff = scores.player_a[loc] - scores.player_b[loc];
    if (diff >= 0 && diff < playPower) {
      bestLane = lane;
      break;
    }
  }

  // Priority 2: Break a tie (any tied lane — first in lane order).
  if (!bestLane) {
    for (const lane of LANES) {
      const loc = lane.toLowerCase() as LaneLoc;
      if (scores.player_a[loc] === scores.player_b[loc]) {
        bestLane = lane;
        break;
      }
    }
  }

  // Priority 3: Reinforce the slimmest existing lead.
  if (!bestLane) {
    let smallestLead = Infinity;
    for (const lane of LANES) {
      const loc = lane.toLowerCase() as LaneLoc;
      const margin = scores.player_b[loc] - scores.player_a[loc];
      if (margin > 0 && margin < smallestLead) {
        smallestLead = margin;
        bestLane = lane;
      }
    }
  }

  // Priority 4: Random fallback (e.g. all lanes hopelessly lost).
  if (!bestLane) {
    bestLane = LANES[Math.floor(Math.random() * LANES.length)];
  }

  return { action: 'PLAY', instanceId: chosen.instance_id, targetLane: bestLane };
}

// Phase 9.4.3A — defensive logic: AI plays the minimum needed to win the
// round (or passes if it's already winning, or if no card can flip a lane).
function decideAfterOpponentPass(
  hand: HandCard[],
  laneCards: LaneCard[],
  session: MatchSession,
): AIDecision {
  const currentWinning = countAIWinningLanes(laneCards, session);

  // Already winning the round (≥2 of 3 lanes) — pass and save the hand.
  if (currentWinning >= 2) return { action: 'PASS' };

  type Candidate = {
    instanceId: string;
    lane: Lane;
    winningCount: number;
    basePower: number;
  };
  const candidates: Candidate[] = [];

  for (const card of hand) {
    for (const lane of LANES) {
      const loc = lane.toLowerCase() as LaneLoc;
      const simulated: LaneCard[] = [
        ...laneCards,
        {
          instance_id: card.instance_id,
          owner: 'player_b',
          card_id: card.card_id,
          location_state: loc,
          current_power: card.base_power,
        },
      ];
      const hypWinning = countAIWinningLanes(simulated, session);
      if (hypWinning > currentWinning) {
        candidates.push({
          instanceId: card.instance_id,
          lane,
          winningCount: hypWinning,
          basePower: card.base_power,
        });
      }
    }
  }

  if (candidates.length === 0) return { action: 'PASS' };

  // Pick: flip the most lanes; on ties prefer the weakest card (save power
  // for later rounds); deterministic tiebreak by instance_id.
  candidates.sort((a, b) => {
    if (b.winningCount !== a.winningCount) return b.winningCount - a.winningCount;
    if (a.basePower !== b.basePower) return a.basePower - b.basePower;
    return a.instanceId.localeCompare(b.instanceId);
  });

  return {
    action: 'PLAY',
    instanceId: candidates[0].instanceId,
    targetLane: candidates[0].lane,
  };
}

function countAIWinningLanes(
  laneCards: LaneCard[],
  session: MatchSession,
): number {
  const scores = computeLaneScores(laneCards, session);
  let count = 0;
  for (const loc of ['melee', 'ranged', 'siege'] as const) {
    if (scores.player_b[loc] > scores.player_a[loc]) count++;
  }
  return count;
}

function computeLaneScores(
  laneCards: LaneCard[],
  session: MatchSession,
): { player_a: SideScores; player_b: SideScores } {
  const scores = {
    player_a: { melee: 0, ranged: 0, siege: 0 } as SideScores,
    player_b: { melee: 0, ranged: 0, siege: 0 } as SideScores,
  };

  for (const card of laneCards) {
    scores[card.owner][card.location_state] += card.current_power;
  }

  // Commander buff: +1 per friendly card in the active commander's lane.
  if (session.player_a_commander_active_lane) {
    const loc = session.player_a_commander_active_lane.toLowerCase() as LaneLoc;
    const count = laneCards.filter(c => c.owner === 'player_a' && c.location_state === loc).length;
    scores.player_a[loc] += count;
  }
  if (session.player_b_commander_active_lane) {
    const loc = session.player_b_commander_active_lane.toLowerCase() as LaneLoc;
    const count = laneCards.filter(c => c.owner === 'player_b' && c.location_state === loc).length;
    scores.player_b[loc] += count;
  }

  return scores;
}
