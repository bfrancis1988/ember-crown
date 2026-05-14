// src/contexts/SaveProgressContext.tsx
// Top-level state for the anonymous-to-permanent-account upgrade modal.
//
// Exposes `showSaveModal(trigger)` to descendants. Internally:
//   - Gates display on user.isAnonymous (signed-out and real-account users
//     never see the modal)
//   - Gates display on the per-trigger "shown" flag in PlayerProfile so the
//     modal fires at most once per trigger (per UID)
//   - On dismissal, persists the shown flag back to the profile
//
// Reactive triggers live in this provider's effect:
//   - day_three: account age ≥ 3 days, day-3 flag unset (fires on cold launch
//     when the profile snapshot first lands, or on subsequent profile updates
//     that push the user across the 3-day threshold)
//
// Explicit triggers (callers invoke showSaveModal directly):
//   - tutorial_complete: home screen / post-tutorial flow
//   - first_win: MatchCompleteOverlay after a winning solo claim
//   - manual: home-screen "Save Progress" button

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import {
  SaveProgressModal,
  SaveProgressTrigger,
} from '../components/auth/SaveProgressModal';

type SaveProgressContextValue = {
  showSaveModal: (trigger: SaveProgressTrigger) => void;
};

const SaveProgressContext = createContext<SaveProgressContextValue | undefined>(
  undefined,
);

const DAY_MS = 1000 * 60 * 60 * 24;
const DAY_THREE_THRESHOLD_DAYS = 3;

export function SaveProgressProvider({ children }: { children: ReactNode }) {
  const { isAnonymous } = useAuth();
  const { profile, updateProfile } = usePlayerProfile();

  const [visible, setVisible] = useState(false);
  const [trigger, setTrigger] = useState<SaveProgressTrigger>('manual');

  const showSaveModal = useCallback(
    (requestedTrigger: SaveProgressTrigger) => {
      if (!isAnonymous) return;

      // Per-trigger show-once gate. The 'manual' trigger always shows
      // (the home-screen Save Progress button is the canonical caller).
      if (requestedTrigger === 'tutorial_complete' && profile?.shown_save_modal_tutorial) return;
      if (requestedTrigger === 'first_win' && profile?.shown_save_modal_first_win) return;
      if (requestedTrigger === 'day_three' && profile?.shown_save_modal_day_three) return;

      setTrigger(requestedTrigger);
      setVisible(true);
    },
    [
      isAnonymous,
      profile?.shown_save_modal_tutorial,
      profile?.shown_save_modal_first_win,
      profile?.shown_save_modal_day_three,
    ],
  );

  // Day-3 reactive trigger. Fires once per profile when:
  //   - user is anonymous
  //   - day-3 flag isn't yet set
  //   - profile.created_at has resolved on the server (it can be null
  //     briefly between setDoc and the first server-resolved snapshot)
  //   - account age in days ≥ 3
  useEffect(() => {
    if (!isAnonymous || !profile) return;
    if (profile.shown_save_modal_day_three === true) return;

    const createdAtMs = profile.created_at?.toMillis?.();
    if (typeof createdAtMs !== 'number') return;

    const ageDays = (Date.now() - createdAtMs) / DAY_MS;
    if (ageDays >= DAY_THREE_THRESHOLD_DAYS) {
      showSaveModal('day_three');
    }
  }, [isAnonymous, profile, showSaveModal]);

  const persistShownFlag = useCallback(
    async (which: SaveProgressTrigger) => {
      if (which === 'manual') return;
      try {
        switch (which) {
          case 'tutorial_complete':
            await updateProfile({ shown_save_modal_tutorial: true });
            break;
          case 'first_win':
            await updateProfile({ shown_save_modal_first_win: true });
            break;
          case 'day_three':
            await updateProfile({ shown_save_modal_day_three: true });
            break;
        }
      } catch (err) {
        // Non-fatal — modal closes either way. If we couldn't persist (no
        // user, network blip), the modal may re-trigger on the next
        // reactive event. Annoying, not data-corrupting.
        console.warn('SaveProgressProvider: failed to persist shown flag', err);
      }
    },
    [updateProfile],
  );

  const handleClose = useCallback(() => {
    setVisible(false);
    void persistShownFlag(trigger);
  }, [trigger, persistShownFlag]);

  return (
    <SaveProgressContext.Provider value={{ showSaveModal }}>
      {children}
      <SaveProgressModal
        visible={visible}
        onClose={handleClose}
        trigger={trigger}
      />
    </SaveProgressContext.Provider>
  );
}

export function useSaveProgressModal(): SaveProgressContextValue {
  const context = useContext(SaveProgressContext);
  if (context === undefined) {
    throw new Error('useSaveProgressModal must be used within a SaveProgressProvider');
  }
  return context;
}
