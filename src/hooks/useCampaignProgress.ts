// src/hooks/useCampaignProgress.ts
// Subscription to player_campaign_progress/{auth.currentUser.uid}.
// Forward-compat for Phase 7 (campaign UI). Not consumed in Phase 5.5 — the
// data layer ships first so Phase 7 can build screens against a stable hook.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { PlayerCampaignProgress } from '../types/campaign';

type UseCampaignProgressResult = {
  progress: PlayerCampaignProgress | null;
  isLoading: boolean;
};

export function useCampaignProgress(): UseCampaignProgressResult {
  const { user } = useAuth();
  const [progress, setProgress] = useState<PlayerCampaignProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProgress(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsub = onSnapshot(
      doc(db, 'player_campaign_progress', user.uid),
      (snap) => {
        // Doc may not exist yet — Phase 7's first-win Cloud Function creates it.
        // Null is the legitimate "no progress" state and screens should handle it.
        setProgress(snap.exists() ? (snap.data() as PlayerCampaignProgress) : null);
        setIsLoading(false);
      },
      (err) => {
        console.warn('useCampaignProgress: subscription failed', err.message);
        setIsLoading(false);
      }
    );
    return unsub;
  }, [user]);

  return { progress, isLoading };
}

// Stage N+1 unlocks when stage N has been completed. Stage 1 is unlocked as soon
// as the faction itself is unlocked. Caller passes the player's unlocked_factions
// from PlayerProfile so this stays a pure function with no extra Firestore reads.
export function isStageUnlocked(
  progress: PlayerCampaignProgress | null,
  stage: { faction: string; stage_number: number },
  unlockedFactions: string[]
): boolean {
  if (!unlockedFactions.includes(stage.faction)) return false;
  if (stage.stage_number === 1) return true;
  const factionProgress = progress?.progress?.[stage.faction] ?? 0;
  return factionProgress >= stage.stage_number - 1;
}
