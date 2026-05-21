// src/components/match/MatchCard.tsx
// In-match card tile. Renders either a face-up card (live power, status badge,
// selection glow) or a face-down back. Used by HandFan and LaneRow.
//
// Intentionally NOT shared with MiniCard from Phase 2 — that one renders the
// static library entry; this one renders a live in-match instance.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import type { CardLibraryEntry, Rarity } from '../../types/card';
import type { LiveBoardState } from '../../types/board';

type Props = {
  card: LiveBoardState;
  cardLibraryEntry: CardLibraryEntry;
  factionColor: string;
  isSelected?: boolean;
  isFaceDown?: boolean;
  onPress?: () => void;
  // Update 1: long-press opens the mid-match preview modal. Forwarded only
  // when the tile is already Pressable (i.e. when onPress is also set) so
  // lane cards keep bubbling short-taps to the parent lane's onTapLane.
  // In practice that means: hand cards support preview, lane cards don't.
  onLongPress?: () => void;
  // Release 1.1.0: monotonically increasing seq from useBoardObserver's
  // powerDeltas — bumps when this card's power changes, triggering the scale
  // pulse. MatchCard does no power diffing of its own.
  powerChangeSeq?: number;
};

const RARITY_BORDER: Record<Rarity, string> = {
  Common: '#888888',
  Uncommon: '#4caf50',
  Rare: '#3a7bd5',
  Epic: '#a64ac9',
  Legendary: '#d4a04a',
};

// Status effect badge with self-managed entry/exit + continuous pulse.
// Stays mounted during exit fade so the badge doesn't pop out of existence;
// `visibleEffect` is cleared in the fade-out completion callback, which
// returns null on the next render and the badge truly unmounts.
function PulsingStatusBadge({ statusEffect }: { statusEffect: string | null }) {
  const [visibleEffect, setVisibleEffect] = useState<string | null>(statusEffect);
  const opacity = useRef(new Animated.Value(statusEffect ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(statusEffect ? 1 : 0.5)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (statusEffect) {
      const wasHidden = visibleEffect === null;
      setVisibleEffect(statusEffect);
      if (wasHidden) {
        opacity.setValue(0);
        scale.setValue(0.5);
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]).start();
      }
    } else if (visibleEffect) {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setVisibleEffect(null);
        }
      );
    }
    // visibleEffect intentionally omitted: we only react to external prop changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusEffect]);

  useEffect(() => {
    if (!visibleEffect) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visibleEffect, pulse]);

  if (!visibleEffect) return null;

  return (
    <Animated.View
      style={[
        styles.statusBadge,
        { opacity: Animated.multiply(opacity, pulse), transform: [{ scale }] },
      ]}
    >
      <Text style={styles.statusBadgeText} numberOfLines={1}>
        {formatStatusEffect(visibleEffect)}
      </Text>
    </Animated.View>
  );
}

