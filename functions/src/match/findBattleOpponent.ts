// functions/src/match/findBattleOpponent.ts
// Phase 9.4.5C: matchmaking for Battle Mode. Range-queries the
// player_saved_decks collection group within ±25 power of the player's
// chosen deck, expanding to ±50 then ±100 if the initial pool is empty.
// Excludes the calling player's own decks and any deck whose owner has
// opted out (battle_mode_decks_shareable=false on their profile).
//
// Exposed both as a public callable (for UI previews of who you'd face)
// and as an internal helper invoked by initializeNewMatch when mode=
// 'battle_mode'.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { anonymizedNameFor } from '../lib/anonymizedNames';
import type { SavedDeck } from '../types/savedDeck';

const TOLERANCE_TIERS = [25, 50, 100] as const;

export type FindBattleOpponentInput = {
  player_deck_id: string;
};

export type FindBattleOpponentResult = {
  success: true;
  opponent_deck: SavedDeck;
  opponent_display_name: string;
};

export type ResolvedBattleOpponent = {
  opponentDeck: SavedDeck;
  opponentDisplayName: string;
  opponentSourceUid: string;
  fellBackToFreshAi: boolean;
};

/**
 * Internal helper — also called by initializeNewMatch with mode=
 * 'battle_mode'. Returns null when the saved-deck pool is completely
 * empty (caller should fall back to a fresh AI deck).
 */
export async function resolveBattleOpponent(
  uid: string,
  playerDeck: SavedDeck,
  db: admin.firestore.Firestore,
): Promise<ResolvedBattleOpponent | null> {
  const candidates = await queryCandidatePool(uid, playerDeck, db);

  if (candidates.length === 0) {
    return null;
  }

  // Random pick from the first non-empty tier.
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    opponentDeck: chosen.deck,
    opponentDisplayName: anonymizedNameFor(chosen.deck.deck_id),
    opponentSourceUid: chosen.sourceUid,
    fellBackToFreshAi: false,
  };
}

type CandidateEntry = { deck: SavedDeck; sourceUid: string };

async function queryCandidatePool(
  uid: string,
  playerDeck: SavedDeck,
  db: admin.firestore.Firestore,
): Promise<CandidateEntry[]> {
  const power = playerDeck.power_score;
  const faction = playerDeck.faction;

  // Build the set of opted-out uids once so we don't re-query per tier.
  const optedOutUids = await readOptedOutUids(db);

  for (const tolerance of TOLERANCE_TIERS) {
    const min = power - tolerance;
    const max = power + tolerance;

    const snap = await db
      .collectionGroup('decks')
      .where('faction', '==', faction)
      .where('battle_mode_eligible', '==', true)
      .where('power_score', '>=', min)
      .where('power_score', '<=', max)
      .get();

    const matches: CandidateEntry[] = [];
    for (const d of snap.docs) {
      const data = d.data() as SavedDeck;
      const sourceUid = data.source_player_uid;
      if (!sourceUid || sourceUid === uid) continue;
      if (optedOutUids.has(sourceUid)) continue;
      matches.push({ deck: data, sourceUid });
    }

    if (matches.length > 0) {
      return matches;
    }
  }

  // Final fallback: closest deck >= power above tolerance (don't hang the
  // matchmaking just because nobody is in range; player accepts a stronger
  // deck rather than waiting). Only triggers if all 3 tiers were empty.
  const fallbackSnap = await db
    .collectionGroup('decks')
    .where('faction', '==', faction)
    .where('battle_mode_eligible', '==', true)
    .where('power_score', '>=', power)
    .orderBy('power_score', 'asc')
    .limit(20)
    .get();
  const fallback: CandidateEntry[] = [];
  for (const d of fallbackSnap.docs) {
    const data = d.data() as SavedDeck;
    const sourceUid = data.source_player_uid;
    if (!sourceUid || sourceUid === uid) continue;
    if (optedOutUids.has(sourceUid)) continue;
    fallback.push({ deck: data, sourceUid });
    if (fallback.length >= 5) break;
  }
  return fallback;
}

/**
 * Read player_profiles where battle_mode_decks_shareable === false. Small
 * set in v1 (default is true). Cached at function-cold-start scope would
 * be premature optimization — Battle Mode traffic is low until launch.
 */
async function readOptedOutUids(
  db: admin.firestore.Firestore,
): Promise<Set<string>> {
  const snap = await db
    .collection('player_profiles')
    .where('battle_mode_decks_shareable', '==', false)
    .get();
  const out = new Set<string>();
  snap.docs.forEach((d) => out.add(d.id));
  return out;
}

export const findBattleOpponent = onCall<FindBattleOpponentInput, Promise<FindBattleOpponentResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const playerDeckId = request.data?.player_deck_id;
    if (typeof playerDeckId !== 'string' || playerDeckId.length === 0) {
      throw new HttpsError('invalid-argument', 'player_deck_id is required.');
    }

    const db = admin.firestore();
    const playerDeckSnap = await db
      .collection('player_saved_decks')
      .doc(uid)
      .collection('decks')
      .doc(playerDeckId)
      .get();
    if (!playerDeckSnap.exists) {
      throw new HttpsError('not-found', `Deck ${playerDeckId} not found.`);
    }
    const playerDeck = playerDeckSnap.data() as SavedDeck;

    const resolved = await resolveBattleOpponent(uid, playerDeck, db);
    if (!resolved) {
      throw new HttpsError(
        'failed-precondition',
        'Battle Mode pool is empty. Try again once more players have built decks.',
      );
    }

    logger.info('Battle Mode opponent resolved', {
      uid,
      player_deck: playerDeckId,
      opponent_deck: resolved.opponentDeck.deck_id,
      opponent_uid: resolved.opponentSourceUid,
      power_delta: resolved.opponentDeck.power_score - playerDeck.power_score,
    });

    return {
      success: true as const,
      opponent_deck: resolved.opponentDeck,
      opponent_display_name: resolved.opponentDisplayName,
    };
  },
);
