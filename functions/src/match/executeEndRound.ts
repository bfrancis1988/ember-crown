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
import {
  applyBurnAtRoundEnd,
  applyVeteranAtRoundEnd,
  type CardForBurn,
  type CardForVeteran,
} from './keywordEffects';
import { resolvePassiveContext, foresightBonusFor } from './commanderPassives';

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

  // === Step 1a: Load lane cards + card_library entries (used by Burn / Veteran / wipe) ===
  const laneSnap = await db.collection('live_board_state')
    .where('match_id', '==', matchId)
    .where('location_state', 'in', ['melee', 'ranged', 'siege'])
    .get();

  const laneCards = laneSnap.docs.map(d => d.data());

  type CardLibForRoundEnd = {
    base_power: number;
    keywords?: string[];
    keyword_params?: Record<string, unknown>;
  };
  const cardLibraryMap = new Map<string, CardLibForRoundEnd>();

  // Phase 9.4.2B — synthesise lib entries for tokens (no card_library doc).
  const tokenCardIds = new Set<string>();
  for (const c of laneCards) {
    if (c.is_token && c.token_data) {
      tokenCardIds.add(c.card_id as string);
      cardLibraryMap.set(c.card_id as string, {
        base_power: (c.token_data as { base_power?: number }).base_power ?? 0,
        keywords: [],
        keyword_params: {},
      });
    }
  }

  const uniqueCardIds = [...new Set(laneCards.map(c => c.card_id as string))]
    .filter(id => !tokenCardIds.has(id));
  if (uniqueCardIds.length > 0) {
    const cardRefs = uniqueCardIds.map(id => db.collection('card_library').doc(id));
    const libSnaps = await db.getAll(...cardRefs);
    for (const snap of libSnaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      cardLibraryMap.set(data.card_id, {
        base_power: data.base_power,
        keywords: data.keywords ?? [],
        keyword_params: data.keyword_params ?? {},
      });
    }
  }

  const batch = db.batch();

  // === Step 1b: Burn — fires BEFORE VP tally so destroyed units don't score ===
  const burnInputCards: CardForBurn[] = laneCards.map(c => ({
    instance_id: c.instance_id as string,
    owner: c.owner as 'player_a' | 'player_b',
    card_id: c.card_id as string,
    location_state: c.location_state as 'melee' | 'ranged' | 'siege',
    current_power: c.current_power as number,
  }));
  const burnResult = applyBurnAtRoundEnd({
    matchId,
    laneCards: burnInputCards,
    cardLibraryMap,
    batch,
    db,
  });

  // === Step 2: Tally VP, excluding Burn-destroyed units and using post-burn power ===
  const laneTotals = {
    player_a: { melee: 0, ranged: 0, siege: 0 },
    player_b: { melee: 0, ranged: 0, siege: 0 },
  };

  for (const card of laneCards) {
    if (burnResult.destroyed.has(card.instance_id as string)) continue;
    const power = burnResult.updatedPowers.get(card.instance_id as string)
      ?? (card.current_power as number);
    laneTotals[card.owner as 'player_a' | 'player_b'][card.location_state as 'melee' | 'ranged' | 'siege']
      += power;
  }

  // Commander buff: +1 per friendly card (still in lane post-burn) in the active commander's lane.
  const survivingLaneCards = laneCards.filter(
    c => !burnResult.destroyed.has(c.instance_id as string),
  );
  if (session.player_a_commander_active_lane) {
    const loc = session.player_a_commander_active_lane.toLowerCase() as 'melee' | 'ranged' | 'siege';
    const count = survivingLaneCards.filter(c => c.owner === 'player_a' && c.location_state === loc).length;
    laneTotals.player_a[loc] += count;
  }
  if (session.player_b_commander_active_lane) {
    const loc = session.player_b_commander_active_lane.toLowerCase() as 'melee' | 'ranged' | 'siege';
    const count = survivingLaneCards.filter(c => c.owner === 'player_b' && c.location_state === loc).length;
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
    burn_destroyed: burnResult.destroyed.size,
    vp_awarded: { player_a: aVP, player_b: bVP },
  });

  // === Step 3: Veteran — fires at round-end (before wipe) on surviving units ===
  const veteranInputCards: CardForVeteran[] = survivingLaneCards.map(c => ({
    instance_id: c.instance_id as string,
    card_id: c.card_id as string,
    base_power_bonus: c.base_power_bonus as number | undefined,
  }));
  const newBonusByInstance = applyVeteranAtRoundEnd({
    matchId,
    laneCards: veteranInputCards,
    cardLibraryMap,
    batch,
    db,
  });

  // === Step 4: Session resets + lane wipe ===
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

  // Wipe lane cards → discard. Burn-destroyed units already wrote
  // {discard, 0}, so skip them here to avoid stomping the same fields.
  // current_power resets to (base_power + base_power_bonus) so Veteran gains
  // carry into the next time the unit is played.
  for (const card of laneCards) {
    if (burnResult.destroyed.has(card.instance_id as string)) continue;
    const lib = cardLibraryMap.get(card.card_id as string);
    const baseP = lib?.base_power ?? 0;
    const newBonus = newBonusByInstance.get(card.instance_id as string)
      ?? (card.base_power_bonus as number | undefined)
      ?? 0;
    const ref = db.collection('live_board_state').doc(card.instance_id);
    batch.update(ref, {
      location_state: 'discard',
      current_power: baseP + newBonus,
      // Update 1.0.7 — clear accumulated Cleave damage on the lane wipe so a
      // unit's combat damage doesn't conceptually carry past the round.
      damage_taken: 0,
    });
  }

  // === Step 3: Advance round OR end match ===
  if (currentRound < MAX_ROUNDS) {
    sessionUpdates.current_round = currentRound + 1;
    sessionUpdates.player_a_passed = false;
    sessionUpdates.player_b_passed = false;
    sessionUpdates.active_turn = 'player_a'; // base44 behavior: A always starts subsequent rounds.

    // Release 1.2.0 — commander passive: foresight grants +1 to round-start
    // draws for whichever side has activated their Ranged commander. We
    // resolve here (and not at the top of the function) because the round
    // tally / VP / burn logic above doesn't need passive context, and the
    // commander_library reads are skipped entirely when neither side has
    // activated.
    const passiveContext = await resolvePassiveContext(session, db);

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
      // Bot can draw extra under boss rules; default extra is 0.
      // Foresight stacks on top of both the base and the bot bonus.
      const baseDraw =
        side === 'player_b'
          ? END_ROUND_DRAW_COUNT + (session.bot_extra_round_draw ?? 0)
          : END_ROUND_DRAW_COUNT;
      const foresight = foresightBonusFor(side, passiveContext);
      const drawCount = Math.min(baseDraw + foresight, deckArr.length);
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
