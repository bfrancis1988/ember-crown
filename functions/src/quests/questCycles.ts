// UTC cycle math. Pure — no Firestore. Daily cycle = UTC midnight to
// next UTC midnight. Weekly cycle = UTC midnight Monday to next UTC
// midnight Monday.

import { Timestamp } from 'firebase-admin/firestore';

export function getCurrentDailyCycleStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getCurrentWeeklyCycleStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  // UTC day: 0=Sun, 1=Mon, ..., 6=Sat. We want Monday → 0 offset, Sunday → 6.
  const day = d.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

export function isDailyCycleStale(
  cycleStartedAt: Timestamp | null,
  now: Date = new Date(),
): boolean {
  if (!cycleStartedAt) return true;
  return cycleStartedAt.toMillis() < getCurrentDailyCycleStart(now).getTime();
}

export function isWeeklyCycleStale(
  cycleStartedAt: Timestamp | null,
  now: Date = new Date(),
): boolean {
  if (!cycleStartedAt) return true;
  return cycleStartedAt.toMillis() < getCurrentWeeklyCycleStart(now).getTime();
}

// "YYYY-MM-DD" in UTC. Used as keys in weekly_streak_days.
export function utcDateKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Convert "Vanguard Kingdoms" -> "vanguard_kingdoms" for counter-key suffixing.
export function factionSlug(faction: string): string {
  return faction.toLowerCase().replace(/ /g, '_');
}
