// src/lib/completeOnboarding.ts
// Final step of the new-player flow. Atomically grants the wallet, starter
// inventory, and a 15-slot active deck for the player's chosen faction, and
// flips player_profiles/{uid}.onboarding_step from 3 → 4.
//
// TODO Phase 6: Port to Cloud Function for full atomicity guarantees.
//   D10.5 hotfix: dual idempotency layer (wallet+slots) plus deterministic
//   slot IDs prevent duplicate grants in current client-side implementation.
// The signature `(uid, factionId) => Promise<void>` is the contract the home
// screen relies on; keep it stable across the Cloud Function swap.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { STARTER_SETS } from './starterSets';
import type { FactionId } from './factions';
import type { PlayerProfile } from '../types/player';

export async function completeOnboarding(
  uid: string,
  factionId: FactionId
): Promise<void> {
  console.log('completeOnboarding: invoked', { uid, factionId });

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

  // 2. Idempotency Layer 1a: wallet doc existence.
  //    If the wallet exists, the player was already provisioned in a prior
  //    invocation. Make sure the profile step reflects that and bail.
  const walletRef = doc(db, 'player_wallets', uid);
  const walletSnap = await getDoc(walletRef);
  if (walletSnap.exists()) {
    console.log('completeOnboarding: skipping — wallet exists', { uid });
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

  // 3. Idempotency Layer 1b: deck slots subcollection.
  //    Catches the TOCTOU window where two concurrent invocations both saw
  //    no wallet but one already started writing slots. A single existing
  //    slot is enough evidence that another run is in flight or completed.
  const slotsRef = collection(db, 'player_active_decks', uid, 'slots');
  const slotsSnap = await getDocs(query(slotsRef, limit(1)));
  if (!slotsSnap.empty) {
    console.log('completeOnboarding: skipping — deck slots exist', {
      uid,
      first_slot_id: slotsSnap.docs[0].id,
    });
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

  // 4. Look up the starter set for the chosen faction.
  const starter = STARTER_SETS[factionId];
  if (!starter) {
    throw new Error(
      `completeOnboarding: no starter set defined for faction "${factionId}"`
    );
  }

  // 5. Build a single atomic batch: wallet + inventory + deck + profile bump.
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

  // Deck: expand each entry's quantity into individual slot docs with
  // deterministic IDs of the form `${card_id}__${i}`. Three Royal Archers in
  // the starter become slots UNT-VAN-04__0, UNT-VAN-04__1, UNT-VAN-04__2.
  // Determinism means a duplicate invocation overwrites the same docs instead
  // of creating new ones — second-line defense behind the Layer 1 checks.
  for (const entry of starter) {
    for (let i = 0; i < entry.quantity; i++) {
      const slotId = `${entry.card_id}__${i}`;
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

  console.log('completeOnboarding: writing batch', {
    uid,
    starter_set_size: starter.length,
    total_slot_count: starter.reduce((sum, e) => sum + e.quantity, 0),
  });

  await batch.commit();

  console.log('completeOnboarding: complete', { uid });
}
