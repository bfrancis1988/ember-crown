// Shared rarity → visuals map for the summon crystal animation.
// Single source of truth so Crystal, Shards, LightCoalesce, and the
// post-reveal modal all stay in sync.

import type { Rarity } from '../../lib/banners';

export const RARITY_CRYSTAL_COLORS: Record<Rarity, string> = {
  Common: '#e8e8f0',
  Uncommon: '#50c878',
  Rare: '#4a9eff',
  Epic: '#9d4edd',
  Legendary: '#f4a64a',
};

export type PhaseDurations = {
  materialize: number;
  shake: number;
  crack: number;
  shatter: number;
  coalesce: number;
};

export const RARITY_PHASE_DURATIONS_MS: Record<Rarity, PhaseDurations> = {
  Common:    { materialize: 200, shake:  600, crack: 400, shatter: 200, coalesce: 100 },
  Uncommon:  { materialize: 220, shake:  730, crack: 450, shatter: 250, coalesce: 100 },
  Rare:      { materialize: 250, shake:  850, crack: 500, shatter: 300, coalesce: 100 },
  Epic:      { materialize: 300, shake: 1100, crack: 600, shatter: 350, coalesce: 150 },
  Legendary: { materialize: 350, shake: 1400, crack: 700, shatter: 400, coalesce: 150 },
};

export const RARITY_SHAKE_AMPLITUDE_PX: Record<Rarity, number> = {
  Common: 2,
  Uncommon: 3,
  Rare: 5,
  Epic: 8,
  Legendary: 12,
};

export const RARITY_CRACK_COUNT: Record<Rarity, number> = {
  Common: 4,
  Uncommon: 5,
  Rare: 6,
  Epic: 8,
  Legendary: 10,
};

export const RARITY_SHARD_COUNT: Record<Rarity, number> = {
  Common: 6,
  Uncommon: 7,
  Rare: 8,
  Epic: 9,
  Legendary: 10,
};

export const RARITY_SHARD_DISTANCE_PX: Record<Rarity, number> = {
  Common: 60,
  Uncommon: 80,
  Rare: 100,
  Epic: 140,
  Legendary: 180,
};

// First-view skip becomes available this long after the animation begins.
// After the first complete (or skipped-past-this-threshold) viewing of a
// rarity, AsyncStorage flips the flag and skip is available from frame 1.
export const SKIP_DELAY_MS = 800;
