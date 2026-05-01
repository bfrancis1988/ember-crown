// src/lib/completeOnboarding.ts
// Final step of the new-player flow. Atomically grants the wallet, starter
// inventory, and a 15-slot active deck for the player's chosen faction, and
// flips player_profiles/{uid}.onboarding_step from 3 → 4.
//
// Phase 6 will port this body to a Cloud Function. The signature
// `(uid, factionId) => Promise<void>` is the contract the home screen relies
// on; keep it stable across that swap.

import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { randomUUID } from 'expo-crypto';
import { db } from './firebase';
import { STARTER_SETS } from './starterSets';
import type { FactionId } from './factions';
import type { PlayerProfile } from '../types/player';

export async function completeOnboarding(
  uid: string,
  factionId: FactionId
): Promise<void> {
  // 1. Read profile and enforce pre-conditions.
  const profileRef = doc(db, 'player_profiles', uid);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    throw new Error('completeOnboarding: player profile does not exist');
  }
  const profile = profileSnap.data() as PlayerProfile;

  if (profile.onboarding_step < 3) {
    throw new Error(
      `completeOnboarding: profile not ready (onboarding_step=${profile.onboarding_step}, expected 3)`
    );
  }
  if (!profile.active_faction) {
    throw new Error('completeOnboarding: profile has no active_faction');
  }

  // 2. Idempotency: if the wallet doc already exists, the player has already
  //    been provisioned. Make sure the profile step reflects that and bail.
  //    Covers the "user closed app mid-write" and "manual step rollback" cases.
  const walletRef = doc(db, 'player_wallets', uid);
  const walletSnap = await getDoc(walletRef);
  if (walletSnap.exists()) {
    if (profile.onboarding_step < 4) {
      const fixupBatch = writeBatch(db);
      fixupBatch.update(profileRef, {
        onboarding_step: 4,
        updated_at: serverTimestamp(),
      });
      await fixupBatch.commit();
    }
    return;
  }

  // 3. Look up the starter set for the chosen faction.
  const starter = STARTER_SETS[factionId];
  if (!starter) {
    throw new Error(
      `completeOnboarding: no starter set defined for faction "${factionId}"`
    );
  }

  // 4. Build a single atomic batch: wallet + inventory + deck + profile bump.
  //    ~23 ops for Vanguard (1 + 6 + 15 + 1), well under the 500-op batch cap.
  const batch = writeBatch(db);

  batch.set(walletRef, {
    player_id: uid,
    coins: 0,
    shards: 0,
    keys: 0,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  // Inventory: one doc per starter entry, doc id IS the card_id, quantity is
  // collapsed onto the doc.
  for (const entry of starter) {
    const cardRef = doc(db, 'player_inventories', uid, 'cards', entry.card_id);
    batch.set(cardRef, {
      card_id: entry.card_id,
      quantity_owned: entry.quantity,
      acquired_at: serverTimestamp(),
    });
  }

  // Deck: expand each entry's quantity into individual slot docs with fresh
  // UUIDs. Three Royal Archers in the starter become three slots.
  for (const entry of starter) {
    for (let i = 0; i < entry.quantity; i++) {
      const slotId = randomUUID();
      const slotRef = doc(db, 'player_active_decks', uid, 'slots', slotId);
      batch.set(slotRef, {
        slot_id: slotId,
        card_id: entry.card_id,
        added_at: serverTimestamp(),
      });
    }
  }

  batch.update(profileRef, {
    onboarding_step: 4,
    updated_at: serverTimestamp(),
  });

  await batch.commit();
}
