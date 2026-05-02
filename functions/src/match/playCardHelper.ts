// functions/src/match/playCardHelper.ts
// Pure write logic for "play a card from hand". Used by:
//   - playCardToLane callable (after auth/validation)
//   - executeAITurn (trusted internal)
// No auth check here — caller is responsible for that.

import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { nextActiveTurn } from './validateAction';
import { laneToLocationState, type LiveBoardState } from '../types/board';
import { type Lane, debuffFieldKey } from '../lib/matchConstants';
import type { MatchSession, Side } from '../types/match';
import type { PlayCardResult } from '../types/actions';

export async function playCardHelper(
  matchId: string,
  instanceId: string,
  targetLane: Lane,
  callerSide: Side,
  db: admin.firestore.Firestore,
): Promise<PlayCardResult> {
  const sessionRef = db.collection('match_sessions').doc(matchId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Match not found.');
  }
  const session = sessionSnap.data() as MatchSession;

  if (session.status !== 'in_progress') {
    throw new HttpsError('failed-precondition', 'Match is not in progress.');
  }

  const cardRef = db.collection('live_board_state').doc(instanceId);
  const cardSnap = await cardRef.get();
  if (!cardSnap.exists) {
    throw new HttpsError('not-found', 'Card instance not found.');
  }
  const cardInstance = cardSnap.data() as LiveBoardState;

  if (cardInstance.match_id !== matchId) {
    throw new HttpsError('failed-precondition', 'Card does not belong to this match.');
  }
  if (cardInstance.owner !== callerSide) {
    throw new HttpsError('permission-denied', 'That is not your card.');
  }
  if (cardInstance.location_state !== 'hand') {
    throw new HttpsError('failed-precondition', 'Card is not in your hand.');
  }

  const libRef = db.collection('card_library').doc(cardInstance.card_id);
  const libSnap = await libRef.get();
  if (!libSnap.exists) {
    throw new HttpsError('internal', 'Card library entry missing.');
  }
  const libData = libSnap.data()!;

  const opponentPassedFlag = callerSide === 'player_a' ? 'player_b_passed' : 'player_a_passed';

  const batch = db.batch();
  let actionTaken: PlayCardResult['action'];

  if (libData.card_type === 'Unit') {
    batch.update(cardRef, { location_state: laneToLocationState(targetLane) });
    actionTaken = 'unit_placed';
  } else if (libData.card_type === 'Spell' && libData.klass === 'Curse') {
    const enemySide = callerSide === 'player_a' ? 'player_b' : 'player_a';
    batch.update(sessionRef, { [debuffFieldKey(enemySide, targetLane)]: true });
    batch.update(cardRef, { location_state: 'discard' });
    actionTaken = 'spell_debuff';
  } else if (libData.card_type === 'Spell' && libData.klass === 'Cleanse') {
    batch.update(sessionRef, { [debuffFieldKey(callerSide, targetLane)]: false });
    batch.update(cardRef, { location_state: 'discard' });
    actionTaken = 'spell_cleanse';
  } else {
    throw new HttpsError(
      'failed-precondition',
      `Unknown card type/klass combination: ${libData.card_type}/${libData.klass}`,
    );
  }

  const newTurn = nextActiveTurn(callerSide, session, opponentPassedFlag, false);
  batch.update(sessionRef, {
    active_turn: newTurn,
    updated_at: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  logger.info('Card played', {
    match_id: matchId,
    instance_id: instanceId,
    caller: callerSide,
    action: actionTaken,
    target_lane: targetLane,
    next_active_turn: newTurn,
  });

  return {
    success: true,
    action: actionTaken,
    instance_id: instanceId,
    target_lane: targetLane,
    next_active_turn: newTurn,
  };
}
