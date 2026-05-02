// functions/src/match/aiHeuristics.ts
// Pure decision logic for the AI bot. No Firestore. Inputs are pre-loaded
// hand cards + on-board lane cards + match session; output is one decision.
//
// Standard difficulty heuristic (ported from base44):
//   1. Empty hand → pass.
//   2. Hand > 8 → 20% chance to pass tactically (preserve cards for later rounds).
//   3. Otherwise pick the strongest card and route it to a lane via:
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
