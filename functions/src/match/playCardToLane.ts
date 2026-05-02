// functions/src/match/playCardToLane.ts
// Callable: places a unit into a lane OR casts a spell (curse/cleanse).
// Uses the D5A shared validator. Power recompute is delegated to the
// D4 onBoardStateChange / onMatchDebuffChange triggers.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { validatePlayerAction, nextActiveTurn } from './validateAction';
import { laneToLocationState, type LiveBoardState } from '../types/board';
import { LANES, type Lane, debuffFieldKey } from '../lib/matchConstants';
import type { PlayCardResult } from '../types/actions';

type PlayCardInput = {
  matchId: string;
  instanceId: string;
  targetLane: Lane;
};

export const playCardToLane = onCall<PlayCardInput, Promise<PlayCardResult>>(
  { region: 'us-central1' },
  async (request) => {
    const { matchId, instanceId, targetLane } = request.data;

    if (!matchId || !instanceId || !targetLane) {
      throw new HttpsError('invalid-argument', 'matchId, instanceId, targetLane are required.');
    }
    if (!LANES.includes(targetLane)) {
      throw new HttpsError('invalid-argument', `targetLane must be one of: ${LANES.join(', ')}`);
    }

    const db = admin.firestore();
    const ctx = await validatePlayerAction(request, matchId, db);

    // Load the card instance.
    const cardRef = db.collection('live_board_state').doc(instanceId);
    const cardSnap = await cardRef.get();
    if (!cardSnap.exists) {
      throw new HttpsError('not-found', 'Card instance not found.');
    }
    const cardInstance = cardSnap.data() as LiveBoardState;

    if (cardInstance.match_id !== matchId) {
      throw new HttpsError('failed-precondition', 'Card does not belong to this match.');
    }
    if (cardInstance.owner !== ctx.callerSide) {
      throw new HttpsError('permission-denied', 'That is not your card.');
    }
    if (cardInstance.location_state !== 'hand') {
      throw new HttpsError('failed-precondition', 'Card is not in your hand.');
    }

    // Look up card_type / klass to dispatch.
    const libRef = db.collection('card_library').doc(cardInstance.card_id);
    const libSnap = await libRef.get();
    if (!libSnap.exists) {
      throw new HttpsError('internal', 'Card library entry missing.');
    }
    const libData = libSnap.data()!;

    const batch = db.batch();
    let actionTaken: PlayCardResult['action'];

    if (libData.card_type === 'Unit') {
      // Unit: move from hand into the chosen lane. current_power is recomputed
      // by the D4 onBoardStateChange trigger.
      batch.update(cardRef, {
        location_state: laneToLocationState(targetLane),
      });
      actionTaken = 'unit_placed';
    } else if (libData.card_type === 'Spell' && libData.klass === 'Curse') {
      // Curse: flip enemy lane debuff true, discard the spell.
      const enemySide = ctx.callerSide === 'player_a' ? 'player_b' : 'player_a';
      batch.update(ctx.sessionRef, { [debuffFieldKey(enemySide, targetLane)]: true });
      batch.update(cardRef, { location_state: 'discard' });
      actionTaken = 'spell_debuff';
    } else if (libData.card_type === 'Spell' && libData.klass === 'Cleanse') {
      // Cleanse: clear friendly lane debuff (no-op if already false), discard.
      batch.update(ctx.sessionRef, { [debuffFieldKey(ctx.callerSide, targetLane)]: false });
      batch.update(cardRef, { location_state: 'discard' });
      actionTaken = 'spell_cleanse';
    } else {
      throw new HttpsError(
        'failed-precondition',
        `Unknown card type/klass combination: ${libData.card_type}/${libData.klass}`,
      );
    }

    const newTurn = nextActiveTurn(ctx.callerSide, ctx.session, ctx.opponentPassedFlag, false);
    batch.update(ctx.sessionRef, {
      active_turn: newTurn,
      updated_at: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    logger.info('Card played', {
      match_id: matchId,
      instance_id: instanceId,
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
  },
);
