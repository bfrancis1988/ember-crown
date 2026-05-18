// functions/src/__tests__/economy/matchRewards.test.ts
//
// Update 1.0.5 — pins the rebalanced match reward constants and verifies the
// streak shard rule (every 5th win grants a shard; losses don't increment).

import {
  MATCH_REWARD_COINS_MIN,
  MATCH_REWARD_COINS_MAX,
  MATCH_REWARD_COINS_LOSS,
  MATCH_REWARD_SHARDS_WIN,
  MATCH_REWARD_SHARDS_LOSS,
  MATCH_REWARD_SHARD_STREAK_WINS,
} from '../../lib/matchConstants';
import { applyShardStreak } from '../../lib/shardStreak';

describe('Update 1.0.5 match reward constants', () => {
  test('win coin range is 50..80 and well-ordered', () => {
    expect(MATCH_REWARD_COINS_MIN).toBe(50);
    expect(MATCH_REWARD_COINS_MAX).toBe(80);
    expect(MATCH_REWARD_COINS_MIN).toBeLessThan(MATCH_REWARD_COINS_MAX);
  });

  test('loss coin reward is 5', () => {
    expect(MATCH_REWARD_COINS_LOSS).toBe(5);
  });

  test('per-match shard rewards are zero (replaced by streak grant)', () => {
    expect(MATCH_REWARD_SHARDS_WIN).toBe(0);
    expect(MATCH_REWARD_SHARDS_LOSS).toBe(0);
  });

  test('streak threshold is 5 wins', () => {
    expect(MATCH_REWARD_SHARD_STREAK_WINS).toBe(5);
  });
});

describe('applyShardStreak — streak counter logic', () => {
  test('first win increments counter without granting a shard', () => {
    expect(applyShardStreak(0, true)).toEqual({ streakShard: 0, newStreak: 1 });
  });

  test('4 wins in a row: no shard yet, counter at 4', () => {
    // priorStreak=3 means 3 prior wins; +1 = 4. Still below threshold of 5.
    expect(applyShardStreak(3, true)).toEqual({ streakShard: 0, newStreak: 4 });
  });

  test('5th win grants 1 shard AND resets counter to 0', () => {
    // priorStreak=4 means 4 prior wins; +1 = 5 hits threshold.
    expect(applyShardStreak(4, true)).toEqual({ streakShard: 1, newStreak: 0 });
  });

  test('loss does not increment counter, regardless of prior streak', () => {
    expect(applyShardStreak(0, false)).toEqual({ streakShard: 0, newStreak: 0 });
    expect(applyShardStreak(2, false)).toEqual({ streakShard: 0, newStreak: 2 });
    expect(applyShardStreak(4, false)).toEqual({ streakShard: 0, newStreak: 4 });
  });

  test('loss never grants a streak shard', () => {
    for (let prior = 0; prior < MATCH_REWARD_SHARD_STREAK_WINS + 3; prior++) {
      expect(applyShardStreak(prior, false).streakShard).toBe(0);
    }
  });

  test('full 5-win cycle: exactly 1 shard granted, counter ends at 0', () => {
    let streak = 0;
    let shardsGranted = 0;
    for (let i = 0; i < MATCH_REWARD_SHARD_STREAK_WINS; i++) {
      const result = applyShardStreak(streak, true);
      streak = result.newStreak;
      shardsGranted += result.streakShard;
    }
    expect(shardsGranted).toBe(1);
    expect(streak).toBe(0);
  });

  test('10-win cycle: exactly 2 shards granted across two resets', () => {
    let streak = 0;
    let shardsGranted = 0;
    for (let i = 0; i < 10; i++) {
      const result = applyShardStreak(streak, true);
      streak = result.newStreak;
      shardsGranted += result.streakShard;
    }
    expect(shardsGranted).toBe(2);
    expect(streak).toBe(0);
  });

  test('losses interspersed with wins: only wins count toward streak', () => {
    // 3 wins, then 2 losses, then 2 wins → that's 5 total wins → 1 shard, counter 0.
    const sequence: boolean[] = [true, true, true, false, false, true, true];
    let streak = 0;
    let shardsGranted = 0;
    for (const isWin of sequence) {
      const result = applyShardStreak(streak, isWin);
      streak = result.newStreak;
      shardsGranted += result.streakShard;
    }
    expect(shardsGranted).toBe(1);
    expect(streak).toBe(0);
  });
});
