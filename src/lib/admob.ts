// src/lib/admob.ts
// AdMob initialization + rewarded-ad helper.
//
// __DEV__ uses Google's TestIds so dev/TestFlight-internal testing never
// triggers AdMob policy violations. Production builds use the real units.

import mobileAds, {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  MaxAdContentRating,
  TestIds,
} from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

const PROD_REWARDED_ANDROID = 'ca-app-pub-4913659728698968/1794730331';
const PROD_REWARDED_IOS = 'ca-app-pub-4913659728698968/8168566998';

const REWARDED_AD_UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : Platform.OS === 'ios'
    ? PROD_REWARDED_IOS
    : PROD_REWARDED_ANDROID;

// CCPA Path B: non-personalized ads only. Privacy policy commits to this,
// so every ad request must set requestNonPersonalizedAdsOnly: true.
const AD_REQUEST_OPTIONS = {
  requestNonPersonalizedAdsOnly: true,
} as const;

let initialized = false;

export async function initAdMob(): Promise<void> {
  if (initialized) return;
  await mobileAds().setRequestConfiguration({
    maxAdContentRating: MaxAdContentRating.T,
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  });
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
    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, AD_REQUEST_OPTIONS);

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
