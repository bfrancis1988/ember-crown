// functions/src/match/playCardToLane.ts
// Callable: places a unit into a lane OR casts a spell (curse/cleanse).
// Auth + turn validation here; write logic lives in playCardHelper so
// executeAITurn (D6) can reuse it without going through callable auth.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { validatePlayerAction } from './validateAction';
import { LANES, type Lane } from '../lib/matchConstants';
import { playCardHelper } from './playCardHelper';
import type { PlayCardResult } from '../types/actions';

type PlayCardInput = {
  matchId: string;
  instanceId: string;
  targetLane: Lane;
  // Phase 9.4.2B — present when the played card has the Ritual keyword and
  // the player chose to sacrifice an allied unit. Null/omitted = play
  // without sacrificing (or for all_in_lane Ritual cards which auto-resolve).
  sacrificeTargetInstanceId?: string | null;
};

export const playCardToLane = onCall<PlayCardInput, Promise<PlayCardResult>>(
  { region: 'us-central1' },
  async (request) => {
    const { matchId, instanceId, targetLane, sacrificeTargetInstanceId } = request.data;

    if (!matchId || !instanceId || !targetLane) {
      throw new HttpsError('invalid-argument', 'matchId, instanceId, targetLane are required.');
    }
    if (!LANES.includes(targetLane)) {
      throw new HttpsError('invalid-argument', `targetLane must be one of: ${LANES.join(', ')}`);
    }

    const db = admin.firestore();
    const ctx = await validatePlayerAction(request, matchId, db);

    return playCardHelper(matchId, instanceId, targetLane, ctx.callerSide, db, {
      sacrificeTargetInstanceId: sacrificeTargetInstanceId ?? null,
    });
  },
);
