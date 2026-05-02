// src/hooks/usePlayerProfile.ts
// Centralized subscription to player_profiles/{auth.currentUser.uid}.
// Replaces the per-screen onSnapshot logic in home.tsx and profile.tsx.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { PlayerProfile } from '../types/player';

type UsePlayerProfileResult = {
  profile: PlayerProfile | null;
  isLoading: boolean;
  updateProfile: (patch: Partial<PlayerProfile>) => Promise<void>;
};

export function usePlayerProfile(): UsePlayerProfileResult {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Guards re-entrant doc creation on the first snapshot when the doc is missing.
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const profileRef = doc(db, 'player_profiles', user.uid);

    const unsubscribe = onSnapshot(
      profileRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          if (creatingRef.current) return;
          creatingRef.current = true;
          try {
            await setDoc(profileRef, {
              player_id: user.uid,
              username: 'Guest_Commander',
              onboarding_step: 0,
              active_faction: null,
              selected_commander: null,
              unlocked_factions: ['Vanguard Kingdoms'],
              tutorial_reward_claimed: false,
              tutorial_completed: false,
              created_at: serverTimestamp(),
              updated_at: serverTimestamp(),
            });
            // The setDoc fires another snapshot event; that one populates state.
          } catch (err) {
            console.warn('usePlayerProfile: profile init failed', err);
            setIsLoading(false);
          }
          return;
        }

        creatingRef.current = false;
        const data = snapshot.data() as PlayerProfile;
        // Lazy-migration: profiles created before tutorial_completed existed
        // surface as `false` until a write populates the field.
        if (data.tutorial_completed === undefined) {
          data.tutorial_completed = false;
        }
        setProfile(data);
        setIsLoading(false);
      },
      (err) => {
        console.warn('usePlayerProfile: subscription failed', err.message);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const updateProfile = useCallback(
    async (patch: Partial<PlayerProfile>) => {
      if (!user) throw new Error('updateProfile called without an authenticated user');
      await updateDoc(doc(db, 'player_profiles', user.uid), {
        ...patch,
        updated_at: serverTimestamp(),
      });
    },
    [user]
  );

  return { profile, isLoading, updateProfile };
}
