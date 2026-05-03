// src/hooks/useCampaignStages.ts
// One-shot fetch of all campaign_stages docs, cached at module level so every
// screen that consumes it pays at most one network round-trip per session.
// Stages are seeded once and immutable, so no realtime subscription is needed.

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CampaignStage } from '../types/campaign';

let cachedStages: CampaignStage[] | null = null;
let cachePromise: Promise<CampaignStage[]> | null = null;

async function fetchStages(): Promise<CampaignStage[]> {
  if (cachedStages) return cachedStages;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    const snap = await getDocs(collection(db, 'campaign_stages'));
    const stages = snap.docs.map((d) => d.data() as CampaignStage);
    cachedStages = stages;
    cachePromise = null;
    return stages;
  })();

  return cachePromise;
}

export function useCampaignStages(): {
  stages: CampaignStage[];
  isLoading: boolean;
} {
  const [stages, setStages] = useState<CampaignStage[]>(cachedStages ?? []);
  const [isLoading, setIsLoading] = useState(!cachedStages);

  useEffect(() => {
    if (cachedStages) return;
    let active = true;
    fetchStages()
      .then((s) => {
        if (active) {
          setStages(s);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('useCampaignStages: fetch failed', err);
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { stages, isLoading };
}

export function getStagesByFaction(
  stages: CampaignStage[],
  factionId: string,
): CampaignStage[] {
  return stages
    .filter((s) => s.faction === factionId)
    .sort((a, b) => a.stage_number - b.stage_number);
}
