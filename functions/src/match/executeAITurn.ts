// functions/src/match/executeAITurn.ts
// Internal AI turn executor. Not a callable / not a trigger — invoked by:
//   - onMatchTurnChange when active_turn flips to player_b (mid-match)
//   - initializeNewMatch when the bot won the coin flip (creation case;
//     onMatchTurnChange does not fire on document creation)
//
// Recursive: if the human has passed, the bot's action does not flip
// active_turn (nextActiveTurn keeps it on the bot), so we re-enter ourselves
// until the bot also passes or empties its hand. MAX_AI_ITERATIONS guards
// against pathological loops.

import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { decideAIAction, type HandCard, type LaneCard } from './aiHeuristics';
import { playCardHelper } from './playCardHelper';
import { passTurnHelper } from './passTurnHelper';
import { AI_BOT_UID } from '../lib/matchConstants';
import type { MatchSession } from '../types/match';

const MAX_AI_ITERATIONS = 20;

export async function executeAITurnInternal(
  matchId: string,
  db: admin.firestore.Firestore,
  iteration: number = 0,
): Promise<void> {
  if (iteration >= MAX_AI_ITERATIONS) {
    logger.error('executeAITurn: max iterations reached', { matchId, iteration });
    return;
  }

  // 1. Load session.
  const sessionRef = db.collection('match_sessions').doc(matchId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    logger.warn('executeAITurn: match not found', { matchId });
    return;
  }
  const session = sessionSnap.data() as MatchSession;

  // 2. Guard: only act if conditions are right.
  if (session.status !== 'in_progress') return;
  if (session.active_turn !== 'player_b') return;
  if (session.player_b_id !== AI_BOT_UID) return;
  if (session.player_b_passed) return;

  // 2a. Tutorial mode: queue-driven scripted bot.
  if (session.mode === 'tutorial' && session.bot_scripted_actions) {
    return executeScriptedAITurn(matchId, session, db, iteration);
  }

  // 3. Load bot's hand.
  const handSnap = await db.collection('live_board_state')
    .where('match_id', '==', matchId)
    .where('owner', '==', 'player_b')
    .where('location_state', '==', 'hand')
    .get();

  const handInstances = handSnap.docs.map(d => d.data());

  // base_power lookup for hand cards.
  const handCards: HandCard[] = [];
  if (handInstances.length > 0) {
    const uniqueCardIds = [...new Set(handInstances.map(h => h.card_id as string))];
    const refs = uniqueCardIds.map(id => db.collection('card_library').doc(id));
    const libSnaps = await db.getAll(...refs);
    const libMap = new Map<string, number>();
    for (const snap of libSnaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      libMap.set(data.card_id, data.base_power);
    }
    for (const inst of handInstances) {
      handCards.push({
        instance_id: inst.instance_id,
        card_id: inst.card_id,
        base_power: libMap.get(inst.card_id) ?? 0,
      });
    }
  }

  // 4. Load all in-lane cards (both sides) for scoring.
  const laneSnap = await db.collection('live_board_state')
    .where('match_id', '==', matchId)
    .where('location_state', 'in', ['melee', 'ranged', 'siege'])
    .get();
  const laneCards: LaneCard[] = laneSnap.docs.map(d => {
    const data = d.data();
    return {
      instance_id: data.instance_id,
      owner: data.owner,
      card_id: data.card_id,
      location_state: data.location_state,
      current_power: data.current_power,
    };
  });

  // 5. Decide.
  const decision = decideAIAction(handCards, laneCards, session);

  logger.info('AI decision', {
    match_id: matchId,
    iteration,
    hand_size: handCards.length,
    decision,
  });

  // 6. Execute via the same helpers the player callables use.
  try {
    if (decision.action === 'PASS') {
      await passTurnHelper(matchId, 'player_b', db);
    } else {
      await playCardHelper(matchId, decision.instanceId, decision.targetLane, 'player_b', db);
    }
  } catch (err) {
    logger.error('executeAITurn: helper threw', {
      match_id: matchId,
      iteration,
      decision,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // 7. Recursive check. If the human had already passed, our action did not
  // swap active_turn, so the trigger won't fire — we have to re-enter ourselves.
  const updatedSnap = await sessionRef.get();
  if (!updatedSnap.exists) return;
  const updatedSession = updatedSnap.data() as MatchSession;
  if (
    updatedSession.status === 'in_progress' &&
    updatedSession.active_turn === 'player_b' &&
    !updatedSession.player_b_passed
  ) {
    await executeAITurnInternal(matchId, db, iteration + 1);
  }
}

// Tutorial bot: pop the next action from the scripted queue.
// The bot doesn't react to player choices — it follows its queue.
async function executeScriptedAITurn(
  matchId: string,
  session: MatchSession,
  db: admin.firestore.Firestore,
  iteration: number,
): Promise<void> {
  const sessionRef = db.collection('match_sessions').doc(matchId);
  const actions = session.bot_scripted_actions!;
  const actionIndex = session.bot_scripted_action_index ?? 0;

  if (actionIndex >= actions.length) {
    logger.info('Tutorial bot: scripted actions exhausted, passing', { matchId });
    try {
      await passTurnHelper(matchId, 'player_b', db);
    } catch (err) {
      logger.error('executeScriptedAITurn: pass after exhaustion failed', {
        matchId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const action = actions[actionIndex];

  // Increment FIRST so a retry doesn't re-execute the same action.
  await sessionRef.update({ bot_scripted_action_index: actionIndex + 1 });

  try {
    if (action.action === 'pass') {
      await passTurnHelper(matchId, 'player_b', db);
    } else {
      // Load bot's hand and find the matching card_id (in-memory filter
      // avoids a 4-equality composite index).
      const handSnap = await db.collection('live_board_state')
        .where('match_id', '==', matchId)
        .where('owner', '==', 'player_b')
        .where('location_state', '==', 'hand')
        .get();

      const match = handSnap.docs.find((d) => d.data().card_id === action.card_id);
      if (!match) {
        logger.warn('Tutorial bot: scripted card not in hand, passing instead', {
          matchId,
          card_id: action.card_id,
          action_index: actionIndex,
        });
        await passTurnHelper(matchId, 'player_b', db);
      } else {
        await playCardHelper(
          matchId,
          match.data().instance_id,
          action.lane,
          'player_b',
          db,
        );
      }
    }
  } catch (err) {
    logger.error('executeScriptedAITurn: helper threw', {
      matchId,
      iteration,
      action,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Re-enter if turn is still on us (player had already passed).
  const updatedSnap = await sessionRef.get();
  if (!updatedSnap.exists) return;
  const updatedSession = updatedSnap.data() as MatchSession;
  if (
    updatedSession.status === 'in_progress' &&
    updatedSession.active_turn === 'player_b' &&
    !updatedSession.player_b_passed
  ) {
    await executeAITurnInternal(matchId, db, iteration + 1);
  }
}
