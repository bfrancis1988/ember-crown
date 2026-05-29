// Settlement: applies a batch of counter increments (and an optional
// per-match outcome) to a player's quest_progress doc, refreshing the
// daily/weekly cycle if it has rolled over since last write.
//
// MUST be called inside an existing transaction, BEFORE any other writes
// in that transaction (Firestore reads-before-writes rule).

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type {
  AssignedQuest,
  QuestProgress,
} from './questTypes';
import { getDefinition } from './questDefinitions';
import {
  assignNewQuests,
  effectiveCounterKey,
  type EligibilityContext,
} from './questAssignment';
import {
  factionSlug,
  getCurrentDailyCycleStart,
  getCurrentWeeklyCycleStart,
  isDailyCycleStale,
  isWeeklyCycleStale,
} from './questCycles';

export type MatchOutcome = {
  isVictory: boolean;
  // True if the match was claimed (reached game_over). Drives matches_completed.
  isCompleted: boolean;
  // The faction the player used in this match (frozen at init time).
  player_a_faction?: string;
  // Number of player_a cards that ended up in 'discard' state this match
  // — used by the conditional_match "win without losing more than N" quest.
  cards_lost: number;
  // Match mode ('solo' | 'battle_mode' | 'campaign' | ...). Only solo and
  // battle_mode outcomes affect the win-streak counter.
  mode?: string;
};

export type SettlementInput = {
  // Per-event counter increments. Applied identically to daily and
  // weekly counters. Keys match QuestDefinition.counter_key (already
  // suffixed for filtered counters if needed).
  counterIncrements: Record<string, number>;
  // Optional match-outcome data: drives matches_completed/won/faction
  // counters AND the conditional_match evaluator.
  match?: MatchOutcome;
};

// Read player's inventory and tally cards per faction. Eligibility is
// "owns >= 5 unique cards in faction" for faction-filtered quest assignment.
// Read non-transactionally — slight staleness is fine for assignment
// (the player can't both buy and assign their first card simultaneously).
export async function getEligibilityContext(
  uid: string,
  db: admin.firestore.Firestore,
): Promise<EligibilityContext> {
  const MIN_CARDS = 5;
  const inventorySnap = await db
    .collection('player_inventories')
    .doc(uid)
    .collection('cards')
    .get();

  if (inventorySnap.empty) return { eligibleFactions: [] };

  const ownedCardIds: string[] = [];
  for (const d of inventorySnap.docs) {
    const qty = d.data().quantity_owned ?? 0;
    if (qty >= 1) ownedCardIds.push(d.id);
  }
  if (ownedCardIds.length === 0) return { eligibleFactions: [] };

  const refs = ownedCardIds.map((id) => db.collection('card_library').doc(id));
  const cardDocs = await db.getAll(...refs);

  const factionCounts = new Map<string, number>();
  for (const doc of cardDocs) {
    if (!doc.exists) continue;
    const faction = doc.data()?.faction;
    if (typeof faction !== 'string') continue;
    factionCounts.set(faction, (factionCounts.get(faction) ?? 0) + 1);
  }

  const eligible: string[] = [];
  for (const [faction, count] of factionCounts.entries()) {
    if (count >= MIN_CARDS) eligible.push(faction);
  }
  return { eligibleFactions: eligible };
}

