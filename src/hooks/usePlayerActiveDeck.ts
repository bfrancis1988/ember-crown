// src/hooks/usePlayerActiveDeck.ts
// Live subscription to the player_active_decks/{uid}/slots subcollection.
// Each slot is one card instance — duplicates of the same card_id appear as
// separate slot docs with distinct slot_ids.

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { DeckSlot } from '../types/deck';

type UsePlayerActiveDeckResult = {
  deck: DeckSlot[];
  isLoading: boolean;
};

export function usePlayerActiveDeck(): UsePlayerActiveDeckResult {
  const { user } = useAuth();
  const [deck, setDeck] = useState<DeckSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setDeck([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const slotsRef = collection(db, 'player_active_decks', user.uid, 'slots');

    const unsubscribe = onSnapshot(
      slotsRef,
      (snapshot) => {
        setDeck(snapshot.docs.map((d) => d.data() as DeckSlot));
        setIsLoading(false);
      },
      (err) => {
        console.warn('usePlayerActiveDeck: subscription failed', err.message);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  return { deck, isLoading };
}
