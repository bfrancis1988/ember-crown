// functions/src/match/applyPowerUpdates.ts
// Reads board + session + card_library, computes new powers, writes only the deltas.
// Idempotent — safe to call multiple times for the same match.

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import {
  computePowerUpdates,
  type CardForPowerCalc,
  type CardLibraryDataForPowerCalc,
} from './calculatePower';
import type { MatchSession } from '../types/match';

export async function recalculateMatchPower(
  matchId: string,
  db: admin.firestore.Firestore,
): Promise<number> {
  // 1. Match session
  const sessionSnap = await db.collection('match_sessions').doc(matchId).get();
  if (!sessionSnap.exists) {
    logger.warn('recalculateMatchPower: match not found', { matchId });
    return 0;
  }
  const session = sessionSnap.data() as MatchSession;

  // 2. All lane cards for this match
  const boardSnap = await db
    .collection('live_board_state')
    .where('match_id', '==', matchId)
    .where('location_state', 'in', ['melee', 'ranged', 'siege'])
    .get();

  if (boardSnap.empty) return 0;

  const cards: CardForPowerCalc[] = boardSnap.docs.map((d) => {
    const data = d.data();
    return {
      instance_id: data.instance_id,
      owner: data.owner,
      card_id: data.card_id,
      location_state: data.location_state,
      current_power: data.current_power,
    };
  });

  // 3. card_library lookup for unique card_ids (matches initializeNewMatch's pattern).
  const uniqueCardIds = [...new Set(cards.map((c) => c.card_id))];
  const refs = uniqueCardIds.map((id) => db.collection('card_library').doc(id));
  const cardSnaps = await db.getAll(...refs);

  const cardLibraryMap = new Map<string, CardLibraryDataForPowerCalc>();
  for (const snap of cardSnaps) {
    if (!snap.exists) continue;
    const data = snap.data()!;
    cardLibraryMap.set(data.card_id, {
      card_id: data.card_id,
      card_type: data.card_type,
      base_power: data.base_power,
      optimal_lane: data.optimal_lane,
    });
  }

  // 4. Compute deltas only.
  const updates = computePowerUpdates(cards, cardLibraryMap, session);
  if (updates.length === 0) return 0;

  // 5. Batch write.
  const batch = db.batch();
  for (const update of updates) {
    const ref = db.collection('live_board_state').doc(update.instance_id);
    batch.update(ref, { current_power: update.new_power });
  }
  await batch.commit();

  logger.info('Power recalculated', { matchId, updates_applied: updates.length });
  return updates.length;
}
