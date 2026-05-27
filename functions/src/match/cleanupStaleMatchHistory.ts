// Release 1.2.0 — daily retention sweep for player_match_history.
//
// Schedule: 03:30 UTC daily (offset 30 min from cleanupStaleMatches at
// 03:00 to avoid contending for the same scheduler/runtime slot).
//
// Retention window: 90 days from written_at. After that, the row is
// deleted. The window was chosen as a balance between giving players a
// meaningful history (and seeding future contest / leaderboard features)
// and bounding per-player storage growth.
//
// Implementation: collectionGroup query over the matches subcollection,
// chunked deletes via writeBatch (max ~450 ops per batch, mirroring
// cleanupStaleMatches's headroom under the 500-op Firestore cap).

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const RETENTION_DAYS = 90;
const MAX_OPS_PER_BATCH = 450;
// Single-pass query cap: at 90-day retention plus daily sweeps, we expect
// the over-cutoff set to be small. Cap keeps a single sweep bounded in
// case of backlog; the next day's sweep picks up the rest.
const QUERY_LIMIT = 5000;

export const cleanupStaleMatchHistory = onSchedule(
  {
    schedule: '30 3 * * *',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const startTime = Date.now();
    const db = admin.firestore();
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const staleSnap = await db
      .collectionGroup('matches')
      .where('written_at', '<', cutoff)
      .limit(QUERY_LIMIT)
      .get();

    logger.info('Match history cleanup: scan', {
      candidates: staleSnap.size,
      cutoff_iso: cutoff.toDate().toISOString(),
      query_limit: QUERY_LIMIT,
    });

    if (staleSnap.empty) {
      logger.info('Match history cleanup: nothing to delete', {
        duration_ms: Date.now() - startTime,
      });
      return;
    }

    let batch = db.batch();
    let opsInBatch = 0;
    let deleted = 0;

    for (const doc of staleSnap.docs) {
      if (opsInBatch >= MAX_OPS_PER_BATCH) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
      batch.delete(doc.ref);
      opsInBatch++;
      deleted++;
    }

    if (opsInBatch > 0) await batch.commit();

    logger.info('Match history cleanup: complete', {
      deleted,
      hit_query_limit: staleSnap.size === QUERY_LIMIT,
      duration_ms: Date.now() - startTime,
    });
  },
);
