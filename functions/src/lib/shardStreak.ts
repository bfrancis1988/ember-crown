// functions/src/lib/shardStreak.ts
//
// Pure helper for the win-streak shard reward applied in claimMatchRewards.
// Extracted from the transaction body so the rule can be unit-tested without
// Firestore mocks. The constant MATCH_REWARD_SHARD_STREAK_WINS lives in
// matchConstants.ts alongside the other reward knobs.

import { MATCH_REWARD_SHARD_STREAK_WINS } from './matchConstants';

export type ShardStreakResult = {
  streakShard: number; // 0 or 1
  newStreak: number;   // 0 .. MATCH_REWARD_SHARD_STREAK_WINS - 1
};

export function applyShardStreak(
  priorStreak: number,
  isVictory: boolean,
): ShardStreakResult {
  if (!isVictory) {
    return { streakShard: 0, newStreak: priorStreak };
  }
  const nextStreak = priorStreak + 1;
  if (nextStreak >= MATCH_REWARD_SHARD_STREAK_WINS) {
    return { streakShard: 1, newStreak: 0 };
  }
  return { streakShard: 0, newStreak: nextStreak };
}
