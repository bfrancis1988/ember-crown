// functions/src/match/onMatchTurnChange.ts
// Firestore trigger: fires whenever match_sessions/{matchId} is updated.
// Phase 5 D3: scaffold only — logs when the bot's turn begins, then exits.
// Phase 5 D6 will replace the TODO with executeAITurn dispatch.
//
// IMPORTANT (D6): onDocumentUpdated does NOT fire on document creation.
// If initializeNewMatch creates a match with active_turn = "player_b" (bot
// won the coin flip), this trigger will never see it — there's no prior
// state to compare against. D6 must handle bot-first-turn separately,
// e.g. by invoking executeAITurn directly inside initializeNewMatch when
// firstTurn === "player_b", or by adding an onDocumentCreated companion.

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { AI_BOT_UID } from '../lib/matchConstants';

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

    logger.info('AI turn dispatch triggered (scaffold — not yet implemented)', {
      match_id: event.params.matchId,
      round: after.current_round,
      before_turn: before.active_turn,
      after_turn: after.active_turn,
    });

    // TODO Phase 5 D6: invoke executeAITurn here.
  },
);
