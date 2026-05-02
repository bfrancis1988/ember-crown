// functions/src/match/onBothPlayersPassed.ts
// Firestore trigger: detects when both pass flags transition to true and
// dispatches executeEndRoundInternal. Idempotent — the helper's defensive
// check handles trigger retries.

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { executeEndRoundInternal } from './executeEndRound';

export const onBothPlayersPassed = onDocumentUpdated(
  {
    document: 'match_sessions/{matchId}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only fire on the transition into "both passed" — not on every subsequent
    // write while both flags happen to remain true.
    const wasBoth = before.player_a_passed && before.player_b_passed;
    const isBoth = after.player_a_passed && after.player_b_passed;
    if (wasBoth || !isBoth) return;

    if (after.status !== 'in_progress') return;

    logger.info('Both players passed; ending round', {
      match_id: event.params.matchId,
      round: after.current_round,
    });

    await executeEndRoundInternal(event.params.matchId, admin.firestore());
  },
);
