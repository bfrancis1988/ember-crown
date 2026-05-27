// Release 1.2.0 — writes a single per-match history row inside the claim
// transaction. Mirrors the atomicity contract of incrementMatchStatsInTx
// (see playerStats.ts): designed to be unfailable on any valid input so
// it can never abort the surrounding claim tx.
//
// Why we write at claim time and not on game_over:
//   cleanupStaleMatches deletes claimed match_sessions 12h after game_over.
//   Writing during claim means history survives the cleanup sweep and is
//   keyed off something the player explicitly did, not a server trigger
//   that can fire before the player ever sees the result screen.
//
// Tutorial mode is excluded — tutorial is one-shot and shouldn't pollute
// the player's match log (matches the player_stats rule).
//
// Caller responsibility:
//   - uid must be the claimer (player_a, since v1 only player_a is human).
//   - session must be the freshly read session inside the tx, before any
//     claim writes. We don't write player_a_claimed ourselves — caller
//     still does that as part of the same tx.
//   - cardsLost is the player_a discard count at claim time, computed by
//     countCardsLost outside the tx. We take it as a parameter rather
//     than recompute it here to avoid a second collection scan.

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { MatchSession } from '../types/match';
import type { MatchHistoryEntry, MatchHistoryMode } from '../types/matchHistory';

export function writeMatchHistoryInTx(
  tx: admin.firestore.Transaction,
  uid: string,
  session: MatchSession,
  isVictory: boolean,
  cardsLost: number,
  db: admin.firestore.Firestore,
): void {
  // Defensive guards — return early on any malformed input so the helper
  // can never abort the surrounding claim tx. Mirrors playerStats.ts.
  if (!uid) return;
  if (session.mode === 'tutorial') return;

  // Narrow the mode for the typed entry. The check above already excluded
  // tutorial; any future mode value not in MatchHistoryMode would land
  // here and be skipped rather than crash the claim.
  const mode = session.mode as MatchHistoryMode;
  if (mode !== 'solo' && mode !== 'campaign' && mode !== 'battle_mode') {
    logger.warn('writeMatchHistoryInTx: unexpected mode, skipping', {
      uid,
      match_id: session.match_id,
      mode: session.mode,
    });
    return;
  }

  const isBattleMode = mode === 'battle_mode';

  const entry: MatchHistoryEntry = {
    player_id: uid,
    match_id: session.match_id,

    mode,
    outcome: isVictory ? 'win' : 'loss',
    player_score: session.player_a_wins,
    opponent_score: session.player_b_wins,

    player_faction: session.player_a_faction ?? null,
    player_commander_id: session.player_a_commander_id,
    opponent_commander_id: session.player_b_commander_id,

    // Battle-mode opponent is a deck owner not present in this session.
    // Surface their identity via the battle_opponent_* fields rather than
    // pointing opponent_id at the AI bot uid (which would be misleading).
    opponent_id: isBattleMode ? null : session.player_b_id,
    opponent_display_name: isBattleMode
      ? session.battle_opponent_display_name ?? null
      : null,
    opponent_faction: isBattleMode
      ? session.battle_opponent_faction ?? null
      : null,
    opponent_power_score: isBattleMode
      ? session.battle_opponent_power_score ?? null
      : null,

    stage_id: mode === 'campaign' ? session.stage_id ?? null : null,

    total_rounds_played: session.current_round,
    cards_lost: cardsLost,

    cards_played: session.player_a_cards_played ?? 0,
    units_played: session.player_a_units_played ?? 0,
    spells_played: session.player_a_spells_played ?? 0,
    lane_melee_played: session.player_a_melee_lane_played ?? 0,
    lane_ranged_played: session.player_a_ranged_lane_played ?? 0,
    lane_siege_played: session.player_a_siege_lane_played ?? 0,
    commander_used_count: session.player_a_commander_used_count ?? 0,
    rare_or_higher_played: session.player_a_rare_or_higher_played ?? 0,

    started_at: session.created_at,
    ended_at: session.updated_at,
    // written_at typed as Timestamp on the entry; FieldValue.serverTimestamp
    // resolves to a Timestamp on commit. Cast to satisfy the TS shape.
    written_at: FieldValue.serverTimestamp() as unknown as MatchHistoryEntry['written_at'],
  };

  const historyRef = db
    .collection('player_match_history')
    .doc(uid)
    .collection('matches')
    .doc(session.match_id);

  // tx.set with no merge — claim is already gated by player_a_claimed,
  // so we should only land here once per (uid, match_id).
  tx.set(historyRef, entry);
}
