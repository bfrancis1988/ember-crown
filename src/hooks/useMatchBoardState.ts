// src/hooks/useMatchBoardState.ts
// Live subscription to all live_board_state docs for one match. Each doc is
// one card instance — its current_power, location_state, and status_effect
// update as the D4 trigger and player actions fire.

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { LiveBoardState } from '../types/board';

type UseMatchBoardStateResult = {
  cards: LiveBoardState[];
  isLoading: boolean;
};

export function useMatchBoardState(matchId: string | null): UseMatchBoardStateResult {
  const [cards, setCards] = useState<LiveBoardState[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!matchId) {
      setCards([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(
      collection(db, 'live_board_state'),
      where('match_id', '==', matchId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => d.data() as LiveBoardState);
      setCards(all);
      setIsLoading(false);
    });
    return unsub;
  }, [matchId]);

  return { cards, isLoading };
}
