// src/components/match/overlay/FloatingNumber.tsx
// One floating damage/heal number for the match overlay. Rendered inside the
// MatchOverlay host so it can drift above a card without being clipped by the
// card's `overflow: hidden` or the lane's horizontal ScrollView.

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { NumberEntry } from './MatchOverlay';

const FLOAT_DURATION_MS = 1000;
const FLOAT_DISTANCE = 42; // points drifted upward before fully faded

type Props = {
  spec: NumberEntry;
  onDone: (key: number) => void;
};

export function FloatingNumber({ spec, onDone }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: FLOAT_DURATION_MS }, (finished) => {
      if (finished) runOnJS(onDone)(spec.key);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -FLOAT_DISTANCE * progress.value }],
  }));

  const isDamage = spec.delta < 0;
  const label = `${isDamage ? '-' : '+'}${Math.abs(spec.delta)}`;

  return (
    <Reanimated.Text
      pointerEvents="none"
      style={[
        styles.number,
        { left: spec.x + spec.xOffset, top: spec.y },
        isDamage ? styles.damage : styles.heal,
        animatedStyle,
      ]}
    >
      {label}
    </Reanimated.Text>
  );
}

const styles = StyleSheet.create({
  number: {
    position: 'absolute',
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  damage: { color: '#e05a5a' },
  heal: { color: '#5cd35c' },
});
