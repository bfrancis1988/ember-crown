// Live subscription to quest_progress/{uid} + lazy refresh on mount.
//
// On mount, fires the `assignQuests` callable once to ensure the
// quest_progress doc exists and the daily/weekly cycles are fresh.
// After that, the snapshot listener picks up server-side updates
// (claim writes, settle-at-claim writes from match completion).

import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../contexts/AuthContext';
import { db, functions } from '../lib/firebase';
import type { QuestProgress } from '../types/quests';

type AssignQuestsResult = { success: true; progress: QuestProgress };

type UseQuestProgressResult = {
  progress: QuestProgress | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useQuestProgress(): UseQuestProgressResult {
  const { user } = useAuth();
  const [progress, setProgress] = useState<QuestProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const didInitialAssignRef = useRef(false);

  const callAssign = useCallback(async () => {
    setError(null);
    try {
      const fn = httpsCallable<Record<string, never>, AssignQuestsResult>(
        functions,
        'assignQuests',
      );
      await fn({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    }
  }, []);

  const refresh = useCallback(async () => {
    await callAssign();
  }, [callAssign]);

  useEffect(() => {
    if (!user) {
      setProgress(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const progressRef = doc(db, 'quest_progress', user.uid);

    // Fire-and-forget the assignQuests refresh on first mount for this
    // user. The snapshot below will reflect the post-refresh state.
    if (!didInitialAssignRef.current) {
      didInitialAssignRef.current = true;
      callAssign().catch(() => { /* error already captured */ });
    }

    const unsub = onSnapshot(
      progressRef,
      (snap) => {
        if (!snap.exists()) {
          setProgress(null);
          setIsLoading(false);
          return;
        }
        setProgress(snap.data() as QuestProgress);
        setIsLoading(false);
      },
      (err) => {
        console.warn('useQuestProgress: subscription failed', err.message);
        setError(err.message);
        setIsLoading(false);
      },
    );

    return unsub;
  }, [user, callAssign]);

  return { progress, isLoading, error, refresh };
}
