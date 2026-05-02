// functions/src/match/onMatchTurnChange.ts
// Firestore trigger: fires when match_sessions/{matchId} updates with a new
// active_turn that belongs to the AI bot. Dispatches executeAITurnInternal.
//
// IMPORTANT: onDocumentUpdated does NOT fire on document creation. The
// bot-wins-coin-flip case is handled by initializeNewMatch invoking
// executeAITurnInternal directly after the initial write.

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { AI_BOT_UID } from '../lib/matchConstants';
import { executeAITurnInternal } from './executeAITurn';

export const onMatchTurnChange = onDocumentUpdated(
  {
    document: 'match_sessions/{matchId}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    if (before.active_turn === after.active_turn) return;
    if (after.status !== 'in_progress') return;
    if (after.active_turn !== 'player_b') return;
    // Future PvP: don't auto-act when player_b is a real human uid.
    if (after.player_b_id !== AI_BOT_UID) return;

    logger.info('AI turn dispatch', {
      match_id: event.params.matchId,
      round: after.current_round,
    });

    await executeAITurnInternal(event.params.matchId, admin.firestore());
  },
);
