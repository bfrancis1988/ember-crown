// src/lib/analytics.ts
// Phase 9.5B: Firebase Analytics wrapper. Eight event types covering signup,
// onboarding, first-of-mode milestones, and monetization. All entry points
// fail safe — pre-rebuild dev clients keep working with a console.warn.
//
// Fire-once events are guarded server-side by player_profiles
// .fired_analytics_events (a string[] of event names that have already
// fired). The guard is best-effort: a reinstall wipes app state and the
// server flags persist, so "first match" never re-fires for the same uid.
//
// Idempotency caveat: between read and write the analytics event is logged.
// In a race (two devices, same uid, same event simultaneously) the event
// could log twice. Acceptable for v1 since the events themselves are cheap
// to over-count.

import analytics from '@react-native-firebase/analytics';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

let analyticsAvailable: boolean | null = null;

function isAnalyticsLoaded(): boolean {
  if (analyticsAvailable !== null) return analyticsAvailable;
  try {
    analytics();
    analyticsAvailable = true;
  } catch (err) {
    analyticsAvailable = false;
    console.warn(
      'Analytics native module unavailable — skipping. ' +
        '(Expected on dev clients built before Phase 9.5B.)',
      err,
    );
  }
  return analyticsAvailable;
}

async function safeLog(eventName: string, params?: Record<string, unknown>): Promise<void> {
  if (!isAnalyticsLoaded()) return;
  try {
    await analytics().logEvent(eventName, params);
  } catch (err) {
    console.warn(`Analytics logEvent("${eventName}") failed:`, err);
  }
}

export const Analytics = {
  signup: (method: 'email' | 'google') =>
    safeLog('sign_up', { method }),

  tutorialComplete: () =>
    safeLog('tutorial_complete'),

  firstMatch: (mode: 'solo' | 'campaign' | 'battle_mode') =>
    safeLog('first_match', { mode }),

  firstSummon: (banner: 'common' | 'rare' | 'premium') =>
    safeLog('first_summon', { banner }),

  firstCampaignWin: (faction: string) =>
    safeLog('first_campaign_win', { faction }),

  firstBattleModeMatch: (faction: string) =>
    safeLog('first_battle_mode_match', { faction }),

  adWatched: (placement: 'win' | 'loss', mode: string) =>
    safeLog('ad_watched', { placement, mode }),

  iapAttempted: (sku: string) =>
    safeLog('iap_attempted', { sku }),
};

/**
 * Fires `eventName` exactly once per player. Reads the player's
 * fired_analytics_events list, fires the event if absent, then appends the
 * event name back to the list via arrayUnion (idempotent server-side).
 *
 * Returns true if the event fired, false if already fired (or on error —
 * analytics is best-effort).
 */
export async function fireOnceAnalyticsEvent(
  uid: string,
  eventName: string,
  log: () => Promise<void>,
): Promise<boolean> {
  try {
    const profileRef = doc(db, 'player_profiles', uid);
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return false;
    const fired = (snap.data().fired_analytics_events ?? []) as string[];
    if (fired.includes(eventName)) return false;

    await log();
    await updateDoc(profileRef, {
      fired_analytics_events: arrayUnion(eventName),
      updated_at: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.warn(`fireOnceAnalyticsEvent("${eventName}") failed:`, err);
    return false;
  }
}
