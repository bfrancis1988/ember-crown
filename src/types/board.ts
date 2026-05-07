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
  // Phase 9.4.2A — Veteran keyword permanently raises this per round.
  // Treat undefined as 0 for lazy migration of pre-9.4.2 instances.
  base_power_bonus?: number;
  // Phase 9.4.2B — true for token units spawned by Swarm. Real cards omit it.
  // Tokens have no card_library entry; their display + power data lives inline
  // on `token_data` so calculatePower/render can treat them as synthesised
  // CardLibraryEntry on the fly.
  is_token?: boolean;
  token_data?: TokenData;
};

export type TokenData = {
  card_name: string;
  faction: string;
  base_power: number;
  klass?: string; // optional display flavor (e.g. 'Swarm', 'Brood')
};

export function laneToLocationState(lane: Lane): 'melee' | 'ranged' | 'siege' {
  return lane.toLowerCase() as 'melee' | 'ranged' | 'siege';
}

export function isLaneLocation(loc: LocationState): loc is 'melee' | 'ranged' | 'siege' {
  return loc === 'melee' || loc === 'ranged' || loc === 'siege';
}
