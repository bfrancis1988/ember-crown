// src/hooks/useFactionInventory.ts
// Composite hook that joins inventory + card_library + active deck for the
// player's active faction. Used by the Guild Hall (Phase 4) deck builder.
//
// Lazy migration: any deck slot missing the `faction` field (legacy Phase 3
// slot) is written back with faction='Vanguard Kingdoms'. Fire-and-forget so
// the hook does not block the UI on those writes.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { FACTIONS, type FactionId } from '../lib/factions';
import type { CardLibraryEntry, Rarity } from '../types/card';
import type { DeckSlot } from '../types/deck';
import type { InventoryCard } from '../types/inventory';

export type InventoryCardView = {
  card: CardLibraryEntry;
  quantity_owned: number;
  quantity_in_deck: number;
  factionColor: string;
};

type Result = {
  cards: InventoryCardView[];
  isLoading: boolean;
  deckSize: number;
};

const RARITY_RANK: Record<Rarity, number> = {
  Legendary: 5,
  Epic: 4,
  Rare: 3,
  Uncommon: 2,
  Common: 1,
};

// Module-level cache so card_library docs are fetched at most once per session.
const cardLibraryCache = new Map<string, CardLibraryEntry>();

function factionColorFor(factionId: string): string {
  return FACTIONS.find((f) => f.id === factionId)?.color ?? '#888888';
}

export function useFactionInventory(factionId: FactionId | null): Result {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryCard[]>([]);
  const [slots, setSlots] = useState<DeckSlot[]>([]);
  const [cardMap, setCardMap] = useState<Map<string, CardLibraryEntry>>(
    () => new Map()
  );
  const [invLoading, setInvLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(true);

  // Track slot ids we've already attempted to migrate so a snapshot replay does
  // not re-fire the write.
  const migratedSlotsRef = useRef<Set<string>>(new Set());

  // Inventory subscription
  useEffect(() => {
    if (!user) {
      setInventory([]);
      setInvLoading(false);
      return;
    }
    setInvLoading(true);
    const ref = collection(db, 'player_inventories', user.uid, 'cards');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setInventory(snap.docs.map((d) => d.data() as InventoryCard));
        setInvLoading(false);
      },
      (err) => {
        console.warn('useFactionInventory: inventory subscription failed', err.message);
        setInvLoading(false);
      }
    );
    return unsub;
  }, [user]);

  // Slots subscription + lazy migration
  useEffect(() => {
    if (!user) {
      setSlots([]);
      setSlotsLoading(false);
      return;
    }
    setSlotsLoading(true);
    const ref = collection(db, 'player_active_decks', user.uid, 'slots');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const rows: DeckSlot[] = snap.docs.map((d) => {
          const data = d.data() as Partial<DeckSlot>;
          // Backward compat: legacy slots may be missing `faction`. Treat
          // them as Vanguard Kingdoms and queue a fire-and-forget migration.
          if (!data.faction) {
            const slotId = d.id;
            if (!migratedSlotsRef.current.has(slotId) && user) {
              migratedSlotsRef.current.add(slotId);
              const slotRef = doc(db, 'player_active_decks', user.uid, 'slots', slotId);
              updateDoc(slotRef, { faction: 'Vanguard Kingdoms' }).catch((err) => {
                console.warn('useFactionInventory: lazy migration failed', slotId, err);
                migratedSlotsRef.current.delete(slotId);
              });
            }
            return {
              slot_id: slotId,
              card_id: data.card_id as string,
              faction: 'Vanguard Kingdoms',
              added_at: data.added_at!,
            };
          }
          return data as DeckSlot;
        });
        setSlots(rows);
        setSlotsLoading(false);
      },
      (err) => {
        console.warn('useFactionInventory: slots subscription failed', err.message);
        setSlotsLoading(false);
      }
    );
    return unsub;
  }, [user]);

  // Card library fetch — only for card_ids that appear in inventory.
  useEffect(() => {
    if (inventory.length === 0) {
      setLibraryLoading(false);
      return;
    }
    let cancelled = false;
    setLibraryLoading(true);
    const missing = inventory
      .map((c) => c.card_id)
      .filter((id) => !cardLibraryCache.has(id));

    if (missing.length === 0) {
      // Build map from cache snapshot for the cards we own.
      const map = new Map<string, CardLibraryEntry>();
      for (const c of inventory) {
        const entry = cardLibraryCache.get(c.card_id);
        if (entry) map.set(c.card_id, entry);
      }
      setCardMap(map);
      setLibraryLoading(false);
      return;
    }

    (async () => {
      try {
        await Promise.all(
          missing.map(async (id) => {
            const snap = await getDoc(doc(db, 'card_library', id));
            if (snap.exists()) {
              cardLibraryCache.set(id, snap.data() as CardLibraryEntry);
            }
          })
        );
        if (cancelled) return;
        const map = new Map<string, CardLibraryEntry>();
        for (const c of inventory) {
          const entry = cardLibraryCache.get(c.card_id);
          if (entry) map.set(c.card_id, entry);
        }
        setCardMap(map);
      } catch (err) {
        console.warn('useFactionInventory: card_library fetch failed', err);
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inventory]);

  const result = useMemo<Result>(() => {
    if (!factionId) {
      return { cards: [], isLoading: true, deckSize: 0 };
    }

    // Slots filtered to the active faction (post-migration mapping above
    // means missing faction was already coerced to Vanguard Kingdoms).
    const factionSlots = slots.filter((s) => s.faction === factionId);
    const deckSize = factionSlots.length;

    const inDeckCount = new Map<string, number>();
    for (const s of factionSlots) {
      inDeckCount.set(s.card_id, (inDeckCount.get(s.card_id) ?? 0) + 1);
    }

    const cards: InventoryCardView[] = [];
    for (const inv of inventory) {
      const card = cardMap.get(inv.card_id);
      if (!card) continue;
      if (card.faction !== factionId) continue;
      cards.push({
        card,
        quantity_owned: inv.quantity_owned,
        quantity_in_deck: inDeckCount.get(inv.card_id) ?? 0,
        factionColor: factionColorFor(card.faction),
      });
    }

    cards.sort((a, b) => {
      const r = RARITY_RANK[b.card.rarity] - RARITY_RANK[a.card.rarity];
      if (r !== 0) return r;
      return b.card.base_power - a.card.base_power;
    });

    return { cards, isLoading: false, deckSize };
  }, [factionId, slots, inventory, cardMap]);

  const isLoading = invLoading || slotsLoading || libraryLoading;
  return { ...result, isLoading: result.isLoading || isLoading };
}
