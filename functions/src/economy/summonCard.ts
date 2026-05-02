// functions/src/economy/summonCard.ts
// Callable: rolls a card from a banner and atomically debits the player's
// wallet, credits inventory, or converts a duplicate (>4 copies) into dust.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { BANNERS, MAX_COPIES_PER_CARD, DUPLICATE_DUST_VALUES } from '../lib/banners';
import type { BannerId, Rarity } from '../lib/banners';

type SummonInput = { bannerId: BannerId };

type SummonResult = {
  success: true;
  card_id: string;
  rarity: Rarity;
  converted_to_dust: boolean;
  dust_gained?: number;
  quantity_owned_after: number;
  wallet_after: { coins: number; shards: number; keys: number; dust: number };
};

export const summonCard = onCall<SummonInput, Promise<SummonResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const { bannerId } = request.data;

    const banner = BANNERS.find((b) => b.id === bannerId);
    if (!banner) {
      throw new HttpsError('invalid-argument', `Unknown banner: ${bannerId}`);
    }

    const db = admin.firestore();

    const libSnap = await db.collection('card_library').get();
    const cardsByRarity = new Map<Rarity, Array<{ card_id: string; rarity: Rarity }>>();
    libSnap.docs.forEach((d) => {
      const data = d.data();
      const rarity = data.rarity as Rarity;
      const list = cardsByRarity.get(rarity) ?? [];
      list.push({ card_id: data.card_id, rarity });
      cardsByRarity.set(rarity, list);
    });

    function rollRarity(): Rarity {
      const r = Math.random() * 100;
      let cumulative = 0;
      for (const rarity of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as Rarity[]) {
        cumulative += banner!.weights[rarity];
        if (r < cumulative) return rarity;
      }
      return 'Common';
    }

    function rollCardId(rarity: Rarity): string {
      const pool = cardsByRarity.get(rarity);
      if (!pool || pool.length === 0) {
        const fallback = cardsByRarity.get('Common');
        if (!fallback || fallback.length === 0) {
          throw new HttpsError('internal', 'No cards available for any rarity.');
        }
        return fallback[Math.floor(Math.random() * fallback.length)].card_id;
      }
      return pool[Math.floor(Math.random() * pool.length)].card_id;
    }

    const result = await db.runTransaction(async (tx) => {
      const walletRef = db.collection('player_wallets').doc(uid);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new HttpsError('failed-precondition', 'Wallet not found.');
      }
      const wallet = walletSnap.data()!;

      const balance = wallet[banner.currency] ?? 0;
      if (balance < banner.cost) {
        throw new HttpsError(
          'failed-precondition',
          `Insufficient ${banner.currency}: ${balance} < ${banner.cost}`
        );
      }

      const rarity = rollRarity();
      const cardId = rollCardId(rarity);

      const inventoryRef = db
        .collection('player_inventories')
        .doc(uid)
        .collection('cards')
        .doc(cardId);
      const inventorySnap = await tx.get(inventoryRef);
      const currentQuantity = inventorySnap.exists
        ? (inventorySnap.data()?.quantity_owned ?? 0)
        : 0;

      const wouldBeQuantity = currentQuantity + 1;
      const convertedToDust = wouldBeQuantity > MAX_COPIES_PER_CARD;

      const walletUpdates: Record<string, FieldValue | number> = {
        updated_at: FieldValue.serverTimestamp(),
      };
      walletUpdates[banner.currency] = FieldValue.increment(-banner.cost);

      let dustGained = 0;
      if (convertedToDust) {
        dustGained = DUPLICATE_DUST_VALUES[rarity];
        if (banner.currency === 'dust') {
          walletUpdates.dust = FieldValue.increment(dustGained - banner.cost);
        } else {
          walletUpdates.dust = FieldValue.increment(dustGained);
        }
      }

      tx.update(walletRef, walletUpdates);

      let finalQuantity = currentQuantity;
      if (!convertedToDust) {
        finalQuantity = wouldBeQuantity;
        if (inventorySnap.exists) {
          tx.update(inventoryRef, { quantity_owned: finalQuantity });
        } else {
          tx.set(inventoryRef, {
            card_id: cardId,
            quantity_owned: finalQuantity,
            acquired_at: FieldValue.serverTimestamp(),
          });
        }
      }

      const walletAfter = {
        coins: (wallet.coins ?? 0) + (banner.currency === 'coins' ? -banner.cost : 0),
        shards: (wallet.shards ?? 0) + (banner.currency === 'shards' ? -banner.cost : 0),
        keys: (wallet.keys ?? 0) + (banner.currency === 'keys' ? -banner.cost : 0),
        dust:
          (wallet.dust ?? 0) +
          (banner.currency === 'dust' ? -banner.cost : 0) +
          dustGained,
      };

      logger.info('Summon complete', {
        uid,
        banner_id: bannerId,
        rolled_card: cardId,
        rolled_rarity: rarity,
        converted_to_dust: convertedToDust,
        dust_gained: dustGained,
        quantity_owned_after: finalQuantity,
      });

      return {
        success: true as const,
        card_id: cardId,
        rarity,
        converted_to_dust: convertedToDust,
        dust_gained: convertedToDust ? dustGained : undefined,
        quantity_owned_after: finalQuantity,
        wallet_after: walletAfter,
      };
    });

    return result;
  }
);
