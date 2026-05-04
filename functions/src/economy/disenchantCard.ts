// functions/src/economy/disenchantCard.ts
// Voluntarily convert one copy of an owned card to dust. Mirrors the dust
// values of the duplicate-overflow path in summonCard so disenchant and
// pull-overflow value the same card the same way.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { DUPLICATE_DUST_VALUES } from '../lib/banners';
import type { Rarity } from '../lib/banners';

type DisenchantInput = { card_id: string };

type DisenchantResult = {
  success: true;
  card_id: string;
  rarity: Rarity;
  dust_gained: number;
  quantity_owned_after: number;
  wallet_after: { coins: number; shards: number; keys: number; dust: number };
};

// Constraints:
// - Must own at least 1 copy.
// - Cannot disenchant if it would drop owned count below the number of slots
//   in the player's active deck(s) that reference this card_id. This is the
//   "simple rule" — across all factions, owned must remain >= total slots.
//   Prevents accidentally orphaning a deck slot.
export const disenchantCard = onCall<DisenchantInput, Promise<DisenchantResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const { card_id: cardId } = request.data;

    if (!cardId) {
      throw new HttpsError('invalid-argument', 'card_id is required.');
    }

    const db = admin.firestore();

    // Pre-fetch card library entry (outside the transaction — static data) for
    // rarity + dust value.
    const libRef = db.collection('card_library').doc(cardId);
    const libSnap = await libRef.get();
    if (!libSnap.exists) {
      throw new HttpsError('not-found', `Card not found: ${cardId}`);
    }
    const cardData = libSnap.data()!;
    const rarity = cardData.rarity as Rarity;
    const dustValue = DUPLICATE_DUST_VALUES[rarity];

    const result = await db.runTransaction(async (tx) => {
      const inventoryRef = db
        .collection('player_inventories')
        .doc(uid)
        .collection('cards')
        .doc(cardId);
      const inventorySnap = await tx.get(inventoryRef);
      const currentQuantity = inventorySnap.exists
        ? (inventorySnap.data()?.quantity_owned ?? 0)
        : 0;

      if (currentQuantity < 1) {
        throw new HttpsError('failed-precondition', 'Card not owned.');
      }

      // Active-deck guard: count slots across all factions that reference
      // this card_id. The disenchant must not drop owned below that count.
      const slotsQuery = db
        .collection('player_active_decks')
        .doc(uid)
        .collection('slots')
        .where('card_id', '==', cardId);
      const activeDecksSnap = await tx.get(slotsQuery);
      const inActiveDecks = activeDecksSnap.size;

      if (currentQuantity - 1 < inActiveDecks) {
        throw new HttpsError(
          'failed-precondition',
          `Cannot disenchant: card is in active deck (${inActiveDecks} copies needed, you would have ${currentQuantity - 1}).`
        );
      }

      const walletRef = db.collection('player_wallets').doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new HttpsError('failed-precondition', 'Wallet not found.');
      }
      const wallet = walletSnap.data()!;

      const newQuantity = currentQuantity - 1;
      if (newQuantity === 0) {
        tx.delete(inventoryRef);
      } else {
        tx.update(inventoryRef, { quantity_owned: newQuantity });
      }

      tx.update(walletRef, {
        dust: FieldValue.increment(dustValue),
        updated_at: FieldValue.serverTimestamp(),
      });

      const walletAfter = {
        coins: wallet.coins ?? 0,
        shards: wallet.shards ?? 0,
        keys: wallet.keys ?? 0,
        dust: (wallet.dust ?? 0) + dustValue,
      };

      logger.info('Card disenchanted', {
        uid,
        card_id: cardId,
        rarity,
        dust_gained: dustValue,
        quantity_owned_after: newQuantity,
      });

      return {
        success: true as const,
        card_id: cardId,
        rarity,
        dust_gained: dustValue,
        quantity_owned_after: newQuantity,
        wallet_after: walletAfter,
      };
    });

    return result;
  }
);
