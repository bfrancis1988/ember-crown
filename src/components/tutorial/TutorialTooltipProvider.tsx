// React Context that gates tutorial tooltip showings.
// Lives outside the match board so any nested screen can call showTooltip().
// Each trigger is shown at most once per provider lifetime; remount = reset.

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type TooltipTrigger =
  | 'match_start'
  | 'optimal_lane_select'
  | 'first_card_played'
  | 'first_optimal_lane_bonus'
  | 'first_round_ended'
  | 'commander_activate_hint'
  | 'enemy_passed'
  | 'curse_hint'
  | 'cleanse_hint'
  | 'tutorial_complete';

type TutorialTooltipContextType = {
  showTooltip: (trigger: TooltipTrigger) => void;
  dismissTooltip: () => void;
  activeTrigger: TooltipTrigger | null;
  shownTriggers: Set<TooltipTrigger>;
};

const TutorialTooltipContext = createContext<TutorialTooltipContextType | null>(null);

export function TutorialTooltipProvider({ children }: { children: ReactNode }) {
  const [activeTrigger, setActiveTrigger] = useState<TooltipTrigger | null>(null);
  // Mutated in-place; identity stable across renders. We don't need a re-render
  // from adds — only the activeTrigger setter triggers UI updates.
  const [shownTriggers] = useState<Set<TooltipTrigger>>(() => new Set());

  const showTooltip = useCallback(
    (trigger: TooltipTrigger) => {
      if (shownTriggers.has(trigger)) return;
      shownTriggers.add(trigger);
      setActiveTrigger(trigger);
    },
    [shownTriggers],
  );

  const dismissTooltip = useCallback(() => {
    setActiveTrigger(null);
  }, []);

  return (
    <TutorialTooltipContext.Provider
      value={{ showTooltip, dismissTooltip, activeTrigger, shownTriggers }}
    >
      {children}
    </TutorialTooltipContext.Provider>
  );
}

export function useTutorialTooltips() {
  const ctx = useContext(TutorialTooltipContext);
  if (!ctx) {
    throw new Error('useTutorialTooltips must be inside TutorialTooltipProvider');
  }
  return ctx;
}
