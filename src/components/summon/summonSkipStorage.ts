// Per-device, per-rarity flag: has the player seen the full summon
// crystal animation for this rarity at least once? Drives whether
// tap-to-skip is available from frame 1 (seen) or only after the
// SKIP_DELAY_MS threshold (first viewing).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Rarity } from '../../lib/banners';

const ALL_RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

function key(rarity: Rarity): string {
  return `ember_crown_summon_skip_${rarity.toLowerCase()}`;
}

export async function hasSeenRarity(rarity: Rarity): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(rarity))) === '1';
  } catch {
    return false;
  }
}

export async function markRarityViewed(rarity: Rarity): Promise<void> {
  try {
    await AsyncStorage.setItem(key(rarity), '1');
  } catch {
    /* best-effort */
  }
}

// Dev-only utility: clear all rarity flags so first-view behavior can be
// re-tested without uninstalling the app.
export async function resetAllSummonSkipState(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(ALL_RARITIES.map(key));
  } catch {
    /* best-effort */
  }
}
