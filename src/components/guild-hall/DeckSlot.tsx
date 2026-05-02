// src/components/guild-hall/DeckSlot.tsx
// One slot in the active deck strip. Either a filled card tile (tap to remove)
// or an empty placeholder (no-op). Smaller than MiniCard — the deck strip
// shows 15 of these in a horizontal scroll.

import React from 'react';
import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import type { CardLibraryEntry } from '../../types/card';

type Props = {
  card: CardLibraryEntry | null;
  factionColor: string;
  onPress: () => void;
};

export function DeckSlot({ card, factionColor, onPress }: Props) {
  if (!card) {
    return (
      <View style={[styles.slot, styles.empty]}>
        <Text style={styles.emptyPlus}>+</Text>
      </View>
    );
  }

  const hasImage = typeof card.image_url === 'string' && card.image_url.length > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
    >
      <View style={[styles.art, { backgroundColor: factionColor }]}>
        {hasImage && (
          <Image
            source={{ uri: card.image_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        )}
      </View>
      <View style={styles.overlay}>
        <Text style={styles.name} numberOfLines={1}>
          {card.card_name}
        </Text>
        <Text style={styles.power} numberOfLines={1}>
          {card.card_type === 'Unit' ? card.base_power : '✦'}
        </Text>
      </View>
    </Pressable>
  );
}

const SLOT_WIDTH = 60;
const SLOT_HEIGHT = 84;

const styles = StyleSheet.create({
  slot: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  empty: {
    borderStyle: 'dashed',
    borderColor: '#444',
    backgroundColor: '#181818',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPlus: {
    color: '#444',
    fontSize: 22,
    fontWeight: '300',
  },
  pressed: {
    opacity: 0.7,
  },
  art: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '600',
    flex: 1,
  },
  power: {
    color: '#d4a04a',
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 2,
  },
});
