// The post-shatter shard particles. Each shard is a small rarity-colored
// diamond that flies outward from center with a random direction and spin
// when the parent's shatter trigger fires.

import React, { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { Rarity } from '../../lib/banners';
import { RARITY_CRYSTAL_COLORS } from './rarityColors';

type ShardGeom = {
  angleRad: number;   // direction of flight
  spinDeg: number;    // total rotation over the shatter duration
  sizePx: number;     // edge length of the diamond
  delayMs: number;    // small per-shard stagger (0-40ms)
};

function buildShardGeometry(rarity: Rarity, count: number): ShardGeom[] {
  // Deterministic seeded geometry — same rarity always shatters the same
  // way. Predictable feel pull-to-pull.
  let seed = 0;
  for (let i = 0; i < rarity.length; i++) seed = (seed * 31 + rarity.charCodeAt(i)) >>> 0;
  seed = (seed ^ (count * 2654435761)) >>> 0;
  function rand(): number {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xffff) / 0xffff;
  }

  const shards: ShardGeom[] = [];
  for (let i = 0; i < count; i++) {
    // Distribute base angles evenly around the circle, then jitter so they
    // don't look mechanically uniform.
    const baseAngle = (i / count) * Math.PI * 2;
    const jitter = (rand() - 0.5) * 0.7;
    shards.push({
      angleRad: baseAngle + jitter,
      spinDeg: (rand() - 0.5) * 720,
      sizePx: 6 + rand() * 6,
      delayMs: Math.floor(rand() * 40),
    });
  }
  return shards;
}

type Props = {
  rarity: Rarity;
  shardCount: number;
  distancePx: number;
  durationMs: number;
  // Bumps when the parent wants the shatter to fire. 0 = idle (shards hidden).
  triggerSeq: number;
};

export function Shards({ rarity, shardCount, distancePx, durationMs, triggerSeq }: Props) {
  const shards = useMemo(
    () => buildShardGeometry(rarity, shardCount),
    [rarity, shardCount],
  );

  if (triggerSeq === 0) return null;

  return (
    <>
      {shards.map((g, i) => (
        <Shard
          key={i}
          geom={g}
          color={RARITY_CRYSTAL_COLORS[rarity]}
          distancePx={distancePx}
          durationMs={durationMs}
          triggerSeq={triggerSeq}
        />
      ))}
    </>
  );
}

function Shard({
  geom,
  color,
  distancePx,
  durationMs,
  triggerSeq,
}: {
  geom: ShardGeom;
  color: string;
  distancePx: number;
  durationMs: number;
  triggerSeq: number;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Reset to origin (so a Pull Again restart looks correct) and fly.
    tx.value = 0;
    ty.value = 0;
    rot.value = 0;
    opacity.value = 1;

    const dx = Math.cos(geom.angleRad) * distancePx;
    const dy = Math.sin(geom.angleRad) * distancePx;
    const easing = Easing.out(Easing.quad);

    tx.value = withTiming(dx, { duration: durationMs, easing });
    ty.value = withTiming(dy, { duration: durationMs, easing });
    rot.value = withTiming(geom.spinDeg, { duration: durationMs, easing });
    // Hold full opacity for the first 40%, then fade out.
    opacity.value = withTiming(0, {
      duration: durationMs,
      easing: Easing.in(Easing.quad),
    });
    // delayMs is intentionally ignored on the shared values themselves
    // (would complicate cancellation); the visual effect is small enough
    // that uniform launch reads fine.
  }, [triggerSeq, geom.angleRad, geom.spinDeg, distancePx, durationMs, tx, ty, rot, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    // +45 keeps the diamond silhouette (a rotated square) while the spin
    // continues from there. Setting transform here replaces the static
    // 45° base rotation on styles.shard — that base is documentary only.
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rot.value + 45}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.shard,
        {
          width: geom.sizePx,
          height: geom.sizePx,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  shard: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    borderRadius: 1,
    marginTop: -4,
    marginLeft: -4,
  },
});
