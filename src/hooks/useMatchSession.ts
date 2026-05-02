// src/hooks/useMatchSession.ts
// Live subscription to match_sessions/{matchId}. Returns the session doc as it
// updates (turn changes, VP shifts, status flips to 'game_over', etc.).

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { MatchSession } from '../types/match';

type UseMatchSessionResult = {
  session: MatchSession | null;
  isLoading: boolean;
  error: string | null;
};

export function useMatchSession(matchId: string | null): UseMatchSessionResult {
  const [session, setSession] = useState<MatchSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) {
      setSession(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    const unsub = onSnapshot(
      doc(db, 'match_sessions', matchId),
      (snap) => {
        if (snap.exists()) {
          setSession(snap.data() as MatchSession);
          setError(null);
        } else {
          setSession(null);
          setError('Match not found.');
        }
        setIsLoading(false);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      },
    );
    return unsub;
  }, [matchId]);

  return { session, isLoading, error };
}
