// functions/src/decks/saveDeck.ts
// Phase 9.4.5A: callable for creating or updating a saved deck.
//
// Reads:  card_library/{card_id} for every card_id (rarity + faction +
//         power), commander_library/{commander_id}, player_inventories/
//         {uid}/cards/{card_id} for ownership validation, plus the existing
//         player_saved_decks doc when updating.
// Writes: player_saved_decks/{uid}/decks/{deck_id}. Single doc per call.
//
// Validation rules:
//   - card_ids.length === 15
//   - no more than 4 of any single card_id (4-copy max)
//   - all card_ids exist in card_library
//   - all unit/spell cards belong to specified faction (no cross-faction
//     mixing in v1)
//   - commander_id belongs to specified faction
//   - slot_number in [1, 2, 3]
//   - player owns enough copies of each distinct card_id

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { computeDeckPower } from '../lib/computeDeckPower';

const DECK_SIZE = 15;
const MAX_COPIES = 4;
const VALID_SLOTS = new Set([1, 2, 3]);

type SaveDeckInput = {
  // Provided when updating an existing deck. Omitted/null when creating.
  deck_id?: string | null;
  slot_number: 1 | 2 | 3;
  name: string;
  faction: string;
  commander_id: string;
  card_ids: string[];
};

type SaveDeckResult = {
  success: true;
  deck_id: string;
  power_score: number;
};

export const saveDeck = onCall<SaveDeckInput, Promise<SaveDeckResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in to save a deck.');
    }
    const uid = request.auth.uid;
    const data = request.data;

    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Request body is required.');
    }

    const slot = data.slot_number;
    if (!VALID_SLOTS.has(slot as number)) {
      throw new HttpsError('invalid-argument', `slot_number must be 1, 2, or 3 (got ${slot}).`);
    }

    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'name is required.');
    }
    const name = data.name.trim().slice(0, 40);

    if (typeof data.faction !== 'string' || data.faction.length === 0) {
      throw new HttpsError('invalid-argument', 'faction is required.');
    }
    if (typeof data.commander_id !== 'string' || data.commander_id.length === 0) {
      throw new HttpsError('invalid-argument', 'commander_id is required.');
    }
    if (!Array.isArray(data.card_ids) || data.card_ids.length !== DECK_SIZE) {
      throw new HttpsError(
        'invalid-argument',
        `card_ids must be an array of exactly ${DECK_SIZE} entries.`,
      );
    }
    for (const id of data.card_ids) {
      if (typeof id !== 'string' || id.length === 0) {
        throw new HttpsError('invalid-argument', 'card_ids must contain non-empty strings.');
      }
    }

    // 4-copy max validation, computed up front.
    const countByCardId = new Map<string, number>();
    for (const id of data.card_ids) {
      countByCardId.set(id, (countByCardId.get(id) ?? 0) + 1);
    }
    for (const [cardId, qty] of countByCardId) {
      if (qty > MAX_COPIES) {
        throw new HttpsError(
          'failed-precondition',
          `Deck contains ${qty} copies of ${cardId}; max is ${MAX_COPIES}.`,
        );
      }
    }

    const db = admin.firestore();
    const decksCol = db.collection('player_saved_decks').doc(uid).collection('decks');

    const isUpdate = typeof data.deck_id === 'string' && data.deck_id.length > 0;
    const deckId = isUpdate ? (data.deck_id as string) : decksCol.doc().id;
    const deckRef = decksCol.doc(deckId);

    const result = await db.runTransaction(async (tx) => {
      // ALL READS FIRST.
      const existingSnap = isUpdate ? await tx.get(deckRef) : null;
      if (isUpdate && (!existingSnap || !existingSnap.exists)) {
        throw new HttpsError('not-found', `Deck ${deckId} not found.`);
      }
      if (existingSnap && existingSnap.exists) {
        const existing = existingSnap.data()!;
        if (existing.source_player_uid !== uid) {
          throw new HttpsError('permission-denied', 'Cannot modify another player\'s deck.');
        }
      }

      const distinctCardIds = [...countByCardId.keys()];
      const cardRefs = distinctCardIds.map((id) => db.collection('card_library').doc(id));
      const cardSnaps = cardRefs.length > 0 ? await tx.getAll(...cardRefs) : [];
      const cardLibrary = new Map<string, { rarity: string; faction: string }>();
      for (const snap of cardSnaps) {
        if (!snap.exists) {
          throw new HttpsError('failed-precondition', `Unknown card_id: ${snap.id}`);
        }
        const cdata = snap.data()!;
        cardLibrary.set(snap.id, {
          rarity: cdata.rarity as string,
          faction: cdata.faction as string,
        });
      }

      // Faction validation: every card must belong to the specified faction.
      // (v1 has no universal/neutral cards. If/when neutrals ship, add an
      // exemption here.)
      for (const [cardId, lib] of cardLibrary) {
        if (lib.faction !== data.faction) {
          throw new HttpsError(
            'failed-precondition',
            `Card ${cardId} belongs to ${lib.faction}, not ${data.faction}.`,
          );
        }
      }

      const commanderRef = db.collection('commander_library').doc(data.commander_id);
      const commanderSnap = await tx.get(commanderRef);
      if (!commanderSnap.exists) {
        throw new HttpsError('failed-precondition', `Unknown commander: ${data.commander_id}`);
      }
      const commanderData = commanderSnap.data()!;
      if (commanderData.faction !== data.faction) {
        throw new HttpsError(
          'failed-precondition',
          `Commander ${data.commander_id} belongs to ${commanderData.faction}, not ${data.faction}.`,
        );
      }
      const commanderBasePower = (commanderData.base_power as number | undefined) ?? 0;

      // Inventory ownership check: player must own >= the requested quantity
      // of each distinct card.
      const invRefs = distinctCardIds.map((id) =>
        db.collection('player_inventories').doc(uid).collection('cards').doc(id),
      );
      const invSnaps = invRefs.length > 0 ? await tx.getAll(...invRefs) : [];
      for (const snap of invSnaps) {
        const requested = countByCardId.get(snap.id) ?? 0;
        const owned = snap.exists ? ((snap.data()?.quantity_owned as number | undefined) ?? 0) : 0;
        if (owned < requested) {
          throw new HttpsError(
            'failed-precondition',
            `Need ${requested} copies of ${snap.id}; own ${owned}.`,
          );
        }
      }

      // Power score.
      const powerScore = computeDeckPower(data.card_ids, cardLibrary, {
        base_power: commanderBasePower,
      });

      // Preserve existing battle_mode_eligible / created_at when updating;
      // default to true / now when creating.
      const existing = existingSnap?.data();
      const createdAt = existing?.created_at ?? FieldValue.serverTimestamp();
      const battleModeEligible =
        existing?.battle_mode_eligible !== undefined
          ? (existing.battle_mode_eligible as boolean)
          : true;

      tx.set(deckRef, {
        deck_id: deckId,
        name,
        faction: data.faction,
        commander_id: data.commander_id,
        slot_number: slot,
        card_ids: data.card_ids,
        power_score: powerScore,
        battle_mode_eligible: battleModeEligible,
        source_player_uid: uid,
        created_at: createdAt,
        updated_at: FieldValue.serverTimestamp(),
      });

      return { deck_id: deckId, power_score: powerScore };
    });

    logger.info('Saved deck', {
      uid,
      deck_id: result.deck_id,
      slot_number: slot,
      faction: data.faction,
      power_score: result.power_score,
      is_update: isUpdate,
    });

    return { success: true as const, ...result };
  },
);
