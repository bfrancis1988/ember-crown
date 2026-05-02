// src/hooks/usePlayerWallet.ts
// Live subscription to player_wallets/{auth.currentUser.uid}.
// Returns wallet === null until the doc exists (i.e. until completeOnboarding
// has run). Phase 6 will move all wallet mutations to Cloud Functions; this
// hook stays read-only either way.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { PlayerWallet } from '../types/wallet';

type UsePlayerWalletResult = {
  wallet: PlayerWallet | null;
  isLoading: boolean;
};

export function usePlayerWallet(): UsePlayerWalletResult {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<PlayerWallet | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWallet(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const walletRef = doc(db, 'player_wallets', user.uid);

    const unsubscribe = onSnapshot(
      walletRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setWallet(null);
          setIsLoading(false);
          return;
        }
        const raw = snapshot.data() as PlayerWallet;
        // Defensive backfill: existing wallets predate the dust field. The
        // doc itself isn't rewritten until the next mutation (summon/craft).
        setWallet({ ...raw, dust: raw.dust ?? 0 });
        setIsLoading(false);
      },
      (err) => {
        console.warn('usePlayerWallet: subscription failed', err.message);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  return { wallet, isLoading };
}
