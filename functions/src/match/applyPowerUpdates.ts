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
import { resolvePassiveContext } from './commanderPassives';
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
      base_power_bonus: data.base_power_bonus,
      damage_taken: data.damage_taken,
    };
  });

  // Phase 9.4.2B — tokens have no card_library entry. Synthesize a power-calc
  // shape from their inline token_data so the rest of the pipeline doesn't
  // need to special-case them.
  const cardLibraryMap = new Map<string, CardLibraryDataForPowerCalc>();
  const tokenCardIds = new Set<string>();
  for (const d of boardSnap.docs) {
    const data = d.data();
    if (data.is_token && data.token_data) {
      tokenCardIds.add(data.card_id);
      cardLibraryMap.set(data.card_id, {
        card_id: data.card_id,
        card_type: 'Unit',
        base_power: data.token_data.base_power ?? 0,
        // Tokens never benefit from optimal_lane bonus — flat power.
        optimal_lane: undefined,
        optimal_lane_bonus: 0,
        faction: data.token_data.faction,
        keywords: [],
        keyword_params: {},
      });
    }
  }

  // 3. card_library lookup for non-token unique card_ids.
  const uniqueCardIds = [...new Set(cards.map((c) => c.card_id))].filter(
    (id) => !tokenCardIds.has(id),
  );
  if (uniqueCardIds.length > 0) {
    const refs = uniqueCardIds.map((id) => db.collection('card_library').doc(id));
    const cardSnaps = await db.getAll(...refs);

    for (const snap of cardSnaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      cardLibraryMap.set(data.card_id, {
        card_id: data.card_id,
        card_type: data.card_type,
        base_power: data.base_power,
        optimal_lane: data.optimal_lane,
        optimal_lane_bonus: data.optimal_lane_bonus,
        faction: data.faction,
        keywords: data.keywords ?? [],
        keyword_params: data.keyword_params ?? {},
      });
    }
  }

  // 4. Resolve commander passive context (Release 1.2.0). Short-circuits to
  // empty if neither side has activated, so no commander_library reads
  // happen in the common case.
  const passiveContext = await resolvePassiveContext(session, db);

  // 5. Compute deltas only.
  const updates = computePowerUpdates(cards, cardLibraryMap, session, passiveContext);
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
