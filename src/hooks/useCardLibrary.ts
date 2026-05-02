// src/hooks/useCardLibrary.ts
// Phase 4.5: one-shot fetch + module-level cache of the static card_library
// collection (88 docs). Subscriptions are intentionally avoided — the library
// doesn't change during a session. Inventory ownership is layered on at the
// consumer via usePlayerInventory.

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CardLibraryEntry } from '../types/card';

let cachedCards: CardLibraryEntry[] | null = null;
let cachePromise: Promise<CardLibraryEntry[]> | null = null;

async function fetchCardLibrary(): Promise<CardLibraryEntry[]> {
  if (cachedCards) return cachedCards;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    const snap = await getDocs(collection(db, 'card_library'));
    const cards = snap.docs.map((d) => d.data() as CardLibraryEntry);
    cachedCards = cards;
    cachePromise = null;
    return cards;
  })();

  return cachePromise;
}

type UseCardLibraryResult = {
  cards: CardLibraryEntry[];
  isLoading: boolean;
  error: string | null;
};

export function useCardLibrary(): UseCardLibraryResult {
  const [cards, setCards] = useState<CardLibraryEntry[]>(cachedCards ?? []);
  const [isLoading, setIsLoading] = useState(!cachedCards);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedCards) return;
    let active = true;
    fetchCardLibrary()
      .then((c) => {
        if (active) {
          setCards(c);
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { cards, isLoading, error };
}
