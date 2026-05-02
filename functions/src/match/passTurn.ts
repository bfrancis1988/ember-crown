// functions/src/match/passTurn.ts
// Callable: caller opts out of further action this round.
// Auth + turn validation here; write logic lives in passTurnHelper so
// executeAITurn (D6) can reuse it without going through callable auth.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { validatePlayerAction } from './validateAction';
import { passTurnHelper } from './passTurnHelper';
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

    return passTurnHelper(matchId, ctx.callerSide, db);
  },
);
