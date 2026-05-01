// SHARED TYPE — keep src/types/board.ts and functions/src/types/board.ts identical
// (only the Timestamp import path differs: 'firebase/firestore' vs 'firebase-admin/firestore').

import { Timestamp } from 'firebase/firestore';
import type { Side } from './match';
import type { Lane } from '../lib/matchConstants';

export type LocationState = 'hand' | 'deck' | 'discard' | Lowercase<Lane>;

export const LOCATION_STATES = ['hand', 'deck', 'discard', 'melee', 'ranged', 'siege'] as const;

export type LiveBoardState = {
  instance_id: string;
  match_id: string;
  owner: Side;
  card_id: string;
  current_power: number;
  location_state: LocationState;
  status_effect: string | null;
  created_at: Timestamp;
};

export function laneToLocationState(lane: Lane): 'melee' | 'ranged' | 'siege' {
  return lane.toLowerCase() as 'melee' | 'ranged' | 'siege';
}

export function isLaneLocation(loc: LocationState): loc is 'melee' | 'ranged' | 'siege' {
  return loc === 'melee' || loc === 'ranged' || loc === 'siege';
}
