// src/hooks/useWalletAndCanSummon.ts
// Wraps usePlayerWallet and exposes per-banner affordability flags plus a
// craft-affordability predicate. Read-only; no mutations.

import { usePlayerWallet } from './usePlayerWallet';
import {
  BANNERS,
  CRAFT_DUST_COSTS,
  type BannerId,
  type Rarity,
} from '../lib/banners';

export type BannerAffordability = Record<BannerId, boolean>;

type UseWalletAndCanSummonResult = {
  wallet: ReturnType<typeof usePlayerWallet>['wallet'];
  isLoading: boolean;
  canSummon: BannerAffordability;
  canCraftRarity: (rarity: Rarity) => boolean;
};

export function useWalletAndCanSummon(): UseWalletAndCanSummonResult {
  const { wallet, isLoading } = usePlayerWallet();

  const canSummon: BannerAffordability = {
    common: false,
    rare: false,
    premium: false,
  };

  if (wallet) {
    for (const banner of BANNERS) {
      const balance = wallet[banner.currency] ?? 0;
      canSummon[banner.id] = balance >= banner.cost;
    }
  }

  function canCraftRarity(rarity: Rarity): boolean {
    if (!wallet) return false;
    return (wallet.dust ?? 0) >= CRAFT_DUST_COSTS[rarity];
  }

  return { wallet, isLoading, canSummon, canCraftRarity };
}
