// SHARED TYPE — keep src/types/campaign.ts and functions/src/types/campaign.ts identical
// (only the Timestamp import path differs: 'firebase/firestore' vs 'firebase-admin/firestore').
//
// Shape of campaign_stages/{stage_id} and player_campaign_progress/{uid} Firestore docs.
// Seeded by scripts/seed-firestore.ts (campaign_stages); written by Cloud Functions in
// Phase 7 (player_campaign_progress).

import { Timestamp } from 'firebase/firestore';

export type CampaignDifficulty = 'easy' | 'standard' | 'boss';

// Optional per-boss modifiers. Only stage_number === 9 carries this.
// Future rules can be appended without breaking existing seed data.
export type BossSpecialRule = {
  commander_pre_activated?: boolean;
  debuff_strength_override?: number;
  extra_round_draw?: number;
  starting_lane_buff?: {
    lane: 'Melee' | 'Ranged' | 'Siege';
    card_count: number;
  };
};

export type StageRewards = {
  coins: number;
  shards: number;
  keys: number;
};

export type CampaignStage = {
  stage_id: string;
  faction: string;
  stage_number: number;
  title: string;
  description: string;
  difficulty: CampaignDifficulty;

  opponent_name: string;
  opponent_commander_id: string;
  opponent_deck_card_ids: string[];

  boss_special_rules?: BossSpecialRule;

  rewards: StageRewards;

  // Populated only on stage 9. Winning the stage grants access to ALL listed factions.
  unlocks_factions?: string[];

  created_at: Timestamp;
};

export type PlayerCampaignProgress = {
  player_id: string;

  // Highest stage_number completed per faction. Key = faction name. 0 = none completed.
  progress: Record<string, number>;

  // First-win timestamp per stage. Key = stage_id.
  completed_stages: Record<string, Timestamp>;

  // Which stages have had rewards claimed (rewards are once-per-stage).
  claimed_stages: Record<string, boolean>;

  created_at: Timestamp;
  updated_at: Timestamp;
};
