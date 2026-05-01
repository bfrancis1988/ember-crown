// src/hooks/usePlayerInventory.ts
// Live subscription to the player_inventories/{uid}/cards subcollection.
// Returns an empty array (not null) when the player has no cards yet — this
// keeps render code on the consumer side simpler.

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { InventoryCard } from '../types/inventory';

type UsePlayerInventoryResult = {
  inventory: InventoryCard[];
  isLoading: boolean;
};

export function usePlayerInventory(): UsePlayerInventoryResult {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setInventory([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const cardsRef = collection(db, 'player_inventories', user.uid, 'cards');

    const unsubscribe = onSnapshot(
      cardsRef,
      (snapshot) => {
        setInventory(snapshot.docs.map((d) => d.data() as InventoryCard));
        setIsLoading(false);
      },
      (err) => {
        console.warn('usePlayerInventory: subscription failed', err.message);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  return { inventory, isLoading };
}