// Apply settlement inside an active transaction. The caller is responsible
// for invoking this BEFORE queuing any writes on the same transaction.
export async function settleInTx(
  tx: admin.firestore.Transaction,
  uid: string,
  input: SettlementInput,
  db: admin.firestore.Firestore,
): Promise<void> {
  const progressRef = db.collection('quest_progress').doc(uid);
  const snap = await tx.get(progressRef);

  const now = new Date();
  const dailyCycleStart = Timestamp.fromDate(getCurrentDailyCycleStart(now));
  const weeklyCycleStart = Timestamp.fromDate(getCurrentWeeklyCycleStart(now));
  const serverNow = Timestamp.fromDate(now);

  let progress: QuestProgress;
  let needsCreate = false;
  let dailyStale = false;
  let weeklyStale = false;

  if (snap.exists) {
    progress = snap.data() as QuestProgress;
    dailyStale = isDailyCycleStale(progress.daily_cycle_started_at, now);
    weeklyStale = isWeeklyCycleStale(progress.weekly_cycle_started_at, now);
  } else {
    needsCreate = true;
    dailyStale = true;
    weeklyStale = true;
    progress = {
      player_id: uid,
      daily_quests: [],
      weekly_quests: [],
      daily_cycle_started_at: dailyCycleStart,
      weekly_cycle_started_at: weeklyCycleStart,
      daily_counters: {},
      weekly_counters: {},
      weekly_streak_days: {},
      current_win_streak: 0,
      created_at: serverNow,
      updated_at: serverNow,
    };
  }

  // Backfill for quest_progress docs created before win-streak existed.
  if (typeof progress.current_win_streak !== 'number') {
    progress.current_win_streak = 0;
  }

  // Refresh stale cycles. Eligibility fetched non-transactionally (1
  // inventory query + ~30 card_library reads on a cold day).
  let eligibility: EligibilityContext | null = null;
  if (dailyStale || weeklyStale) {
    eligibility = await getEligibilityContext(uid, db);
  }
  if (dailyStale && eligibility) {
    progress.daily_quests = assignNewQuests('daily', eligibility);
    progress.daily_counters = {};
    progress.daily_cycle_started_at = dailyCycleStart;
  }
  if (weeklyStale && eligibility) {
    progress.weekly_quests = assignNewQuests('weekly', eligibility);
    progress.weekly_counters = {};
    progress.weekly_streak_days = {};
    progress.weekly_cycle_started_at = weeklyCycleStart;
  }

  // Apply counter increments to both daily and weekly counters.
  for (const [key, val] of Object.entries(input.counterIncrements)) {
    if (val === 0) continue;
    progress.daily_counters[key] = (progress.daily_counters[key] ?? 0) + val;
    progress.weekly_counters[key] = (progress.weekly_counters[key] ?? 0) + val;
  }

  // Match-outcome counters.
  if (input.match) {
    if (input.match.isCompleted) {
      bumpBoth(progress, 'matches_completed', 1);
    }
    if (input.match.isVictory) {
      bumpBoth(progress, 'matches_won', 1);
      if (input.match.player_a_faction) {
        bumpBoth(
          progress,
          `matches_won_with_${factionSlug(input.match.player_a_faction)}`,
          1,
        );
      }
    }
  }

  // Win-streak counter — solo + battle_mode only. A win extends it; a loss
  // or draw resets it to 0. Campaign and tutorial outcomes are ignored
  // (they neither extend nor reset). Persists across daily/weekly resets.
  if (input.match && (input.match.mode === 'solo' || input.match.mode === 'battle_mode')) {
    progress.current_win_streak = input.match.isVictory
      ? progress.current_win_streak + 1
      : 0;
  }

  // Re-evaluate active quest progress for counter / streak quests.
  recomputeQuestProgress(progress.daily_quests, progress.daily_counters);
  recomputeQuestProgress(progress.weekly_quests, progress.weekly_counters);
  // Streak quest progress is derived from weekly_streak_days, not counters.
  for (const q of progress.weekly_quests) {
    if (q.claimed) continue;
    const def = getDefinition(q.quest_id);
    if (def?.tracker_kind === 'streak') {
      const days = Object.values(progress.weekly_streak_days).filter(Boolean).length;
      q.progress = Math.min(q.target, days);
    }
  }

  // win_streak quest progress is read straight from the persistent counter.
  for (const q of progress.daily_quests) {
    if (q.claimed) continue;
    const def = getDefinition(q.quest_id);
    if (def?.tracker_kind === 'win_streak') {
      q.progress = Math.min(q.target, progress.current_win_streak);
    }
  }

  // Conditional_match: per-match boolean evaluator.
  if (input.match?.isVictory) {
    for (const q of progress.daily_quests) {
      if (q.claimed) continue;
      const def = getDefinition(q.quest_id);
      if (def?.tracker_kind !== 'conditional_match') continue;
      if (q.threshold !== undefined && input.match.cards_lost <= q.threshold) {
        q.progress = 1;
      }
    }
  }

  progress.updated_at = serverNow;
  // tx.set replaces the full doc. We read in this tx and re-wrote it in JS,
  // so a full write is safe and avoids partial-update edge cases.
  if (needsCreate) {
    tx.set(progressRef, progress);
  } else {
    tx.set(progressRef, progress);
  }

  logger.info('Quest settlement applied', {
    uid,
    created: needsCreate,
    daily_refreshed: dailyStale,
    weekly_refreshed: weeklyStale,
    counter_keys: Object.keys(input.counterIncrements),
    match_outcome_applied: !!input.match,
  });

}

function bumpBoth(progress: QuestProgress, key: string, by: number): void {
  progress.daily_counters[key] = (progress.daily_counters[key] ?? 0) + by;
  progress.weekly_counters[key] = (progress.weekly_counters[key] ?? 0) + by;
}

function recomputeQuestProgress(
  quests: AssignedQuest[],
  counters: Record<string, number>,
): void {
  for (const q of quests) {
    if (q.claimed) continue;
    const def = getDefinition(q.quest_id);
    if (!def || def.tracker_kind !== 'counter') continue;
    const key = effectiveCounterKey(def.counter_key, q.filter_value);
    q.progress = Math.min(q.target, counters[key] ?? 0);
  }
}

// Count player_a cards in 'discard' for a given match — used at claim
// time to compute MatchOutcome.cards_lost for the conditional_match quest.
// Reads up to ~15 docs (player's deck size). Called once per claim.
export async function countCardsLost(
  matchId: string,
  db: admin.firestore.Firestore,
): Promise<number> {
  const snap = await db
    .collection('live_board_state')
    .where('match_id', '==', matchId)
    .where('owner', '==', 'player_a')
    .where('location_state', '==', 'discard')
    .get();
  return snap.size;
}

// Pluck the player_a quest counters off a match session and translate
// them into the counter-key names quest_progress uses. Optional fields
// default to 0.
type SessionLike = {
  player_a_cards_played?: number;
  player_a_units_played?: number;
  player_a_spells_played?: number;
  player_a_melee_lane_played?: number;
  player_a_ranged_lane_played?: number;
  player_a_siege_lane_played?: number;
  player_a_commander_used_count?: number;
  player_a_rare_or_higher_played?: number;
};

export function pickPlayerACounters(session: SessionLike): Record<string, number> {
  return {
    cards_played: session.player_a_cards_played ?? 0,
    units_played: session.player_a_units_played ?? 0,
    spells_played: session.player_a_spells_played ?? 0,
    lane_melee_played: session.player_a_melee_lane_played ?? 0,
    lane_ranged_played: session.player_a_ranged_lane_played ?? 0,
    lane_siege_played: session.player_a_siege_lane_played ?? 0,
    commander_used_count: session.player_a_commander_used_count ?? 0,
    cards_played_rare_or_higher: session.player_a_rare_or_higher_played ?? 0,
  };
}
