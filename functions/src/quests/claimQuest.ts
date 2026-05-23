// Callable: validate a completed quest, pay the reward, mark claimed.
// When the third daily quest of the day is claimed, also mark today's
// UTC date in weekly_streak_days and bump the weekly_streak quest's
// progress.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { QuestProgress } from './questTypes';
import { isQuestComplete } from './questTypes';
import { getDefinition } from './questDefinitions';
import { utcDateKey } from './questCycles';

type ClaimQuestInput = {
  period: 'daily' | 'weekly';
  quest_id: string;
};

type ClaimQuestResult = {
  success: true;
  coins_earned: number;
  shards_earned: number;
  keys_earned: number;
  streak_day_recorded: boolean;
};

export const claimQuest = onCall<ClaimQuestInput, Promise<ClaimQuestResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const { period, quest_id } = request.data ?? {};
    if (period !== 'daily' && period !== 'weekly') {
      throw new HttpsError('invalid-argument', "period must be 'daily' or 'weekly'.");
    }
    if (!quest_id) {
      throw new HttpsError('invalid-argument', 'quest_id is required.');
    }

    const db = admin.firestore();
    const progressRef = db.collection('quest_progress').doc(uid);
    const walletRef = db.collection('player_wallets').doc(uid);

    const result = await db.runTransaction(async (tx) => {
      // ── Reads ────────────────────────────────────────────────────────
      const progressSnap = await tx.get(progressRef);
      if (!progressSnap.exists) {
        throw new HttpsError('failed-precondition', 'Quest progress not found.');
      }
      const progress = progressSnap.data() as QuestProgress;

      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new HttpsError('failed-precondition', 'Wallet not found.');
      }

      // ── Locate the quest ─────────────────────────────────────────────
      const arr = period === 'daily' ? progress.daily_quests : progress.weekly_quests;
      const quest = arr.find((q) => q.quest_id === quest_id);
      if (!quest) {
        throw new HttpsError('not-found', `Quest ${quest_id} not active for this player.`);
      }
      if (quest.claimed) {
        throw new HttpsError('failed-precondition', 'Quest already claimed.');
      }
      if (!isQuestComplete(quest)) {
        throw new HttpsError(
          'failed-precondition',
          `Quest not complete: ${quest.progress}/${quest.target}.`,
        );
      }

      // ── Compute streak bookkeeping ──────────────────────────────────
      // If this was a daily quest, check whether it's the 3rd completion
      // today. If so, record today's UTC date in weekly_streak_days and
      // bump the weekly_streak quest's progress.
      let streakDayRecorded = false;
      if (period === 'daily') {
        // The quest we're about to claim isn't flipped yet — count the
        // hypothetical post-claim state.
        const claimedAfter = progress.daily_quests.filter(
          (q) => q.claimed || q.quest_id === quest_id,
        ).length;
        if (claimedAfter >= progress.daily_quests.length) {
          const todayKey = utcDateKey(new Date());
          if (!progress.weekly_streak_days[todayKey]) {
            progress.weekly_streak_days[todayKey] = true;
            streakDayRecorded = true;
            // Bump weekly_streak quest progress.
            const streakQuest = progress.weekly_quests.find((q) => {
              const def = getDefinition(q.quest_id);
              return def?.tracker_kind === 'streak';
            });
            if (streakQuest) {
              const days = Object.values(progress.weekly_streak_days).filter(Boolean).length;
              streakQuest.progress = Math.min(streakQuest.target, days);
            }
          }
        }
      }

      // ── Apply claim ──────────────────────────────────────────────────
      quest.claimed = true;
      quest.claimed_at = Timestamp.fromDate(new Date());
      progress.updated_at = Timestamp.fromDate(new Date());

      const reward = quest.reward;

      // ── Writes ───────────────────────────────────────────────────────
      tx.update(walletRef, {
        coins: FieldValue.increment(reward.coins),
        shards: FieldValue.increment(reward.shards),
        keys: FieldValue.increment(reward.keys),
        updated_at: FieldValue.serverTimestamp(),
      });

      tx.set(progressRef, progress);

      return {
        success: true as const,
        coins_earned: reward.coins,
        shards_earned: reward.shards,
        keys_earned: reward.keys,
        streak_day_recorded: streakDayRecorded,
      };
    });

    logger.info('Quest claimed', {
      uid,
      period,
      quest_id,
      coins: result.coins_earned,
      shards: result.shards_earned,
      keys: result.keys_earned,
      streak_day_recorded: result.streak_day_recorded,
    });

    return result;
  },
);

