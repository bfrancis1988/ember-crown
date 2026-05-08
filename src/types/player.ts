// src/types/player.ts
// Shared player profile type. Mirrors the player_profiles/{uid} Firestore doc.

import { Timestamp } from 'firebase/firestore';

export type PlayerProfile = {
  player_id: string;
  username: string;
  onboarding_step: 0 | 1 | 2 | 3 | 4;
  active_faction: string | null;
  selected_commander: string | null;
  unlocked_factions: string[];
  // Phase 9.4.4: factions unlocked via the 12-unique-card collection threshold.
  // Sticky — never shrinks. Server-only writes (see firestore.rules).
  // Disjoint conceptually from unlocked_factions (campaign unlocks), but UI
  // that gates Solo play should read the union of both.
  solo_unlocked_factions?: string[];
  tutorial_reward_claimed: boolean;
  tutorial_completed: boolean;
  // Phase 9.4.5: saved decks. The deck the player has currently selected
  // for matches (Solo/Campaign/Battle Mode). Defaults to slot 1 of the
  // active faction. Set by SavedDecksList "Use This Deck" action.
  active_saved_deck_id?: string;
  // Phase 9.4.5: privacy opt-in for Battle Mode. Defaults true. UI to
  // toggle ships in Phase 9.5. When false, this player's saved decks are
  // excluded from other players' Battle Mode opponent pool.
  battle_mode_decks_shareable?: boolean;
  // Phase 9.4.5-extras: marks pre-built matchmaking decks (no Firebase Auth
  // user, never logs in). Real players never have this set. findBattleOpponent
  // includes these in the opponent pool to keep matchmaking varied at launch.
  is_synthetic_opponent?: boolean;
  // Phase 9.5B: which fire-once analytics events have already fired for this
  // player. Idempotent guard so reinstalls don't re-fire "first match" etc.
  fired_analytics_events?: string[];
  created_at: Timestamp;
  updated_at: Timestamp;
};
