// functions/src/match/initializeNewMatch.ts
// Callable: starts a new solo match against the AI bot.
//
// Reads:  player_profiles/{uid}, player_active_decks/{uid}/slots/*,
//         card_library/{card_id} (bot pool + base_power lookup),
//         commander_library/{commander_id} (bot pick).
// Writes: match_sessions/{matchId} + 30 live_board_state/{instance_id} docs
//         in a single batch.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { makeInitialMatchSession } from '../types/match';
import { AI_BOT_UID, DECK_SIZE } from '../lib/matchConstants';
import {
  buildBotDeckCardIds,
  pickBotCommander,
  buildBoardStateDocs,
  pickFirstTurn,
} from './buildMatch';
import type { InitializeNewMatchResult } from '../types/actions';

export const initializeNewMatch = onCall<unknown, Promise<InitializeNewMatchResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in to start a match.');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    // 1. Profile
    const profileSnap = await db.collection('player_profiles').doc(uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError('failed-precondition', 'Player profile not found.');
    }
    const profile = profileSnap.data()!;
    if (!profile.active_faction || !profile.selected_commander) {
      throw new HttpsError('failed-precondition', 'Faction and commander must be set.');
    }
    if ((profile.onboarding_step ?? 0) < 4) {
      throw new HttpsError('failed-precondition', 'Onboarding not complete.');
    }

    // 2. Active deck (15 slots)
    const deckSnap = await db
      .collection('player_active_decks').doc(uid)
      .collection('slots').get();
    if (deckSnap.size !== DECK_SIZE) {
      throw new HttpsError(
        'failed-precondition',
        `Active deck must have exactly ${DECK_SIZE} cards (has ${deckSnap.size}).`,
      );
    }
    const playerACardIds = deckSnap.docs.map((d) => d.data().card_id as string);

    // 3. Bot side
    const botFaction = profile.active_faction as string;
    const playerBCardIds = await buildBotDeckCardIds(botFaction, db);
    const botCommanderId = await pickBotCommander(botFaction, db);

    // 4. base_power lookup for every distinct card_id used. card_library is
    // keyed by card_id, so getAll() is cleaner than an 'in' query (no 30-id
    // batching, no index needed).
    const allCardIds = [...new Set([...playerACardIds, ...playerBCardIds])];
    const refs = allCardIds.map((id) => db.collection('card_library').doc(id));
    const docs = await db.getAll(...refs);
    const cardLibraryMap = new Map<string, { base_power: number }>();
    for (const d of docs) {
      if (!d.exists) {
        throw new HttpsError(
          'internal',
          `card_library missing entry for ${d.id}. Reseed card_library.`,
        );
      }
      const data = d.data()!;
      cardLibraryMap.set(data.card_id as string, {
        base_power: data.base_power as number,
      });
    }

    // 5. Build docs
    const matchId = crypto.randomUUID();
    // serverTimestamp() returns FieldValue at write-time; Firestore resolves
    // it to a Timestamp on commit, and reads always come back as Timestamp.
    // The cast keeps the shared MatchSession/LiveBoardState types honest
    // for the read side.
    const now = FieldValue.serverTimestamp() as unknown as admin.firestore.Timestamp;
    const firstTurn = pickFirstTurn();

    const matchSession = makeInitialMatchSession(
      {
        match_id: matchId,
        player_a_id: uid,
        player_b_id: AI_BOT_UID,
        player_a_commander_id: profile.selected_commander as string,
        player_b_commander_id: botCommanderId,
        active_turn: firstTurn,
        bot_difficulty: 'standard',
      },
      now,
    );

    const boardStateDocs = buildBoardStateDocs({
      matchId,
      playerACardIds,
      playerBCardIds,
      cardLibraryMap,
      now,
    });

    // 6. Atomic write: 1 match_session + 30 live_board_state = 31 ops (well
    // under the 500 batch limit).
    const batch = db.batch();
    batch.set(db.collection('match_sessions').doc(matchId), matchSession);
    for (const board of boardStateDocs) {
      batch.set(db.collection('live_board_state').doc(board.instance_id), board);
    }
    await batch.commit();

    logger.info('Match initialized', {
      match_id: matchId,
      player_a_id: uid,
      player_b_id: AI_BOT_UID,
      first_turn: firstTurn,
      player_a_commander: profile.selected_commander,
      player_b_commander: botCommanderId,
    });

    return {
      match_id: matchId,
      first_turn: firstTurn,
      player_a_commander_id: profile.selected_commander as string,
      player_b_commander_id: botCommanderId,
    };
  },
);
