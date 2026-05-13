// src/components/match/MatchCard.tsx
// In-match card tile. Renders either a face-up card (live power, status badge,
// selection glow) or a face-down back. Used by HandFan and LaneRow.
//
// Intentionally NOT shared with MiniCard from Phase 2 — that one renders the
// static library entry; this one renders a live in-match instance.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
};

const RARITY_BORDER: Record<Rarity, string> = {
  Common: '#888888',
  Uncommon: '#4caf50',
  Rare: '#3a7bd5',
  Epic: '#a64ac9',
  Legendary: '#d4a04a',
};

export function MatchCard({
  card,
  cardLibraryEntry,
  factionColor,
  isSelected = false,
  isFaceDown = false,
  onPress,
}: Props) {
  const borderColor = RARITY_BORDER[cardLibraryEntry.rarity] ?? RARITY_BORDER.Common;
  const [imageError, setImageError] = useState(false);
  const showImage =
    !isFaceDown &&
    typeof cardLibraryEntry.image_url === 'string' &&
    cardLibraryEntry.image_url.length > 0 &&
    !imageError;

  if (isFaceDown) {
    return (
      <View style={[styles.card, styles.cardBack, { borderColor: '#333' }]}>
        <View style={[styles.backTint, { backgroundColor: factionColor }]} />
        <Text style={styles.backMotif}>✦</Text>
      </View>
    );
  }

  // Power coloring: green if buffed above base, red if debuffed below, default otherwise.
  const base = cardLibraryEntry.base_power;
  const cur = card.current_power;
  const powerColor = cur > base ? '#5cd35c' : cur < base ? '#e05a5a' : '#f5e7c2';

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
      {/* Status effect badge — top-left */}
      {card.status_effect ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText} numberOfLines={1}>
            {formatStatusEffect(card.status_effect)}
          </Text>
        </View>
      ) : null}

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
            <Text style={[styles.power, { color: powerColor }]}>{cur}</Text>
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
