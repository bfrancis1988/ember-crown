// functions/src/economy/craftCard.ts
// Callable: spends dust to mint a specific card into the player's inventory.
// Refuses if the player is already at MAX_COPIES_PER_CARD for that card.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { CRAFT_DUST_COSTS, MAX_COPIES_PER_CARD } from '../lib/banners';
import type { Rarity } from '../lib/banners';

type CraftInput = { card_id: string };

type CraftResult = {
  success: true;
  card_id: string;
  rarity: Rarity;
  dust_spent: number;
  quantity_owned_after: number;
  wallet_after: { coins: number; shards: number; keys: number; dust: number };
};

export const craftCard = onCall<CraftInput, Promise<CraftResult>>(
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
    const libRef = db.collection('card_library').doc(cardId);
    const libSnap = await libRef.get();
    if (!libSnap.exists) {
      throw new HttpsError('not-found', `Card not found: ${cardId}`);
    }
    const cardData = libSnap.data()!;
    const rarity = cardData.rarity as Rarity;
    const dustCost = CRAFT_DUST_COSTS[rarity];

    const result = await db.runTransaction(async (tx) => {
      const walletRef = db.collection('player_wallets').doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new HttpsError('failed-precondition', 'Wallet not found.');
      }
      const wallet = walletSnap.data()!;
      const dust = wallet.dust ?? 0;

      if (dust < dustCost) {
        throw new HttpsError(
          'failed-precondition',
          `Insufficient dust: ${dust} < ${dustCost}`
        );
      }

      const inventoryRef = db
        .collection('player_inventories')
        .doc(uid)
        .collection('cards')
        .doc(cardId);
      const inventorySnap = await tx.get(inventoryRef);
      const currentQuantity = inventorySnap.exists
        ? (inventorySnap.data()?.quantity_owned ?? 0)
        : 0;

      if (currentQuantity >= MAX_COPIES_PER_CARD) {
        throw new HttpsError(
          'failed-precondition',
          `Already at max copies (${MAX_COPIES_PER_CARD}).`
        );
      }

      const newQuantity = currentQuantity + 1;

      tx.update(walletRef, {
        dust: FieldValue.increment(-dustCost),
        updated_at: FieldValue.serverTimestamp(),
      });

      if (inventorySnap.exists) {
        tx.update(inventoryRef, { quantity_owned: newQuantity });
      } else {
        tx.set(inventoryRef, {
          card_id: cardId,
          quantity_owned: newQuantity,
          acquired_at: FieldValue.serverTimestamp(),
        });
      }

      const walletAfter = {
        coins: wallet.coins ?? 0,
        shards: wallet.shards ?? 0,
        keys: wallet.keys ?? 0,
        dust: dust - dustCost,
      };

      logger.info('Card crafted', {
        uid,
        card_id: cardId,
        rarity,
        dust_spent: dustCost,
        quantity_owned_after: newQuantity,
      });

      return {
        success: true as const,
        card_id: cardId,
        rarity,
        dust_spent: dustCost,
        quantity_owned_after: newQuantity,
        wallet_after: walletAfter,
      };
    });

    return result;
  }
);
