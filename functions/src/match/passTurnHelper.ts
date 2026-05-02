// functions/src/match/passTurnHelper.ts
// Pure write logic for "pass turn". Used by:
//   - passTurn callable (after auth/validation)
//   - executeAITurn (trusted internal)

import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { nextActiveTurn } from './validateAction';
import type { MatchSession, Side } from '../types/match';
import type { PassTurnResult } from '../types/actions';

export async function passTurnHelper(
  matchId: string,
  callerSide: Side,
  db: admin.firestore.Firestore,
): Promise<PassTurnResult> {
  const sessionRef = db.collection('match_sessions').doc(matchId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Match not found.');
  }
  const session = sessionSnap.data() as MatchSession;

  if (session.status !== 'in_progress') {
    throw new HttpsError('failed-precondition', 'Match is not in progress.');
  }

  const callerPassedFlag = callerSide === 'player_a' ? 'player_a_passed' : 'player_b_passed';
  const opponentPassedFlag = callerSide === 'player_a' ? 'player_b_passed' : 'player_a_passed';

  if (session[callerPassedFlag]) {
    throw new HttpsError('failed-precondition', 'You have already passed this round.');
  }

  const newTurn = nextActiveTurn(callerSide, session, opponentPassedFlag, true);

  await sessionRef.update({
    [callerPassedFlag]: true,
    active_turn: newTurn,
    updated_at: FieldValue.serverTimestamp(),
  });

  logger.info('Turn passed', {
    match_id: matchId,
    caller: callerSide,
    opponent_already_passed: session[opponentPassedFlag],
    next_active_turn: newTurn,
  });

  return {
    success: true,
    action: 'turn_swapped',
    next_active_turn: newTurn,
  };
}
