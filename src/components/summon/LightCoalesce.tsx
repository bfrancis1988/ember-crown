// Brief radial flash that plays after the shards fly. The light pulls
// inward (scale 2 → 1) while flashing on then off — visually it reads
// as the shattered light "becoming" the card before the parent modal
// hands off to its post-reveal scale-in.

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { Rarity } from '../../lib/banners';
import { RARITY_CRYSTAL_COLORS } from './rarityColors';

type Props = {
  rarity: Rarity;
  durationMs: number;
  // Bumps when the parent wants the flash to fire. 0 = idle (not rendered).
  triggerSeq: number;
};

export function LightCoalesce({ rarity, durationMs, triggerSeq }: Props) {
  const scale = useSharedValue(2.0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (triggerSeq === 0) return;
    scale.value = 2.0;
    opacity.value = 0;

    const half = Math.max(40, Math.floor(durationMs / 2));
    scale.value = withTiming(1.0, { duration: durationMs, easing: Easing.in(Easing.quad) });
    opacity.value = withSequence(
      withTiming(1, { duration: half, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: durationMs - half, easing: Easing.in(Easing.quad) }),
    );
  }, [triggerSeq, durationMs, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (triggerSeq === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        {
          backgroundColor: RARITY_CRYSTAL_COLORS[rarity],
          shadowColor: RARITY_CRYSTAL_COLORS[rarity],
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 160,
    height: 160,
    marginTop: -80,
    marginLeft: -80,
    borderRadius: 80,
    // Soft halo via shadow — works on iOS; Android falls back to the solid
    // disc which still reads as a flash given the fast timing.
    shadowOpacity: 0.9,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
});
