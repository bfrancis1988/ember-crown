// Release 1.1.0 — authoritative lifetime match counters per player.
// Replaces the record screen's old "query match_sessions and count"
// approach, which silently lost data after cleanupStaleMatches ran
// (deletes claimed matches 12h after game_over).
//
// Atomicity contract: called from inside the existing claim tx so a
// stats increment commits together with the wallet credit. Designed to
// be unfailable for any valid (uid, mode) input — uses tx.set with
// merge:true (no tx.get required, no reads-before-writes ordering
// concern), and FieldValue.increment(1) is guaranteed to construct
// successfully. Caller responsibility: only invoke with non-empty uid.
//
// Tutorial matches are excluded — tutorial is one-shot and shouldn't
// count toward a player's lifetime record (matches quest behavior).
//
// Note: losses are NOT stored — derive as total_matches - total_wins.
// Saves a field and removes a "keep two counters in sync" failure mode.

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { MatchMode } from '../types/match';

export type IncrementMatchStatsArgs = {
  mode: MatchMode;
  isVictory: boolean;
};

export function incrementMatchStatsInTx(
  tx: admin.firestore.Transaction,
  uid: string,
  args: IncrementMatchStatsArgs,
  db: admin.firestore.Firestore,
): void {
  // Defensive guards — return early on any malformed input so the helper
  // can never abort the surrounding claim tx.
  if (!uid) return;
  if (args.mode === 'tutorial') return;

  const statsRef = db.collection('player_stats').doc(uid);
  const updates: Record<string, FirebaseFirestore.FieldValue | string> = {
    player_id: uid,
    total_matches: FieldValue.increment(1),
    updated_at: FieldValue.serverTimestamp(),
  };
  if (args.isVictory) {
    updates.total_wins = FieldValue.increment(1);
  }
  if (args.mode === 'solo') {
    updates.solo_matches = FieldValue.increment(1);
  } else if (args.mode === 'campaign') {
    updates.campaign_matches = FieldValue.increment(1);
  } else if (args.mode === 'battle_mode') {
    updates.battle_matches = FieldValue.increment(1);
  }

  // merge:true creates the doc on first call and merges increments on
  // subsequent calls. No tx.get needed — increments are atomic server-side.
  tx.set(statsRef, updates, { merge: true });
}
