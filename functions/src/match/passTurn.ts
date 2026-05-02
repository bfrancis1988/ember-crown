// functions/src/match/passTurn.ts
// Callable: caller opts out of further action this round. D5 only flips the
// pass flag and rotates active_turn — round-end detection (both flags true)
// is D7's trigger, not this function.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { validatePlayerAction, nextActiveTurn } from './validateAction';
import type { PassTurnResult } from '../types/actions';

type PassTurnInput = { matchId: string };

export const passTurn = onCall<PassTurnInput, Promise<PassTurnResult>>(
  { region: 'us-central1' },
  async (request) => {
    const { matchId } = request.data;
    if (!matchId) {
      throw new HttpsError('invalid-argument', 'matchId is required.');
    }

    const db = admin.firestore();
    const ctx = await validatePlayerAction(request, matchId, db);

    // Caller just passed → always swap (or, if opponent already passed, the
    // round is about to end anyway and active_turn doesn't matter; D7 handles).
    const newTurn = nextActiveTurn(ctx.callerSide, ctx.session, ctx.opponentPassedFlag, true);

    await ctx.sessionRef.update({
      [ctx.callerPassedFlag]: true,
      active_turn: newTurn,
      updated_at: FieldValue.serverTimestamp(),
    });

    logger.info('Turn passed', {
      match_id: matchId,
      caller: ctx.callerSide,
      opponent_already_passed: ctx.session[ctx.opponentPassedFlag],
      next_active_turn: newTurn,
    });

    // D5 always returns turn_swapped. The client observes round-end via its
    // onSnapshot subscription when D7's trigger flips current_round.
    return {
      success: true,
      action: 'turn_swapped',
      next_active_turn: newTurn,
    };
  },
);
