// src/hooks/usePlayerSavedDecks.ts
// Phase 9.4.5: live subscription to player_saved_decks/{uid}/decks. Returns
// the player's full set of saved decks across every faction (max 18 docs).
// Guild Hall filters by active faction in render; Battle Mode reads the
// faction-filtered subset to decide which deck enters matchmaking.

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { SavedDeck } from '../types/savedDeck';

type Result = {
  decks: SavedDeck[];
  isLoading: boolean;
};

export function usePlayerSavedDecks(): Result {
  const { user } = useAuth();
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setDecks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const ref = collection(db, 'player_saved_decks', user.uid, 'decks');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setDecks(snap.docs.map((d) => d.data() as SavedDeck));
        setIsLoading(false);
      },
      (err) => {
        console.warn('usePlayerSavedDecks: subscription failed', err.message);
        setIsLoading(false);
      },
    );
    return unsub;
  }, [user]);

  return { decks, isLoading };
}
