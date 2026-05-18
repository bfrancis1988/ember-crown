// SHARED CONSTANTS — keep src/lib/matchConstants.ts and functions/src/lib/matchConstants.ts identical.
// If you change one, change the other.

export const LANES = ['Melee', 'Ranged', 'Siege'] as const;
export type Lane = typeof LANES[number];

export const STARTING_HAND_SIZE = 7;
export const DECK_SIZE = 15;
export const MAX_ROUNDS = 3;
export const END_ROUND_DRAW_COUNT = 2;

export const MATCH_REWARD_COINS_MIN = 50;
export const MATCH_REWARD_COINS_MAX = 80;
export const MATCH_REWARD_COINS_LOSS = 5;
export const MATCH_REWARD_SHARDS_WIN = 0;
export const MATCH_REWARD_SHARDS_LOSS = 0;
export const MATCH_REWARD_SHARD_STREAK_WINS = 5;

export const AI_BOT_UID = 'AI_BOT';

export function debuffFieldKey(side: 'player_a' | 'player_b', lane: Lane): string {
  return `${side}_${lane.toLowerCase()}_debuffed` as const;
}

export function commanderActiveLaneKey(side: 'player_a' | 'player_b'): string {
  return `${side}_commander_active_lane` as const;
}
