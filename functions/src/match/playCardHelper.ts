// functions/src/match/playCardHelper.ts
// Pure write logic for "play a card from hand". Used by:
//   - playCardToLane callable (after auth/validation)
//   - executeAITurn (trusted internal)
// No auth check here — caller is responsible for that.

import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { nextActiveTurn } from './validateAction';
import { laneToLocationState, type LiveBoardState } from '../types/board';
import { type Lane, debuffFieldKey } from '../lib/matchConstants';
import type { MatchSession, Side } from '../types/match';
import type { PlayCardResult } from '../types/actions';
import { applyCleaveOnPlay, applySwarmOnPlay, applyRitualOnPlay } from './keywordEffects';

export type PlayCardOptions = {
  // Phase 9.4.2B — instance_id of an allied unit to sacrifice when the played
  // card has the Ritual keyword (mode='optional_single'). Ignored otherwise.
  // Null/undefined = play without sacrificing.
  sacrificeTargetInstanceId?: string | null;
};

export async function playCardHelper(
  matchId: string,
  instanceId: string,
  targetLane: Lane,
  callerSide: Side,
  db: admin.firestore.Firestore,
  options: PlayCardOptions = {},
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

    // Phase 9.4.2A — Cleave keyword resolves at play-time. Stages damage
    // updates onto the same batch the placement is going on.
    await applyCleaveOnPlay({
      matchId,
      callerSide,
      playedLane: targetLane,
      playedCardLib: {
        card_id: cardInstance.card_id,
        card_type: 'Unit',
        base_power: libData.base_power,
        keywords: libData.keywords,
        keyword_params: libData.keyword_params,
      },
      db,
      batch,
    });

    // Phase 9.4.2B — Swarm: spawn token units in the configured lanes.
    applySwarmOnPlay({
      matchId,
      callerSide,
      playedLane: targetLane,
      playedCardLib: {
        card_id: cardInstance.card_id,
        faction: libData.faction,
        keywords: libData.keywords,
        keyword_params: libData.keyword_params,
      },
      batch,
      db,
      now: FieldValue.serverTimestamp() as unknown as Timestamp,
    });

    // Phase 9.4.2B — Ritual: optional sacrifice (or all-in-lane forced
    // sacrifice). The Cleave/Swarm hooks above don't write to the played
    // card's current_power, so the Ritual update here is the only modifier
    // — safe to apply after them in the same batch.
    await applyRitualOnPlay({
      matchId,
      callerSide,
      playedLane: targetLane,
      playedInstanceId: instanceId,
      playedCardLib: {
        card_id: cardInstance.card_id,
        base_power: libData.base_power,
        keywords: libData.keywords,
        keyword_params: libData.keyword_params,
      },
      sacrificeTargetInstanceId: options.sacrificeTargetInstanceId ?? null,
      batch,
      db,
    });
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
