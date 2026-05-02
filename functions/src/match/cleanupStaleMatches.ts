// functions/src/match/cleanupStaleMatches.ts
// Scheduled nightly sweep of stale match data. Runs at 03:00 UTC.
//
// Three passes:
//   1. match_sessions in 'game_over' with both _claimed flags + updated_at > 12h old → delete
//   2. match_sessions in 'in_progress' + updated_at > 12h old → delete (abandoned)
//   3. live_board_state docs whose match_id no longer references a live session → delete
// Passes 1 + 2 cascade-delete that match's live_board_state docs in the same sweep;
// pass 3 is a safety net for orphans.
//
// TODO (Phase 9 polish or wherever match history lands):
//   When a match completes and is claimed, write a summary entry to match_history
//   BEFORE this cleanup runs. Otherwise completed matches are unrecoverable
//   12 hours after both sides claim.
//   match_history schema sketch: {
//     player_id, match_id, played_at, result: 'win'|'loss'|'draw',
//     score: {self, opponent}, opponent_commander_id, faction
//   }

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const STALE_THRESHOLD_HOURS = 12;
// Firestore caps writeBatch at 500 ops; leave headroom.
const MAX_OPS_PER_BATCH = 450;

export const cleanupStaleMatches = onSchedule(
  {
    schedule: '0 3 * * *',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const startTime = Date.now();
    const db = admin.firestore();
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000
    );

    let matchesDeleted = 0;
    let boardDocsDeleted = 0;
    let orphansDeleted = 0;

    // ===== PASS 1: completed + claimed + stale =====
    const completedSnap = await db.collection('match_sessions')
      .where('status', '==', 'game_over')
      .where('updated_at', '<', cutoff)
      .get();

    const completedToDelete = completedSnap.docs.filter((d) => {
      const data = d.data();
      return data.player_a_claimed === true && data.player_b_claimed === true;
    });

    logger.info('Cleanup pass 1: completed-and-claimed', {
      candidates: completedSnap.size,
      to_delete: completedToDelete.length,
    });

    // ===== PASS 2: in-progress + stale (abandoned) =====
    const abandonedSnap = await db.collection('match_sessions')
      .where('status', '==', 'in_progress')
      .where('updated_at', '<', cutoff)
      .get();

    logger.info('Cleanup pass 2: abandoned', {
      to_delete: abandonedSnap.size,
    });

    // Combine pass 1 + 2 deletions and cascade to live_board_state.
    const allMatchesToDelete: string[] = [
      ...completedToDelete.map((d) => d.data().match_id as string),
      ...abandonedSnap.docs.map((d) => d.data().match_id as string),
    ];

    for (const matchId of allMatchesToDelete) {
      const matchBoardDocs = await db.collection('live_board_state')
        .where('match_id', '==', matchId)
        .get();

      let batch = db.batch();
      let opsInBatch = 0;

      batch.delete(db.collection('match_sessions').doc(matchId));
      opsInBatch++;

      for (const boardDoc of matchBoardDocs.docs) {
        if (opsInBatch >= MAX_OPS_PER_BATCH) {
          await batch.commit();
          batch = db.batch();
          opsInBatch = 0;
        }
        batch.delete(boardDoc.ref);
        opsInBatch++;
        boardDocsDeleted++;
      }

      if (opsInBatch > 0) await batch.commit();
      matchesDeleted++;
    }

    // ===== PASS 3: orphaned live_board_state =====
    // Snapshot surviving match_session IDs after passes 1 + 2.
    const survivingSnap = await db.collection('match_sessions').get();
    const survivingMatchIds = new Set<string>();
    survivingSnap.docs.forEach((d) => survivingMatchIds.add(d.data().match_id));

    // For our scale (low thousands max), an in-memory orphan scan is fine.
    // At larger scale we'd query in chunks.
    const allBoardSnap = await db.collection('live_board_state').get();
    const orphanedDocs = allBoardSnap.docs.filter((d) => {
      const matchId = d.data().match_id as string;
      return !survivingMatchIds.has(matchId);
    });

    logger.info('Cleanup pass 3: orphans', {
      scanned: allBoardSnap.size,
      orphans: orphanedDocs.length,
    });

    let orphanBatch = db.batch();
    let orphanOps = 0;
    for (const doc of orphanedDocs) {
      if (orphanOps >= MAX_OPS_PER_BATCH) {
        await orphanBatch.commit();
        orphanBatch = db.batch();
        orphanOps = 0;
      }
      orphanBatch.delete(doc.ref);
      orphanOps++;
      orphansDeleted++;
    }
    if (orphanOps > 0) await orphanBatch.commit();

    const durationMs = Date.now() - startTime;
    logger.info('Cleanup complete', {
      matches_deleted: matchesDeleted,
      board_docs_deleted_via_cascade: boardDocsDeleted,
      orphans_deleted: orphansDeleted,
      duration_ms: durationMs,
    });
  },
);
