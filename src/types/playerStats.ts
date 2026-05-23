// Release 1.1.0 — lifetime match counters. Server-only writes via
// functions/src/lib/playerStats.ts on each claim. Owner-readable.

import { Timestamp } from 'firebase/firestore';

export type PlayerStats = {
  player_id: string;
  total_matches: number;
  total_wins: number;
  // Per-mode breakdowns. Optional / default 0 for back-compat with the
  // first write that only includes the mode the player just finished.
  solo_matches?: number;
  campaign_matches?: number;
  battle_matches?: number;
  updated_at: Timestamp;
};
