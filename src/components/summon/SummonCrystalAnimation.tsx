// The summon crystal sequence. Plays a 5-phase animation timed per rarity,
// then calls onComplete. Skip behavior:
//   - First viewing of a rarity: skip becomes available SKIP_DELAY_MS into
//     the animation (player sees materialize + start of shake first).
//   - Subsequent viewings of that rarity (AsyncStorage flag set): skip
//     available from frame 1, hint not shown.
// Either reaching the final phase OR a successful skip sets the flag.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  cancelAnimation,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { Rarity } from '../../lib/banners';
import { Crystal } from './Crystal';
import { Shards } from './Shards';
import { LightCoalesce } from './LightCoalesce';
import {
  RARITY_CRACK_COUNT,
  RARITY_PHASE_DURATIONS_MS,
  RARITY_SHAKE_AMPLITUDE_PX,
  RARITY_SHARD_COUNT,
  RARITY_SHARD_DISTANCE_PX,
  SKIP_DELAY_MS,
} from './rarityColors';
import { hasSeenRarity, markRarityViewed } from './summonSkipStorage';

type Props = {
  rarity: Rarity;
  onComplete: () => void;
};

const CRYSTAL_SIZE = 200;

export function SummonCrystalAnimation({ rarity, onComplete }: Props) {
  const durations = RARITY_PHASE_DURATIONS_MS[rarity];
  const crackCount = RARITY_CRACK_COUNT[rarity];
  const shardCount = RARITY_SHARD_COUNT[rarity];
  const shardDistance = RARITY_SHARD_DISTANCE_PX[rarity];
  const shakeAmp = RARITY_SHAKE_AMPLITUDE_PX[rarity];

  // Crystal transforms.
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  const crystalOpacity = useSharedValue(0);
  const crystalScale = useSharedValue(0.7);
  const veinOpacity = useSharedValue(0);
  const veinPulseOpacity = useSharedValue(1);

  // One progress value per crack. Stable refs — the array size is constant
  // per rarity, and Reanimated requires hooks be unconditional. We allocate
  // up to a known max (10 = Legendary) and only render the first crackCount.
  const crackP0 = useSharedValue(0);
  const crackP1 = useSharedValue(0);
  const crackP2 = useSharedValue(0);
  const crackP3 = useSharedValue(0);
  const crackP4 = useSharedValue(0);
  const crackP5 = useSharedValue(0);
  const crackP6 = useSharedValue(0);
  const crackP7 = useSharedValue(0);
  const crackP8 = useSharedValue(0);
  const crackP9 = useSharedValue(0);
  const allCrackProgress = [
    crackP0, crackP1, crackP2, crackP3, crackP4,
    crackP5, crackP6, crackP7, crackP8, crackP9,
  ];
  const crackProgress = allCrackProgress.slice(0, crackCount);

  // Child-driven trigger seqs. Bumped to 1 when the shatter/coalesce phases
  // start. 0 = idle so the children render nothing.
  const [shatterSeq, setShatterSeq] = useState(0);
  const [coalesceSeq, setCoalesceSeq] = useState(0);

  // Skip availability: starts false. Becomes true either immediately (if
  // AsyncStorage says we've seen this rarity) or after SKIP_DELAY_MS.
  const [skipAllowed, setSkipAllowed] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  // Track all setTimeouts so we can clear them on skip / unmount.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedRef = useRef(false);

  const safeComplete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    // Best-effort mark; doesn't block onComplete.
    markRarityViewed(rarity).catch(() => { /* swallow */ });
    onComplete();
  };

  const cancelAll = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    cancelAnimation(shakeX);
    cancelAnimation(shakeY);
    cancelAnimation(crystalOpacity);
    cancelAnimation(crystalScale);
    cancelAnimation(veinOpacity);
    cancelAnimation(veinPulseOpacity);
    allCrackProgress.forEach(cancelAnimation);
  };

  const onTap = () => {
    if (!skipAllowed) return;
    cancelAll();
    safeComplete();
  };

  useEffect(() => {
    let mounted = true;

    // Determine first-time vs. seen-before skip eligibility.
    hasSeenRarity(rarity)
      .then((seen) => {
        if (!mounted) return;
        if (seen) {
          // Skip from frame 1, no hint.
          setSkipAllowed(true);
          setHintVisible(false);
        } else {
          // Schedule skip activation + hint after the first-view delay.
          const t = setTimeout(() => {
            if (!mounted) return;
            setSkipAllowed(true);
            setHintVisible(true);
          }, SKIP_DELAY_MS);
          timersRef.current.push(t);
        }
      })
      .catch(() => { /* AsyncStorage error → leave skip disabled */ });

    // ─── PHASE 1: Materialize ─────────────────────────────────────────
    crystalOpacity.value = withTiming(1, {
      duration: durations.materialize,
      easing: Easing.out(Easing.quad),
    });
    crystalScale.value = withSpring(1, {
      damping: 12,
      stiffness: 180,
    });
    veinOpacity.value = withTiming(0.6, { duration: durations.materialize });

    // ─── PHASE 2: Shake + vein pulse (starts after materialize) ───────
    const tShake = setTimeout(() => {
      if (!mounted) return;
      // Symmetric shake on both axes with slight phase offset by using a
      // negative starting amplitude on Y. The looped sequence runs for the
      // shake duration; phase 3 will cancel + lerp down.
      shakeX.value = withRepeat(
        withSequence(
          withTiming(+shakeAmp, { duration: 60, easing: Easing.inOut(Easing.sin) }),
          withTiming(-shakeAmp, { duration: 60, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
      shakeY.value = withRepeat(
        withSequence(
          withTiming(-shakeAmp * 0.7, { duration: 60, easing: Easing.inOut(Easing.sin) }),
          withTiming(+shakeAmp * 0.7, { duration: 60, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
      veinPulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.45, { duration: 220 }),
          withTiming(0.95, { duration: 220 }),
        ),
        -1,
        true,
      );
    }, durations.materialize);
    timersRef.current.push(tShake);

    // ─── PHASE 3: Cracks form, shake decays ───────────────────────────
    const tCrack = setTimeout(() => {
      if (!mounted) return;
      const perCrack = durations.crack / crackCount;
      for (let i = 0; i < crackCount; i++) {
        const sv = allCrackProgress[i];
        sv.value = withDelay(
          i * perCrack,
          withTiming(1, { duration: perCrack, easing: Easing.out(Easing.quad) }),
        );
      }
      // Decay the shake to ~30% of its amplitude over the crack phase. The
      // repeating sequences above are replaced with a single timing to a
      // small amplitude, which Reanimated handles cleanly.
      shakeX.value = withTiming(shakeAmp * 0.3, { duration: durations.crack });
      shakeY.value = withTiming(shakeAmp * 0.3, { duration: durations.crack });
    }, durations.materialize + durations.shake);
    timersRef.current.push(tCrack);

    // ─── PHASE 4: Shatter ─────────────────────────────────────────────
    const tShatter = setTimeout(() => {
      if (!mounted) return;
      crystalOpacity.value = withTiming(0, { duration: 80, easing: Easing.in(Easing.quad) });
      setShatterSeq((s) => s + 1);
    }, durations.materialize + durations.shake + durations.crack);
    timersRef.current.push(tShatter);

    // ─── PHASE 5: Light coalesce ──────────────────────────────────────
    const tCoalesce = setTimeout(() => {
      if (!mounted) return;
      setCoalesceSeq((s) => s + 1);
    }, durations.materialize + durations.shake + durations.crack + durations.shatter);
    timersRef.current.push(tCoalesce);

    // ─── Completion ───────────────────────────────────────────────────
    const total =
      durations.materialize +
      durations.shake +
      durations.crack +
      durations.shatter +
      durations.coalesce;
    const tDone = setTimeout(() => {
      if (!mounted) return;
      safeComplete();
    }, total);
    timersRef.current.push(tDone);

    return () => {
      mounted = false;
      cancelAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rarity]);

  return (
    <Pressable style={styles.touchArea} onPress={onTap}>
      <View style={styles.center}>
        <View style={styles.crystalBox}>
          <Crystal
            rarity={rarity}
            crackCount={crackCount}
            shakeX={shakeX}
            shakeY={shakeY}
            crystalOpacity={crystalOpacity}
            crystalScale={crystalScale}
            veinOpacity={veinOpacity}
            veinPulseOpacity={veinPulseOpacity}
            crackProgress={crackProgress}
          />
          {/* Shards and coalesce render absolutely at the center of crystalBox. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Shards
              rarity={rarity}
              shardCount={shardCount}
              distancePx={shardDistance}
              durationMs={durations.shatter}
              triggerSeq={shatterSeq}
            />
            <LightCoalesce
              rarity={rarity}
              durationMs={durations.coalesce}
              triggerSeq={coalesceSeq}
            />
          </View>
        </View>
      </View>
      {hintVisible && (
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.hintText}>Tap to skip</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crystalBox: {
    width: CRYSTAL_SIZE,
    // Match the SVG aspect ratio (100:150).
    height: CRYSTAL_SIZE * 1.5,
  },
  hintWrap: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: '#888',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});

