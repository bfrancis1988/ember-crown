// Release 1.2.0 — per-player log of completed matches.
//
// SHARED TYPE — keep src/types/matchHistory.ts and
// functions/src/types/matchHistory.ts identical (only the Timestamp import
// path differs: 'firebase/firestore' vs 'firebase-admin/firestore').

import { Timestamp } from 'firebase/firestore';
import type { MatchMode } from './match';

export type MatchHistoryMode = Extract<MatchMode, 'solo' | 'campaign' | 'battle_mode'>;

export type MatchHistoryEntry = {
  player_id: string;
  match_id: string;

  mode: MatchHistoryMode;
  outcome: 'win' | 'loss';
  player_score: number;
  opponent_score: number;

  player_faction: string | null;
  player_commander_id: string;
  opponent_commander_id: string;

  opponent_id: string | null;
  opponent_display_name: string | null;
  opponent_faction: string | null;
  opponent_power_score: number | null;

  stage_id: string | null;

  total_rounds_played: number;
  cards_lost: number;

  cards_played: number;
  units_played: number;
  spells_played: number;
  lane_melee_played: number;
  lane_ranged_played: number;
  lane_siege_played: number;
  commander_used_count: number;
  rare_or_higher_played: number;

  started_at: Timestamp;
  ended_at: Timestamp;
  written_at: Timestamp;
};
