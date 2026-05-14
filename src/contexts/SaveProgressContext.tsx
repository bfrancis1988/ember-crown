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
//   - day_three: account age ≥ 3 days, day-3 flag unset
//   - tutorial_complete: profile.tutorial_completed flipped to true, flag
//     unset — fires after both completion paths (skip from tutorial.tsx and
//     win from MatchCompleteOverlay) without needing to modify either site,
//     because completeTutorial() flips the profile flag and the snapshot
//     update flows here
//
// Explicit triggers (callers invoke showSaveModal directly):
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

  // Reactive triggers. Day-3 takes precedence — if both happen to be
  // eligible at once (a brand-new player who blew through the tutorial on
  // day 3+, vanishingly rare), the day-3 modal fires first; the
  // tutorial-complete modal will fire on the next render after the day-3
  // flag is persisted. showSaveModal itself is idempotent against the
  // per-trigger flags, so duplicate calls are safe.
  useEffect(() => {
    if (!isAnonymous || !profile) return;

    // Day-3: account age ≥ 3 days, flag unset, created_at server-resolved.
    if (profile.shown_save_modal_day_three !== true) {
      const createdAtMs = profile.created_at?.toMillis?.();
      if (typeof createdAtMs === 'number') {
        const ageDays = (Date.now() - createdAtMs) / DAY_MS;
        if (ageDays >= DAY_THREE_THRESHOLD_DAYS) {
          showSaveModal('day_three');
          return;
        }
      }
    }

    // Tutorial complete: flips to true after the user finishes the tutorial
    // match (via MatchCompleteOverlay → completeTutorial) or skips it (via
    // tutorial.tsx → completeTutorial). Either path lands here on the
    // resulting profile snapshot, so we don't need to modify the call sites.
    if (
      profile.tutorial_completed === true &&
      profile.shown_save_modal_tutorial !== true
    ) {
      showSaveModal('tutorial_complete');
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
