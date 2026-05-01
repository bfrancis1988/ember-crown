// functions/src/match/onBoardStateChange.ts
// Firestore trigger: any live_board_state doc create/update/delete.
// Skips loops by ignoring updates that only changed current_power.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { recalculateMatchPower } from './applyPowerUpdates';

export const onBoardStateChange = onDocumentWritten(
  {
    document: 'live_board_state/{instanceId}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    let matchId: string | undefined;
    if (after) matchId = after.match_id;
    else if (before) matchId = before.match_id;
    if (!matchId) return;

    // Loop prevention: on updates, only re-fire when something other than
    // current_power changed. (location_state, card_id, owner are the
    // inputs to computeCardPower besides session-level state.)
    if (before && after) {
      const meaningfulChange =
        before.location_state !== after.location_state ||
        before.card_id !== after.card_id ||
        before.owner !== after.owner;
      if (!meaningfulChange) return;
    }

    await recalculateMatchPower(matchId, admin.firestore());
  },
);
