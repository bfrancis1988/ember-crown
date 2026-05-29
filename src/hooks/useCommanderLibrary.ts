// src/hooks/useCommanderLibrary.ts
// One-shot fetch + module-level cache of the static commander_library
// collection (18 docs). Mirrors useCardLibrary — commanders don't change
// during a session, so subscriptions are intentionally avoided.

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CommanderEntry } from '../types/commander';

let cachedCommanders: CommanderEntry[] | null = null;
let cachePromise: Promise<CommanderEntry[]> | null = null;

async function fetchCommanderLibrary(): Promise<CommanderEntry[]> {
  if (cachedCommanders) return cachedCommanders;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    const snap = await getDocs(collection(db, 'commander_library'));
    const commanders = snap.docs.map((d) => d.data() as CommanderEntry);
    cachedCommanders = commanders;
    cachePromise = null;
    return commanders;
  })();

  return cachePromise;
}

type UseCommanderLibraryResult = {
  commanders: CommanderEntry[];
  isLoading: boolean;
  error: string | null;
};

export function useCommanderLibrary(): UseCommanderLibraryResult {
  const [commanders, setCommanders] = useState<CommanderEntry[]>(cachedCommanders ?? []);
  const [isLoading, setIsLoading] = useState(!cachedCommanders);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedCommanders) return;
    let active = true;
    fetchCommanderLibrary()
      .then((c) => {
        if (active) {
          setCommanders(c);
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

  return { commanders, isLoading, error };
}
