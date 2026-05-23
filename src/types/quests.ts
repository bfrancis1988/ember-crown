// CLIENT mirror of functions/src/quests/questTypes.ts. Identical shape;
// the only difference is the Timestamp import (firebase/firestore vs
// firebase-admin/firestore). Keep both in sync.

import { Timestamp } from 'firebase/firestore';

export type QuestPeriod = 'daily' | 'weekly';

export type QuestTrackerKind =
  | 'counter'
  | 'max_value'
  | 'conditional_match'
  | 'streak';

export type QuestFilter = 'faction' | 'rarity' | null;

export type QuestReward = {
  coins: number;
  shards: number;
  keys: number;
};

export type AssignedQuest = {
  quest_id: string;
  target: number;
  progress: number;
  threshold?: number;
  filter_value?: string;
  claimed: boolean;
  claimed_at?: Timestamp;
  assigned_at: Timestamp;
  title: string;
  reward: QuestReward;
};

export type QuestProgress = {
  player_id: string;
  daily_quests: AssignedQuest[];
  weekly_quests: AssignedQuest[];
  daily_cycle_started_at: Timestamp;
  weekly_cycle_started_at: Timestamp;
  daily_counters: Record<string, number>;
  weekly_counters: Record<string, number>;
  weekly_streak_days: Record<string, boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export function isQuestComplete(q: AssignedQuest): boolean {
  return q.progress >= q.target;
}

// Quest IDs whose tracker_kind is 'streak'. Client-side mirror so the UI
// can render them differently without needing to round-trip through
// definitions. (Currently only weekly_streak qualifies.)
export const STREAK_QUEST_IDS = new Set<string>(['weekly_streak']);
