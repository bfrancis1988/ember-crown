// src/components/MiniCard.tsx
// Compact card preview tile. Reused by FactionPreviewModal in Phase 2 and the
// deck builder in Phase 4. Pure presentational — no taps, no state.

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { CardLibraryEntry, Rarity } from '../types/card';

type Props = {
  card: CardLibraryEntry;
  factionColor: string;
};

const RARITY_BORDER: Record<Rarity, string> = {
  Common: '#888888',
  Uncommon: '#4caf50',
  Rare: '#3a7bd5',
  Epic: '#a64ac9',
  Legendary: '#d4a04a',
};

export function MiniCard({ card, factionColor }: Props) {
  const borderColor = RARITY_BORDER[card.rarity] ?? RARITY_BORDER.Common;
  const [imageError, setImageError] = useState(false);
  const hasImage =
    typeof card.image_url === 'string' &&
    card.image_url.length > 0 &&
    !imageError;

  return (
    <View style={[styles.card, { borderColor }]}>
      <View style={[styles.art, { backgroundColor: factionColor }]}>
        {hasImage && (
          <ExpoImage
            source={{ uri: card.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            onError={() => setImageError(true)}
          />
        )}
        <View style={[styles.rarityBadge, { backgroundColor: borderColor }]}>
          <Text style={styles.rarityText}>{card.rarity[0]}</Text>
        </View>
      </View>

      <View style={styles.overlay}>
        <Text style={styles.name} numberOfLines={1}>
          {card.card_name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {card.klass} · {card.base_power}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 5 / 7,
    width: '100%',
    borderRadius: 6,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  art: {
    flex: 1,
    width: '100%',
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
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  name: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  meta: {
    color: '#ccc',
    fontSize: 9,
    marginTop: 1,
  },
});
