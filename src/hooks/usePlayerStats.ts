// Live subscription to player_stats/{uid}. Returns stats === null until
// the doc exists (created on the player's first claim post-1.1.0).
// Players with no matches since the upgrade will see null → 0s in the UI.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { PlayerStats } from '../types/playerStats';

type Result = {
  stats: PlayerStats | null;
  isLoading: boolean;
};

export function usePlayerStats(): Result {
  const { user } = useAuth();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStats(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const statsRef = doc(db, 'player_stats', user.uid);

    const unsub = onSnapshot(
      statsRef,
      (snap) => {
        if (!snap.exists()) {
          setStats(null);
          setIsLoading(false);
          return;
        }
        setStats(snap.data() as PlayerStats);
        setIsLoading(false);
      },
      (err) => {
        console.warn('usePlayerStats: subscription failed', err.message);
        setIsLoading(false);
      },
    );

    return unsub;
  }, [user]);

  return { stats, isLoading };
}
