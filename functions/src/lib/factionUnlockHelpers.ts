// functions/src/lib/factionUnlockHelpers.ts
// Phase 9.4.4 — solo-faction unlock via collection threshold (12 unique cards).
//
// Sticky semantics: once a faction crosses the threshold it stays in
// player_profiles.solo_unlocked_factions even if the player later disenchants
// below the threshold. As a consequence, disenchantCard does NOT need to call
// this helper — only paths that ADD cards (summonCard, craftCard) can ever
// move the needle.

import { Transaction } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

const ALL_FACTIONS = [
  'Vanguard Kingdoms',
  'Iron Pact',
  'Arborea Kingdom',
  'Ashen Swarm',
  'Obsidian Empire',
  'Feral Hollow',
] as const;

export const SOLO_UNLOCK_THRESHOLD = 12;

type ProfileLike = {
  solo_unlocked_factions?: string[];
};

export type RecomputeResult = {
  newlyUnlocked: string[];
  nextSoloUnlocked: string[];
};

/**
 * Recompute solo_unlocked_factions inside an active transaction.
 *
 * Reads card_library entries for every card currently in the player's
 * post-mutation inventory (one tx.getAll), determines which factions cross
 * SOLO_UNLOCK_THRESHOLD unique cards, and queues a tx.update on the player
 * profile if any new factions unlock.
 *
 * Sticky: only ADDS to solo_unlocked_factions, never removes.
 *
 * MUST be called inside a transaction, AFTER all other reads in that
 * transaction and BEFORE any tx writes are queued by the outer caller. The
 * helper itself does its own reads (via tx.getAll) then queues exactly one
 * write (only when newlyUnlocked.length > 0).
 */
export async function recomputeSoloUnlocks(
  tx: Transaction,
  uid: string,
  currentProfile: ProfileLike,
  inventoryAfterMutation: Map<string, number>,
): Promise<RecomputeResult> {
  const db = admin.firestore();
  const currentUnlocked = new Set(currentProfile.solo_unlocked_factions ?? []);

  // Short-circuit: if every faction is already unlocked, no read needed.
  if (ALL_FACTIONS.every((f) => currentUnlocked.has(f))) {
    return {
      newlyUnlocked: [],
      nextSoloUnlocked: Array.from(currentUnlocked),
    };
  }

  // Performance note: one card_library read per card currently owned.
  // For a player with 50 unique cards, that's ~50 doc reads per summon/craft.
  // Acceptable for v1 (economy functions are not high-throughput); cache
  // card_library at function cold-start in v1.1 if this becomes a bottleneck.
  const ownedCardIds = Array.from(inventoryAfterMutation.keys()).filter(
    (id) => (inventoryAfterMutation.get(id) ?? 0) >= 1,
  );
  if (ownedCardIds.length === 0) {
    return {
      newlyUnlocked: [],
      nextSoloUnlocked: Array.from(currentUnlocked),
    };
  }

  const libRefs = ownedCardIds.map((id) =>
    db.collection('card_library').doc(id),
  );
  const libSnaps = await tx.getAll(...libRefs);

  // Count unique cards per faction in post-mutation inventory.
  const factionCounts = new Map<string, number>();
  for (const snap of libSnaps) {
    if (!snap.exists) continue;
    const faction = snap.data()?.faction;
    if (typeof faction !== 'string') continue;
    factionCounts.set(faction, (factionCounts.get(faction) ?? 0) + 1);
  }

  const newlyUnlocked: string[] = [];
  for (const faction of ALL_FACTIONS) {
    if (currentUnlocked.has(faction)) continue;
    const count = factionCounts.get(faction) ?? 0;
    if (count >= SOLO_UNLOCK_THRESHOLD) {
      newlyUnlocked.push(faction);
    }
  }

  if (newlyUnlocked.length === 0) {
    return {
      newlyUnlocked: [],
      nextSoloUnlocked: Array.from(currentUnlocked),
    };
  }

  const nextSoloUnlocked = [...currentUnlocked, ...newlyUnlocked];
  const profileRef = db.collection('player_profiles').doc(uid);
  tx.update(profileRef, {
    solo_unlocked_factions: nextSoloUnlocked,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { newlyUnlocked, nextSoloUnlocked };
}
