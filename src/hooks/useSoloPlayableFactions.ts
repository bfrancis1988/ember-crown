// src/hooks/useSoloPlayableFactions.ts
// Phase 9.4.4 — returns the set of factions playable in Solo Match for the
// current player. The union of campaign-unlocked (unlocked_factions) and
// threshold-unlocked (solo_unlocked_factions, set server-side once the
// player owns 12 unique cards in a faction).
//
// Campaign mode does NOT use this hook — campaign UI reads unlocked_factions
// directly so threshold unlocks don't grant campaign access.

import { useMemo } from 'react';
import { usePlayerProfile } from './usePlayerProfile';
import type { FactionId } from '../lib/factions';

export function useSoloPlayableFactions(): FactionId[] {
  const { profile } = usePlayerProfile();

  return useMemo(() => {
    return computeSoloPlayable(
      profile?.unlocked_factions,
      profile?.solo_unlocked_factions,
    );
  }, [profile?.unlocked_factions, profile?.solo_unlocked_factions]);
}

// Pure helper for non-React callers (e.g. utility code, tests). The hook
// above narrows on the two array fields rather than the whole profile so a
// snapshot that rewrites unrelated fields doesn't force a recompute.
export function computeSoloPlayable(
  unlockedFactions: string[] | undefined,
  soloUnlockedFactions: string[] | undefined,
): FactionId[] {
  const merged = new Set<string>([
    ...(unlockedFactions ?? []),
    ...(soloUnlockedFactions ?? []),
  ]);
  return Array.from(merged) as FactionId[];
}
