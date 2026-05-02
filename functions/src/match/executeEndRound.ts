// functions/src/match/executeEndRound.ts
// Internal round-end executor. Called by the onBothPlayersPassed trigger.
// Tallies VP, wipes board → discard (with current_power reset to base_power),
// advances round (drawing 2 each, resetting passes/commander_active_lane), OR
// flips status to 'game_over' if this was round 3.

import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { MAX_ROUNDS, END_ROUND_DRAW_COUNT } from '../lib/matchConstants';
import type { MatchSession } from '../types/match';

export async function executeEndRoundInternal(
  matchId: string,
  db: admin.firestore.Firestore,
): Promise<void> {
  const sessionRef = db.collection('match_sessions').doc(matchId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    logger.warn('executeEndRound: match not found', { matchId });
    return;
  }
  const session = sessionSnap.data() as MatchSession;

  // Defensive idempotency check — the upcoming write resets both passes,
  // so on a duplicate trigger fire the second invocation falls through here.
  if (session.status !== 'in_progress') return;
  if (!session.player_a_passed || !session.player_b_passed) return;

  const currentRound = session.current_round;
  logger.info('executeEndRound: starting', { matchId, current_round: currentRound });

  // === Step 1: Tally VP from in-lane cards ===
  const laneSnap = await db.collection('live_board_state')
    .where('match_id', '==', matchId)
    .where('location_state', 'in', ['melee', 'ranged', 'siege'])
    .get();

  const laneCards = laneSnap.docs.map(d => d.data());

  const laneTotals = {
    player_a: { melee: 0, ranged: 0, siege: 0 },
    player_b: { melee: 0, ranged: 0, siege: 0 },
  };

  for (const card of laneCards) {
    laneTotals[card.owner as 'player_a' | 'player_b'][card.location_state as 'melee' | 'ranged' | 'siege']
      += card.current_power as number;
  }

  // Commander buff: +1 per friendly card in the active commander's lane.
  if (session.player_a_commander_active_lane) {
    const loc = session.player_a_commander_active_lane.toLowerCase() as 'melee' | 'ranged' | 'siege';
    const count = laneCards.filter(c => c.owner === 'player_a' && c.location_state === loc).length;
    laneTotals.player_a[loc] += count;
  }
  if (session.player_b_commander_active_lane) {
    const loc = session.player_b_commander_active_lane.toLowerCase() as 'melee' | 'ranged' | 'siege';
    const count = laneCards.filter(c => c.owner === 'player_b' && c.location_state === loc).length;
    laneTotals.player_b[loc] += count;
  }

  let aVP = 0, bVP = 0;
  for (const lane of ['melee', 'ranged', 'siege'] as const) {
    const a = laneTotals.player_a[lane];
    const b = laneTotals.player_b[lane];
    if (a > b) aVP++;
    else if (b > a) bVP++;
    // ties award nothing
  }

  logger.info('executeEndRound: VP awarded', {
    matchId,
    round: currentRound,
    lane_totals: laneTotals,
    vp_awarded: { player_a: aVP, player_b: bVP },
  });

  // === Step 2: Build batch (VP + flag resets + board wipe) ===
  const batch = db.batch();

  const sessionUpdates: Record<string, unknown> = {
    player_a_wins: (session.player_a_wins || 0) + aVP,
    player_b_wins: (session.player_b_wins || 0) + bVP,
    player_a_melee_debuffed: false,
    player_a_ranged_debuffed: false,
    player_a_siege_debuffed: false,
    player_b_melee_debuffed: false,
    player_b_ranged_debuffed: false,
    player_b_siege_debuffed: false,
    player_a_commander_active_lane: null,
    player_b_commander_active_lane: null,
    updated_at: FieldValue.serverTimestamp(),
  };

  // Wipe lane cards → discard, with current_power reset to base_power.
  // (D4 trigger skips non-lane cards, so the explicit reset prevents stale values.)
  const uniqueCardIds = [...new Set(laneCards.map(c => c.card_id as string))];
  if (uniqueCardIds.length > 0) {
    const cardRefs = uniqueCardIds.map(id => db.collection('card_library').doc(id));
    const libSnaps = await db.getAll(...cardRefs);
    const basePowerMap = new Map<string, number>();
    for (const snap of libSnaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      basePowerMap.set(data.card_id, data.base_power);
    }
    for (const card of laneCards) {
      const ref = db.collection('live_board_state').doc(card.instance_id);
      batch.update(ref, {
        location_state: 'discard',
        current_power: basePowerMap.get(card.card_id) ?? 0,
      });
    }
  }

  // === Step 3: Advance round OR end match ===
  if (currentRound < MAX_ROUNDS) {
    sessionUpdates.current_round = currentRound + 1;
    sessionUpdates.player_a_passed = false;
    sessionUpdates.player_b_passed = false;
    sessionUpdates.active_turn = 'player_a'; // base44 behavior: A always starts subsequent rounds.

    // Each side draws up to END_ROUND_DRAW_COUNT (could be < if deck empty).
    for (const side of ['player_a', 'player_b'] as const) {
      const deckSnap = await db.collection('live_board_state')
        .where('match_id', '==', matchId)
        .where('owner', '==', side)
        .where('location_state', '==', 'deck')
        .get();

      const deckArr = deckSnap.docs;
      // Fisher-Yates shuffle.
      for (let i = deckArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deckArr[i], deckArr[j]] = [deckArr[j], deckArr[i]];
      }
      const drawCount = Math.min(END_ROUND_DRAW_COUNT, deckArr.length);
      for (let i = 0; i < drawCount; i++) {
        batch.update(deckArr[i].ref, { location_state: 'hand' });
      }
    }
  } else {
    sessionUpdates.status = 'game_over';
  }

  batch.update(sessionRef, sessionUpdates);
  await batch.commit();

  logger.info('executeEndRound: complete', {
    matchId,
    round_ended: currentRound,
    next_round: currentRound < MAX_ROUNDS ? currentRound + 1 : 'GAME_OVER',
    cards_wiped: laneCards.length,
  });
}
