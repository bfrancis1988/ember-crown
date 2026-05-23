// Client-side quest helpers: cycle-countdown formatting, reward
// rendering, "most progressed" picking for the home preview line.

import type { AssignedQuest, QuestReward } from '../types/quests';
import { isQuestComplete } from '../types/quests';

// Next UTC midnight as a Date.
export function nextDailyReset(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

// Next UTC midnight Monday as a Date.
export function nextWeeklyReset(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  // Days until next Monday (1). day=0 (Sun) -> 1, day=1 (Mon) -> 7,
  // day=2 (Tue) -> 6, ..., day=6 (Sat) -> 2.
  const daysToMonday = ((1 - day + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysToMonday);
  return d;
}

// "5h 23m" / "23m" / "<1m" — drops zeroed units, no seconds (avoids
// jitter on the UI clock).
export function formatCountdown(ms: number): string {
  if (ms < 0) return '<1m';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return '<1m';
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

// Pick the most-progressed unclaimed daily quest. Tie-broken by first in
// the array (stable order — quests don't reshuffle within a cycle).
// Returns null if all dailies are claimed or there are no dailies.
export function mostProgressedDaily(dailyQuests: AssignedQuest[]): AssignedQuest | null {
  let best: AssignedQuest | null = null;
  let bestRatio = -1;
  for (const q of dailyQuests) {
    if (q.claimed) continue;
    const ratio = q.target > 0 ? q.progress / q.target : 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = q;
    }
  }
  return best;
}

export function countClaimableQuests(quests: AssignedQuest[]): number {
  let n = 0;
  for (const q of quests) {
    if (!q.claimed && isQuestComplete(q)) n++;
  }
  return n;
}

// Render reward as a row of "🪙 100" / "🗝️ 1" segments. Zero amounts hidden.
export function renderRewardSegments(reward: QuestReward): { icon: string; amount: number }[] {
  const out: { icon: string; amount: number }[] = [];
  if (reward.coins > 0) out.push({ icon: '🪙', amount: reward.coins });
  if (reward.shards > 0) out.push({ icon: '💎', amount: reward.shards });
  if (reward.keys > 0) out.push({ icon: '🗝️', amount: reward.keys });
  return out;
}
