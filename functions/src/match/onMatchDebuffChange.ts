// functions/src/match/onMatchDebuffChange.ts
// Firestore trigger: match_sessions/{matchId} updates. Re-fires power
// recalculation only when a lane debuff flag changes.
//
// Lives alongside onMatchTurnChange (D3), which watches active_turn on the
// same doc. Both are onDocumentUpdated and may fire in parallel; that's fine
// because they touch different state (turn dispatch vs. derived power).

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { recalculateMatchPower } from './applyPowerUpdates';
import { LANES, debuffFieldKey } from '../lib/matchConstants';

export const onMatchDebuffChange = onDocumentUpdated(
  {
    document: 'match_sessions/{matchId}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const sides = ['player_a', 'player_b'] as const;
    let anyDebuffChanged = false;
    outer: for (const side of sides) {
      for (const lane of LANES) {
        const key = debuffFieldKey(side, lane);
        if (before[key] !== after[key]) {
          anyDebuffChanged = true;
          break outer;
        }
      }
    }
    if (!anyDebuffChanged) return;

    await recalculateMatchPower(event.params.matchId, admin.firestore());
  },
);
