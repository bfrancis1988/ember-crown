// Shared types for the quest system. Mirrored at src/types/quests.ts for
// the client. Keep both in sync.

import { Timestamp } from 'firebase-admin/firestore';

export type QuestPeriod = 'daily' | 'weekly';

export type QuestTrackerKind =
  | 'counter'              // increment by 1 per qualifying event
  | 'max_value'            // progress = max(progress, observed value)
  | 'conditional_match'    // per-match boolean; AssignedQuest.threshold holds N
  | 'streak';              // distinct UTC dates with all 3 dailies claimed

export type QuestFilter = 'faction' | 'rarity' | null;

export type QuestReward = {
  coins: number;
  shards: number;
  keys: number;
};

export type QuestDefinition = {
  quest_id: string;
  period: QuestPeriod;
  tracker_kind: QuestTrackerKind;

  // Counter key on QuestProgress.{daily|weekly}_counters this quest reads.
  // Filtered quests have the filter value appended at runtime:
  //   "matches_won" -> "matches_won_with_vanguard_kingdoms"
  counter_key: string;

  // For counter / max_value / streak: target_min..target_max define the goal range.
  // For conditional_match: they define the per-match THRESHOLD range (N value).
  //   The quest's goal count is always 1 in that case.
  target_min: number;
  target_max: number;

  reward: QuestReward;

  filter: QuestFilter;
  filter_options?: {
    rarities?: ('Rare' | 'Epic' | 'Legendary')[];
    min_cards_in_faction?: number;
  };

  title_template: string;        // "Win {n} matches today"

  weight: number;                // draw probability (uniform = 1)
  is_always_assigned: boolean;   // weekly_streak only
};

export type AssignedQuest = {
  quest_id: string;
  target: number;                // goal count: progress >= target → complete
  progress: number;
  threshold?: number;            // conditional_match: the per-match N value
  filter_value?: string;         // resolved faction or rarity, when applicable
  claimed: boolean;
  claimed_at?: Timestamp;
  assigned_at: Timestamp;

  // Snapshots — preserve player's promise even if the definition is edited
  // mid-cycle.
  title: string;
  reward: QuestReward;
};

export type QuestProgress = {
  player_id: string;

  daily_quests: AssignedQuest[];    // length 3
  weekly_quests: AssignedQuest[];   // length 3 (always includes streak)

  daily_cycle_started_at: Timestamp;   // UTC midnight of assignment day
  weekly_cycle_started_at: Timestamp;  // UTC midnight of assignment Monday

  daily_counters: Record<string, number>;
  weekly_counters: Record<string, number>;

  // Keys are UTC date strings (YYYY-MM-DD). value === true once the
  // player has claimed all 3 dailies on that day. Reset weekly.
  weekly_streak_days: Record<string, boolean>;

  created_at: Timestamp;
  updated_at: Timestamp;
};

// Returns true when the quest's progress satisfies its target. Works for
// every tracker_kind because we normalize: for conditional_match,
// target=1 and progress flips 0→1 when the condition fires.
export function isQuestComplete(q: AssignedQuest): boolean {
  return q.progress >= q.target;
}
