// functions/src/match/activateCommander.ts
// Callable: flip the caller's commander into "active" state for the rest of
// the match. Activation does NOT consume the turn — the player can still play
// a card or pass on the same turn (matches base44 behavior).
//
// Update 1: wrapped the read-check-write of the usedFlag in db.runTransaction
// so a rapid double-tap (or any other parallel call) can't pass the
// already-used check twice. validatePlayerAction stays outside the tx since
// it handles auth/turn/match-exists checks that don't need atomicity.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { validatePlayerAction } from './validateAction';
import type { ActivateCommanderResult } from '../types/actions';
import type { MatchSession } from '../types/match';
import type { Lane } from '../lib/matchConstants';

type ActivateCommanderInput = { matchId: string };

export const activateCommander = onCall<ActivateCommanderInput, Promise<ActivateCommanderResult>>(
  { region: 'us-central1' },
  async (request) => {
    const { matchId } = request.data;
    if (!matchId) {
      throw new HttpsError('invalid-argument', 'matchId is required.');
    }

    const db = admin.firestore();
    const ctx = await validatePlayerAction(request, matchId, db);

    const usedFlag = ctx.callerSide === 'player_a' ? 'player_a_commander_used' : 'player_b_commander_used';
    const activeLaneField = ctx.callerSide === 'player_a' ? 'player_a_commander_active_lane' : 'player_b_commander_active_lane';
    const commanderIdField = ctx.callerSide === 'player_a' ? 'player_a_commander_id' : 'player_b_commander_id';

    const result = await db.runTransaction(async (tx) => {
      // ── Reads (all before any writes; Firestore transaction rule) ────────
      const sessionSnap = await tx.get(ctx.sessionRef);
      if (!sessionSnap.exists) {
        throw new HttpsError('not-found', 'Match not found.');
      }
      const session = sessionSnap.data() as MatchSession;

      if (session[usedFlag]) {
        throw new HttpsError('failed-precondition', 'Commander already used this match.');
      }

      const commanderId = session[commanderIdField] as string;
      const cmdSnap = await tx.get(db.collection('commander_library').doc(commanderId));
      if (!cmdSnap.exists) {
        throw new HttpsError('internal', `Commander not found: ${commanderId}`);
      }
      const commanderLane = cmdSnap.data()!.lane as Lane;

      // ── Writes ───────────────────────────────────────────────────────────
      // active_turn is intentionally untouched.
      tx.update(ctx.sessionRef, {
        [usedFlag]: true,
        [activeLaneField]: commanderLane,
        updated_at: FieldValue.serverTimestamp(),
      });

      return { commanderId, commanderLane };
    });

    logger.info('Commander activated', {
      match_id: matchId,
      caller: ctx.callerSide,
      commander_id: result.commanderId,
      active_lane: result.commanderLane,
    });

    return {
      success: true,
      commander_id: result.commanderId,
      active_lane: result.commanderLane,
    };
  },
);