export function MatchCard({
  card,
  cardLibraryEntry,
  factionColor,
  isSelected = false,
  isFaceDown = false,
  onPress,
  onLongPress,
  powerChangeSeq,
}: Props) {
  const borderColor = RARITY_BORDER[cardLibraryEntry.rarity] ?? RARITY_BORDER.Common;
  const [imageError, setImageError] = useState(false);
  const showImage =
    !isFaceDown &&
    typeof cardLibraryEntry.image_url === 'string' &&
    cardLibraryEntry.image_url.length > 0 &&
    !imageError;

  // Power coloring: green if buffed above base, red if debuffed below base,
  // cream if equal. Computed before the isFaceDown guard so the animation
  // hooks below stay unconditional.
  const base = cardLibraryEntry.base_power;
  const cur = card.current_power;
  const powerColor = cur > base ? '#5cd35c' : cur < base ? '#e05a5a' : '#f5e7c2';

  // Item 3: the power number crossfades toward its current color (350ms) and
  // gives a brief scale pulse (~250ms) whenever the value changes. The pulse
  // is driven by the central observer's powerDeltas seq — MatchCard never
  // diffs power itself; the crossfade just eases toward the current color.
  const powerColorSV = useSharedValue(powerColor);
  const powerScaleSV = useSharedValue(1);
  useEffect(() => {
    powerColorSV.value = withTiming(powerColor, { duration: 350 });
  }, [powerColor, powerColorSV]);
  useEffect(() => {
    if (powerChangeSeq === undefined) return;
    powerScaleSV.value = withSequence(
      withTiming(1.15, { duration: 120 }),
      withTiming(1, { duration: 130 }),
    );
  }, [powerChangeSeq, powerScaleSV]);
  const powerAnimStyle = useAnimatedStyle(() => ({
    color: powerColorSV.value,
    transform: [{ scale: powerScaleSV.value }],
  }));

  if (isFaceDown) {
    return (
      <View style={[styles.card, styles.cardBack, { borderColor: '#333' }]}>
        <View style={[styles.backTint, { backgroundColor: factionColor }]} />
        <Text style={styles.backMotif}>✦</Text>
      </View>
    );
  }

  // Phase 9.4.2B — tokens get a dimmer border + a "T" badge so they read
  // as ephemeral compared to real cards.
  const isToken = !!card.is_token;

  const containerStyle = [
    styles.card,
    { borderColor: isToken ? '#555' : borderColor },
    isToken && styles.tokenCard,
    isSelected && styles.selected,
  ];

  const Inner = (
    <View style={[styles.art, { backgroundColor: factionColor }]}>
      {showImage && (
        <ExpoImage
          source={{ uri: cardLibraryEntry.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          onError={() => setImageError(true)}
        />
      )}
      {/* Status effect badge — top-left. Self-managed entry/exit + pulse. */}
      <PulsingStatusBadge statusEffect={card.status_effect} />

      {/* Rarity dot — top-right (tokens show a "T" badge instead) */}
      {isToken ? (
        <View style={[styles.rarityBadge, styles.tokenBadge]}>
          <Text style={styles.rarityText}>T</Text>
        </View>
      ) : (
        <View style={[styles.rarityBadge, { backgroundColor: borderColor }]}>
          <Text style={styles.rarityText}>{cardLibraryEntry.rarity[0]}</Text>
        </View>
      )}

      {/* Bottom overlay: name + power */}
      <View style={styles.overlay}>
        <Text style={styles.name} numberOfLines={1}>
          {cardLibraryEntry.card_name}
        </Text>
        <View style={styles.bottomRow}>
          <Text style={styles.klass} numberOfLines={1}>
            {cardLibraryEntry.klass}
          </Text>
          <View style={styles.powerPair}>
            {base !== cur && <Text style={styles.basePower}>{base}</Text>}
            <Reanimated.Text style={[styles.power, powerAnimStyle]}>
              {cur}
            </Reanimated.Text>
          </View>
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [...containerStyle, pressed && styles.pressed]}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        {Inner}
      </Pressable>
    );
  }
  return <View style={containerStyle}>{Inner}</View>;
}

function formatStatusEffect(eff: string): string {
  // status_effect strings are seeded by the curse spells in functions/.
  // Compress to a short glyph for the badge.
  if (eff.toLowerCase().includes('frost') || eff.toLowerCase().includes('freeze')) return '❄';
  if (eff.toLowerCase().includes('burn') || eff.toLowerCase().includes('fire')) return '🔥';
  if (eff.toLowerCase().includes('curse')) return '☠';
  return eff.slice(0, 4);
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 5 / 7,
    borderRadius: 6,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  selected: {
    borderColor: '#f5c84a',
    borderWidth: 3,
    shadowColor: '#f5c84a',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  tokenCard: {
    opacity: 0.85,
    borderStyle: 'dashed',
  },
  tokenBadge: {
    backgroundColor: '#444',
  },
  pressed: {
    opacity: 0.7,
  },
  art: {
    flex: 1,
    width: '100%',
  },
  cardBack: {
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backTint: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.25,
  },
  backMotif: {
    color: '#f5e7c2',
    fontSize: 28,
    opacity: 0.5,
  },
  rarityBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rarityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(120, 40, 80, 0.85)',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  name: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 1,
  },
  klass: {
    color: '#bbb',
    fontSize: 9,
    flex: 1,
  },
  power: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  // base_power displayed alongside current_power when they differ. Muted gray
  // so it reads as secondary context — current_power keeps its dynamic
  // green/red/cream color and remains the primary number.
  basePower: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  powerPair: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
});
