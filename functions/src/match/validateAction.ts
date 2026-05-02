// functions/src/match/validateAction.ts
// Shared validation core for player-action callables (D5).
// Walks the auth → match → side → turn → pass-flag gauntlet and returns
// a context bundle that each action handler then specializes.

import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { MatchSession, Side } from '../types/match';

export type ValidatedActionContext = {
  matchId: string;
  session: MatchSession;
  callerSide: Side;
  callerPassedFlag: 'player_a_passed' | 'player_b_passed';
  opponentPassedFlag: 'player_a_passed' | 'player_b_passed';
  sessionRef: admin.firestore.DocumentReference;
};

/**
 * Common validation for any player action. Returns parsed context or throws HttpsError.
 *
 * options.requireTurn: defaults to true. Set false for actions that don't need turn
 *   ownership (none in D5, but reserved).
 */
export async function validatePlayerAction(
  request: { auth?: { uid: string } },
  matchId: string,
  db: admin.firestore.Firestore,
  options: { requireTurn?: boolean } = {},
): Promise<ValidatedActionContext> {
  const { requireTurn = true } = options;

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = request.auth.uid;

  const sessionRef = db.collection('match_sessions').doc(matchId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Match not found.');
  }
  const session = sessionSnap.data() as MatchSession;

  if (session.status !== 'in_progress') {
    throw new HttpsError('failed-precondition', 'Match is not in progress.');
  }

  let callerSide: Side;
  if (uid === session.player_a_id) callerSide = 'player_a';
  else if (uid === session.player_b_id) callerSide = 'player_b';
  else throw new HttpsError('permission-denied', 'You are not a player in this match.');

  if (requireTurn && session.active_turn !== callerSide) {
    throw new HttpsError('failed-precondition', 'It is not your turn.');
  }

  const callerPassedFlag = callerSide === 'player_a' ? 'player_a_passed' : 'player_b_passed';
  const opponentPassedFlag = callerSide === 'player_a' ? 'player_b_passed' : 'player_a_passed';

  if (session[callerPassedFlag]) {
    throw new HttpsError('failed-precondition', 'You have already passed this round.');
  }

  return { matchId, session, callerSide, callerPassedFlag, opponentPassedFlag, sessionRef };
}

/**
 * Determines next active_turn after an action.
 * - If the caller just passed, swap (they can't act again this round).
 * - Else if the opponent has already passed, turn stays with caller.
 * - Else swap.
 */
export function nextActiveTurn(
  callerSide: Side,
  session: MatchSession,
  opponentPassedFlag: 'player_a_passed' | 'player_b_passed',
  callerJustPassed: boolean,
): Side {
  if (callerJustPassed) {
    return callerSide === 'player_a' ? 'player_b' : 'player_a';
  }
  if (session[opponentPassedFlag]) {
    return callerSide;
  }
  return callerSide === 'player_a' ? 'player_b' : 'player_a';
}
