// src/components/match/overlay/GhostCard.tsx
// One in-flight card clone for the hand-to-lane animation. Rendered inside the
// MatchOverlay host; flies from a source rect to a target rect, both in screen
// space. While a ghost is in flight, HandFan/LaneRow suppress their own render
// of the same instance so only the ghost is visible.

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MatchCard } from '../MatchCard';
import type { GhostEntry } from './MatchOverlay';

const FLIGHT_DURATION_MS = 350;
// Lane cards render at width 56 (LaneRow's cardWrap). The ghost view is sized
// to that, and scaled up at the source so a wider hand card lands seamlessly.
const LANE_CARD_WIDTH = 56;

type Props = {
  spec: GhostEntry;
};

export function GhostCard({ spec }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: FLIGHT_DURATION_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        // The ghost stays parked at the target until the match screen removes
        // it (gated on Firestore confirmation); here we only report flight end.
        if (finished) runOnJS(spec.onAnimComplete)();
      },
    );
    // Flight runs exactly once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const x = spec.from.x + (spec.to.x - spec.from.x) * t;
    const y = spec.from.y + (spec.to.y - spec.from.y) * t;
    // Scale from the source card's width down to a lane card's width. At t=1
    // scale is exactly 1, so the ghost lands pixel-aligned with the real card.
    const startScale = spec.from.width / LANE_CARD_WIDTH;
    const scale = startScale + (1 - startScale) * t;
    return {
      transform: [{ translateX: x }, { translateY: y }, { scale }],
    };
  });

  return (
    <Reanimated.View style={[styles.ghost, animatedStyle]} pointerEvents="none">
      <MatchCard
        card={spec.card}
        cardLibraryEntry={spec.entry}
        factionColor={spec.factionColor}
      />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LANE_CARD_WIDTH,
  },
});
