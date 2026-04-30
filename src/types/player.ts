// src/types/player.ts
// Shared player profile type. Mirrors the player_profiles/{uid} Firestore doc.

import { Timestamp } from 'firebase/firestore';

export type PlayerProfile = {
  player_id: string;
  username: string;
  onboarding_step: 0 | 1 | 2 | 3 | 4;
  active_faction: string | null;
  selected_commander: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};
