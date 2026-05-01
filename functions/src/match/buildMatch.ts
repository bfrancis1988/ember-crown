// Pure logic for building a new match. No Firestore writes happen here —
// the caller (initializeNewMatch) does the batch.commit().

import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { STARTING_HAND_SIZE, DECK_SIZE } from '../lib/matchConstants';
import type { LiveBoardState } from '../types/board';
import type { Side } from '../types/match';

// Server writes use FieldValue.serverTimestamp(); reads always come back as
// Timestamp. Widen the input type so the cast lives at the call site only.
type WriteTimestamp = Timestamp | FieldValue;

/**
 * Pull a random pool of Unit cards from card_library for the given faction
 * and sample 15. If the faction has fewer than 15 units, sample with
 * replacement — the bot deck is allowed to have duplicates in that edge case.
 */
export async function buildBotDeckCardIds(
  faction: string,
  db: Firestore,
): Promise<string[]> {
  const snap = await db
    .collection('card_library')
    .where('faction', '==', faction)
    .where('card_type', '==', 'Unit')
    .get();

  const pool = snap.docs.map((d) => d.data().card_id as string);
  if (pool.length === 0) {
    throw new Error(`No Unit cards found in card_library for faction ${faction}`);
  }

  const picks: string[] = [];
  if (pool.length >= DECK_SIZE) {
    // Sample without replacement: shuffle, take first 15.
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    picks.push(...shuffled.slice(0, DECK_SIZE));
  } else {
    // Sample with replacement (rare fallback; shouldn't hit in v1).
    for (let i = 0; i < DECK_SIZE; i++) {
      picks.push(pool[Math.floor(Math.random() * pool.length)]);
    }
  }
  return picks;
}

/**
 * Pick a random commander_id from commander_library for the given faction.
 */
export async function pickBotCommander(
  faction: string,
  db: Firestore,
): Promise<string> {
  const snap = await db
    .collection('commander_library')
    .where('faction', '==', faction)
    .get();

  if (snap.empty) {
    throw new Error(`No commanders found in commander_library for faction ${faction}`);
  }
  const ids = snap.docs.map((d) => d.data().commander_id as string);
  return ids[Math.floor(Math.random() * ids.length)];
}

/**
 * Build 30 LiveBoardState docs (15 per side). The first STARTING_HAND_SIZE
 * cards in each ordered list go to 'hand'; the rest go to 'deck'.
 */
export function buildBoardStateDocs(args: {
  matchId: string;
  playerACardIds: string[];
  playerBCardIds: string[];
  cardLibraryMap: Map<string, { base_power: number }>;
  now: WriteTimestamp;
}): LiveBoardState[] {
  const { matchId, playerACardIds, playerBCardIds, cardLibraryMap, now } = args;

  if (playerACardIds.length !== DECK_SIZE || playerBCardIds.length !== DECK_SIZE) {
    throw new Error(
      `Both decks must have exactly ${DECK_SIZE} cards ` +
        `(got A=${playerACardIds.length}, B=${playerBCardIds.length})`,
    );
  }

  const buildSide = (cardIds: string[], owner: Side): LiveBoardState[] =>
    cardIds.map((cardId, idx) => {
      const lib = cardLibraryMap.get(cardId);
      if (!lib) throw new Error(`card_library lookup missing for ${cardId}`);
      return {
        instance_id: crypto.randomUUID(),
        match_id: matchId,
        owner,
        card_id: cardId,
        current_power: lib.base_power,
        location_state: idx < STARTING_HAND_SIZE ? 'hand' : 'deck',
        status_effect: null,
        created_at: now as Timestamp,
      };
    });

  return [...buildSide(playerACardIds, 'player_a'), ...buildSide(playerBCardIds, 'player_b')];
}

/**
 * Coin flip: 50/50 between player_a and player_b.
 */
export function pickFirstTurn(): Side {
  return Math.random() < 0.5 ? 'player_a' : 'player_b';
}
