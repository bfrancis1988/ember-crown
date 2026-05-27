// Release 1.2.0 — per-player log of completed matches.
//
// SHARED TYPE — keep src/types/matchHistory.ts and
// functions/src/types/matchHistory.ts identical (only the Timestamp import
// path differs: 'firebase/firestore' vs 'firebase-admin/firestore').
//
// Stored at player_match_history/{uid}/matches/{matchId}. One doc per
// claimed match, written from inside the claim transaction so a history
// row commits atomically with the wallet credit. Tutorial matches are
// excluded (mirrors player_stats behaviour).
//
// Retention: cleanupStaleMatchHistory deletes docs older than 90 days
// from written_at.

import { Timestamp } from 'firebase-admin/firestore';
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

  // null for battle_mode (the deck-owner is not a participant of this
  // session — see opponent_display_name / opponent_faction instead).
  // For solo/campaign this is the AI bot uid.
  opponent_id: string | null;
  opponent_display_name: string | null;
  opponent_faction: string | null;
  opponent_power_score: number | null;

  // Campaign only.
  stage_id: string | null;

  // Match-summary numbers.
  // total_rounds_played comes from session.current_round at claim time
  // (always 3 in v1 since matches only end after round 3, but recorded
  // here so the field is correct if early-resign ships later).
  // cards_lost is the count of player_a cards that ended up in 'discard'
  // by claim time — already computed by countCardsLost in each claim
  // function and passed in to avoid a second collection scan.
  total_rounds_played: number;
  cards_lost: number;

  // Per-match counters — copied from session.player_a_* fields, which are
  // accumulated by playCardHelper during play. Pre-1.1 sessions may not
  // have these (lazy migration); the helper defaults missing fields to 0.
  cards_played: number;
  units_played: number;
  spells_played: number;
  lane_melee_played: number;
  lane_ranged_played: number;
  lane_siege_played: number;
  commander_used_count: number;
  rare_or_higher_played: number;

  started_at: Timestamp;  // session.created_at
  ended_at: Timestamp;    // session.updated_at at claim time
  written_at: Timestamp;  // serverTimestamp at helper call; drives retention sweep
};
