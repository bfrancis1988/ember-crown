// Callable: ensures the player's quest_progress doc is fresh and returns
// the current state. The client invokes this on quest-screen open;
// faster path is a plain Firestore read of quest_progress when the
// cycle is known-fresh.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { QuestProgress } from './questTypes';
import { assignNewQuests } from './questAssignment';
import { getEligibilityContext } from './questSettlement';
import {
  getCurrentDailyCycleStart,
  getCurrentWeeklyCycleStart,
  isDailyCycleStale,
  isWeeklyCycleStale,
} from './questCycles';

type AssignQuestsInput = Record<string, never>;
type AssignQuestsResult = { success: true; progress: QuestProgress };

export const assignQuests = onCall<AssignQuestsInput, Promise<AssignQuestsResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    const progressRef = db.collection('quest_progress').doc(uid);

    const now = new Date();
    const dailyCycleStart = Timestamp.fromDate(getCurrentDailyCycleStart(now));
    const weeklyCycleStart = Timestamp.fromDate(getCurrentWeeklyCycleStart(now));
    const serverNow = Timestamp.fromDate(now);

    // Pre-fetch eligibility outside the tx — slight staleness fine for
    // assignment; the alternative (tx.get on the inventory collection)
    // is expensive and adds retry pressure.
    const eligibility = await getEligibilityContext(uid, db);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(progressRef);

      let progress: QuestProgress;
      let needsCreate = false;

      if (snap.exists) {
        progress = snap.data() as QuestProgress;
      } else {
        needsCreate = true;
        progress = {
          player_id: uid,
          daily_quests: [],
          weekly_quests: [],
          daily_cycle_started_at: dailyCycleStart,
          weekly_cycle_started_at: weeklyCycleStart,
          daily_counters: {},
          weekly_counters: {},
          weekly_streak_days: {},
          created_at: serverNow,
          updated_at: serverNow,
        };
      }

      const dailyStale = needsCreate || isDailyCycleStale(progress.daily_cycle_started_at, now);
      const weeklyStale = needsCreate || isWeeklyCycleStale(progress.weekly_cycle_started_at, now);

      if (dailyStale) {
        progress.daily_quests = assignNewQuests('daily', eligibility);
        progress.daily_counters = {};
        progress.daily_cycle_started_at = dailyCycleStart;
      }
      if (weeklyStale) {
        progress.weekly_quests = assignNewQuests('weekly', eligibility);
        progress.weekly_counters = {};
        progress.weekly_streak_days = {};
        progress.weekly_cycle_started_at = weeklyCycleStart;
      }

      if (needsCreate || dailyStale || weeklyStale) {
        progress.updated_at = serverNow;
        tx.set(progressRef, progress);
      }

      return progress;
    });

    logger.info('Quest assignment requested', {
      uid,
      daily_count: result.daily_quests.length,
      weekly_count: result.weekly_quests.length,
    });

    return { success: true, progress: result };
  },
);
