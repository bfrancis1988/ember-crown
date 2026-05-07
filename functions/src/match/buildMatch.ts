// Pure logic for building a new match. No Firestore writes happen here —
// the caller (initializeNewMatch) does the batch.commit().

import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { STARTING_HAND_SIZE, DECK_SIZE, type Lane } from '../lib/matchConstants';
import type { LiveBoardState, LocationState } from '../types/board';
import { laneToLocationState } from '../types/board';
import type { Side } from '../types/match';
import type { Rarity } from '../lib/banners';

// Phase 9.4.3B — rarity cap for AI deck composition. Order matters; index is
// the comparison key (Common=0, Legendary=4).
const RARITY_ORDER: readonly Rarity[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
] as const;

// Server writes use FieldValue.serverTimestamp(); reads always come back as
// Timestamp. Widen the input type so the cast lives at the call site only.
type WriteTimestamp = Timestamp | FieldValue;

/**
 * Pull a random pool of Unit cards from card_library for the given faction
 * and sample 15. If the faction has fewer than 15 units, sample with
 * replacement — the bot deck is allowed to have duplicates in that edge case.
 *
 * Phase 9.4.3B — `maxRarity` (optional) caps the pool to cards at or below
 * that rarity tier. Used to keep the AI from running Legendaries against a
 * player who only owns Commons. If the cap leaves an empty pool, falls back
 * to the unfiltered faction pool (defensive — shouldn't trigger if seeded).
 */
export async function buildBotDeckCardIds(
  faction: string,
  db: Firestore,
  maxRarity?: Rarity,
): Promise<string[]> {
  const snap = await db
    .collection('card_library')
    .where('faction', '==', faction)
    .where('card_type', '==', 'Unit')
    .get();

  const allCards = snap.docs.map((d) => ({
    card_id: d.data().card_id as string,
    rarity: d.data().rarity as Rarity,
  }));
  if (allCards.length === 0) {
    throw new Error(`No Unit cards found in card_library for faction ${faction}`);
  }

  let pool: string[];
  if (maxRarity) {
    const maxIdx = RARITY_ORDER.indexOf(maxRarity);
    const eligible = allCards.filter(
      (c) => RARITY_ORDER.indexOf(c.rarity) <= maxIdx,
    );
    pool = eligible.length > 0
      ? eligible.map((c) => c.card_id)
      : allCards.map((c) => c.card_id);
  } else {
    pool = allCards.map((c) => c.card_id);
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
 * Phase 9.4.3B — read player inventory and return the highest rarity they own
 * (any quantity_owned >= 1). Returns 'Uncommon' as the floor for fresh
 * accounts so the tutorial / first solo match stays friendly.
 */
export async function getPlayerBestOwnedRarity(
  uid: string,
  db: Firestore,
): Promise<Rarity> {
  const inventorySnap = await db
    .collection('player_inventories')
    .doc(uid)
    .collection('cards')
    .get();

  if (inventorySnap.empty) return 'Uncommon';

  const ownedCardIds = inventorySnap.docs
    .filter((d) => (d.data().quantity_owned ?? 0) >= 1)
    .map((d) => d.id);

  if (ownedCardIds.length === 0) return 'Uncommon';

  // Look up rarities. card_library is keyed by card_id.
  const refs = ownedCardIds.map((id) => db.collection('card_library').doc(id));
  const docs = await db.getAll(...refs);

  let bestIdx = RARITY_ORDER.indexOf('Uncommon');
  for (const d of docs) {
    if (!d.exists) continue;
    const rarity = d.data()!.rarity as Rarity;
    const idx = RARITY_ORDER.indexOf(rarity);
    if (idx > bestIdx) bestIdx = idx;
  }
  return RARITY_ORDER[bestIdx];
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
 *
 * Optional preplacedCardsForB pre-places N cards from the bot's deck into a
 * specified lane (used by boss stages with starting_lane_buff). For each
 * { card_id, lane } entry, the first un-consumed instance of that card_id in
 * playerBCardIds is set to that lane's location_state. Remaining cards are
 * dealt normally — first STARTING_HAND_SIZE non-preplaced go to 'hand', rest
 * to 'deck'. So a 15-card deck with 2 preplaced becomes 7 hand + 6 deck + 2 lane.
 */
export function buildBoardStateDocs(args: {
  matchId: string;
  playerACardIds: string[];
  playerBCardIds: string[];
  cardLibraryMap: Map<string, { base_power: number }>;
  now: WriteTimestamp;
  preplacedCardsForB?: Array<{ card_id: string; lane: Lane }>;
}): LiveBoardState[] {
  const {
    matchId,
    playerACardIds,
    playerBCardIds,
    cardLibraryMap,
    now,
    preplacedCardsForB,
  } = args;

  // Player deck must always be exactly DECK_SIZE.
  // Bot deck must be at least STARTING_HAND_SIZE (so it can deal a hand);
  // tutorial bots use a smaller curated deck.
  if (playerACardIds.length !== DECK_SIZE) {
    throw new Error(
      `Player deck must have exactly ${DECK_SIZE} cards ` +
        `(got ${playerACardIds.length})`,
    );
  }
  if (playerBCardIds.length < STARTING_HAND_SIZE) {
    throw new Error(
      `Bot deck must have at least ${STARTING_HAND_SIZE} cards ` +
        `(got ${playerBCardIds.length})`,
    );
  }

  const buildSide = (
    cardIds: string[],
    owner: Side,
    preplacements: Array<{ card_id: string; lane: Lane }> | null,
  ): LiveBoardState[] => {
    const preplaceLaneByIndex: Array<Lane | null> = new Array(cardIds.length).fill(null);
    if (preplacements && preplacements.length > 0) {
      const consumed = new Array<boolean>(cardIds.length).fill(false);
      for (const pre of preplacements) {
        const idx = cardIds.findIndex(
          (id, i) => !consumed[i] && id === pre.card_id,
        );
        if (idx === -1) {
          throw new Error(
            `Preplaced card ${pre.card_id} not found in ${owner} deck (lane ${pre.lane})`,
          );
        }
        consumed[idx] = true;
        preplaceLaneByIndex[idx] = pre.lane;
      }
    }
    let dealtHand = 0;
    return cardIds.map((cardId, idx) => {
      const lib = cardLibraryMap.get(cardId);
      if (!lib) throw new Error(`card_library lookup missing for ${cardId}`);
      const lane = preplaceLaneByIndex[idx];
      let location_state: LocationState;
      if (lane) {
        location_state = laneToLocationState(lane);
      } else if (dealtHand < STARTING_HAND_SIZE) {
        location_state = 'hand';
        dealtHand++;
      } else {
        location_state = 'deck';
      }
      return {
        instance_id: crypto.randomUUID(),
        match_id: matchId,
        owner,
        card_id: cardId,
        current_power: lib.base_power,
        location_state,
        status_effect: null,
        created_at: now as Timestamp,
      };
    });
  };

  return [
    ...buildSide(playerACardIds, 'player_a', null),
    ...buildSide(playerBCardIds, 'player_b', preplacedCardsForB ?? null),
  ];
}

/**
 * Coin flip: 50/50 between player_a and player_b.
 */
export function pickFirstTurn(): Side {
  return Math.random() < 0.5 ? 'player_a' : 'player_b';
}
