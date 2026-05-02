// src/hooks/useCanStartMatch.ts
// Pre-match validation. Combines usePlayerProfile + usePlayerActiveDeck
// and returns a structured ready-state for the home-screen Play button.

import { usePlayerProfile } from './usePlayerProfile';
import { usePlayerActiveDeck } from './usePlayerActiveDeck';
import type { PlayerProfile } from '../types/player';

export type MatchReadiness =
  | { ready: true }
  | { ready: false; reason: 'loading' }
  | { ready: false; reason: 'incomplete_onboarding' }
  | { ready: false; reason: 'no_faction' }
  | { ready: false; reason: 'no_commander' }
  | { ready: false; reason: 'wrong_deck_size'; current: number };

export type UseCanStartMatchResult = {
  readiness: MatchReadiness;
  profile: PlayerProfile | null;
  deckSize: number;
};

export function useCanStartMatch(): UseCanStartMatchResult {
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { deck, isLoading: deckLoading } = usePlayerActiveDeck();

  let readiness: MatchReadiness;
  if (profileLoading || deckLoading) {
    readiness = { ready: false, reason: 'loading' };
  } else if (!profile || profile.onboarding_step < 4) {
    readiness = { ready: false, reason: 'incomplete_onboarding' };
  } else if (!profile.active_faction) {
    readiness = { ready: false, reason: 'no_faction' };
  } else if (!profile.selected_commander) {
    readiness = { ready: false, reason: 'no_commander' };
  } else if (deck.length !== 15) {
    readiness = { ready: false, reason: 'wrong_deck_size', current: deck.length };
  } else {
    readiness = { ready: true };
  }

  return { readiness, profile, deckSize: deck.length };
}
