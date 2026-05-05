// src/lib/admob.ts
// AdMob initialization + rewarded-ad helper. Phase 9.4 monetization stub.
//
// Test units only in v1: __DEV__ uses Google's TestIds, production builds use
// the IDs swapped in at Phase 10 (TestFlight + Play closed beta). The TODOs
// below are the swap points.

import mobileAds, {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

const REWARDED_AD_UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : Platform.select({
      ios: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',     // TODO Phase 10
      android: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX', // TODO Phase 10
    })!;

let initialized = false;

export async function initAdMob(): Promise<void> {
  if (initialized) return;
  await mobileAds().initialize();
  initialized = true;
}

/**
 * Loads and shows a rewarded ad. Resolves true if the user earned the reward,
 * false if the ad failed to load or was dismissed before reward. Never throws.
 */
export async function showRewardedAd(): Promise<boolean> {
  await initAdMob();

  return new Promise((resolve) => {
    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: false,
    });

    let earned = false;
    let resolved = false;

    const subs: Array<() => void> = [];
    const cleanup = () => {
      for (const unsub of subs) {
        try { unsub(); } catch { /* ignore */ }
      }
    };

    const safeResolve = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    subs.push(
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        ad.show().catch(() => safeResolve(false));
      }),
    );
    subs.push(
      ad.addAdEventListener(AdEventType.ERROR, () => {
        safeResolve(false);
      }),
    );
    subs.push(
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
    );
    subs.push(
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        safeResolve(earned);
      }),
    );

    ad.load();
  });
}
