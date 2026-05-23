// The crystal SVG: a vertical hexagonal gem in the rarity color with
// glowing veins underneath the surface and a configurable number of
// crack <Path>s that progressively "draw on" via strokeDashoffset.
//
// All animation is driven by SharedValues passed in by the parent
// orchestrator. This component only renders — it owns no timing.

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Polygon } from 'react-native-svg';
import type { Rarity } from '../../lib/banners';
import { RARITY_CRYSTAL_COLORS } from './rarityColors';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

// Crystal silhouette in a 100x150 viewBox. Vertical hexagon, classic
// "gem" outline. The vein and crack geometries are computed against
// these same coordinates.
const CRYSTAL_POINTS = '50,0 90,40 90,110 50,150 10,110 10,40';

// Brighter inner highlight for the glassy facet effect.
const FACET_POINTS = '50,0 90,40 50,75 10,40';

// Stroke-dash trick needs a length that exceeds any actual crack length.
// 320 covers a corner-to-corner diagonal of the 100×150 viewBox with
// generous slack.
const CRACK_DASH = 320;

type CrackGeom = { d: string };

function buildCracks(rarity: Rarity, count: number): CrackGeom[] {
  // Deterministic per-rarity geometry so the same rarity always cracks
  // the same way (predictable feel across pulls). Seeded by rarity name.
  let seed = 0;
  for (let i = 0; i < rarity.length; i++) seed = (seed * 31 + rarity.charCodeAt(i)) >>> 0;
  function rand(): number {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xffff) / 0xffff;
  }

  const cracks: CrackGeom[] = [];
  for (let i = 0; i < count; i++) {
    // Start at a random edge point of the hexagon, walk inward with 2-3
    // jagged segments.
    const edgeT = rand();
    const start = pointOnHex(edgeT);
    const segments = 2 + Math.floor(rand() * 2);
    let cx = start.x;
    let cy = start.y;
    let d = `M${start.x.toFixed(1)},${start.y.toFixed(1)}`;
    for (let s = 0; s < segments; s++) {
      // Step toward center (50, 75) with a jagged perpendicular offset.
      const towardX = 50 - cx;
      const towardY = 75 - cy;
      const len = Math.sqrt(towardX * towardX + towardY * towardY) || 1;
      const step = 18 + rand() * 14;
      cx += (towardX / len) * step + (rand() - 0.5) * 14;
      cy += (towardY / len) * step + (rand() - 0.5) * 14;
      d += ` L${cx.toFixed(1)},${cy.toFixed(1)}`;
    }
    cracks.push({ d });
  }
  return cracks;
}

// Walk the hex perimeter at parameter t∈[0,1] and return the (x,y) point.
function pointOnHex(t: number): { x: number; y: number } {
  const verts = [
    { x: 50, y: 0 },
    { x: 90, y: 40 },
    { x: 90, y: 110 },
    { x: 50, y: 150 },
    { x: 10, y: 110 },
    { x: 10, y: 40 },
  ];
  const segCount = verts.length;
  const seg = Math.min(segCount - 1, Math.floor(t * segCount));
  const local = t * segCount - seg;
  const a = verts[seg];
  const b = verts[(seg + 1) % segCount];
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}

type Props = {
  rarity: Rarity;
  crackCount: number;
  // Outer transforms — applied to the wrapping View.
  shakeX: SharedValue<number>;
  shakeY: SharedValue<number>;
  crystalOpacity: SharedValue<number>;
  crystalScale: SharedValue<number>;
  // Inner SVG props.
  veinOpacity: SharedValue<number>;       // base vein visibility (phase 1 fade-in)
  veinPulseOpacity: SharedValue<number>;  // ongoing pulse multiplier (phase 2)
  // Array of 0→1 progress values, one per crack. Order matches buildCracks.
  crackProgress: SharedValue<number>[];
};

export function Crystal({
  rarity,
  crackCount,
  shakeX,
  shakeY,
  crystalOpacity,
  crystalScale,
  veinOpacity,
  veinPulseOpacity,
  crackProgress,
}: Props) {
  const color = RARITY_CRYSTAL_COLORS[rarity];
  const cracks = useMemo(() => buildCracks(rarity, crackCount), [rarity, crackCount]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: crystalOpacity.value,
    transform: [
      { translateX: shakeX.value },
      { translateY: shakeY.value },
      { scale: crystalScale.value },
    ],
  }));

  // Vein opacity multiplies the base by the pulse — both shared values stay
  // independent so phase 1 can fade them in while phase 2 pulses them.
  const veinAnimatedProps = useAnimatedProps(() => ({
    opacity: veinOpacity.value * veinPulseOpacity.value,
  }));

  return (
    <Animated.View style={[styles.wrap, containerStyle]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 150">
        {/* Outer glow ring — a wider semi-transparent stroke around the silhouette. */}
        <Polygon
          points={CRYSTAL_POINTS}
          fill="none"
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={6}
        />
        {/* Translucent body — rarity color, low opacity so veins show through. */}
        <Polygon
          points={CRYSTAL_POINTS}
          fill={color}
          fillOpacity={0.18}
          stroke={color}
          strokeOpacity={0.9}
          strokeWidth={1.5}
        />
        {/* Inner veins — three curved paths radiating from a hidden core. */}
        <AnimatedPolygon
          points="50,30 65,60 55,90 45,90 35,60"
          fill={color}
          animatedProps={veinAnimatedProps}
        />
        <AnimatedPath
          d="M50,30 Q60,55 50,75 Q40,95 50,120"
          stroke={color}
          strokeWidth={1.2}
          fill="none"
          animatedProps={veinAnimatedProps}
        />
        <AnimatedPath
          d="M30,50 Q50,70 70,100"
          stroke={color}
          strokeWidth={0.9}
          fill="none"
          animatedProps={veinAnimatedProps}
        />
        <AnimatedPath
          d="M70,50 Q50,70 30,100"
          stroke={color}
          strokeWidth={0.9}
          fill="none"
          animatedProps={veinAnimatedProps}
        />
        {/* Facet highlight — a brighter quadrilateral suggesting a light face. */}
        <Polygon points={FACET_POINTS} fill="#ffffff" fillOpacity={0.08} />

        {/* Cracks — one AnimatedPath per crack. Each has its own progress SV. */}
        {cracks.map((c, i) => (
          <CrackPath
            key={i}
            d={c.d}
            color={color}
            progress={crackProgress[i]}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

// Single crack <Path>. Pulled out so the useAnimatedProps hook sits at a
// stable index in the render — Reanimated requires hooks be unconditional.
function CrackPath({
  d,
  color,
  progress,
}: {
  d: string;
  color: string;
  progress: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CRACK_DASH * (1 - progress.value),
    opacity: progress.value > 0 ? 1 : 0,
  }));
  return (
    <>
      {/* Outer glow halo — wider, lower-opacity stroke beneath the line. */}
      <AnimatedPath
        d={d}
        stroke={color}
        strokeOpacity={0.5}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={CRACK_DASH}
        animatedProps={animatedProps}
      />
      {/* Sharp inner line. */}
      <AnimatedPath
        d={d}
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={CRACK_DASH}
        animatedProps={animatedProps}
      />
    </>
  );
}

// Wrap fills the parent and lets the SVG scale to it. Parent decides size.
const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: '100%',
  },
});

