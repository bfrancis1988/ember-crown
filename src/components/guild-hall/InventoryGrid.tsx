// src/components/guild-hall/InventoryGrid.tsx
// 3-column grid of MiniCards filtered/sorted upstream by the Guild Hall screen.
// Cards dim when fully in deck or when the deck is full; tap adds the card to
// the next empty deck slot. FlatList for performance — inventories grow.

import React, { useCallback } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MiniCard } from '../MiniCard';
import type { InventoryCardView } from '../../hooks/useFactionInventory';

type Props = {
  cards: InventoryCardView[];
  onAddCard: (cardId: string) => void;
  deckIsFull: boolean;
};

const COLUMNS = 3;
const GAP = 8;
const HORIZONTAL_PADDING = 12;

export function InventoryGrid({ cards, onAddCard, deckIsFull }: Props) {
  const screenWidth = Dimensions.get('window').width;
  const cardWidth =
    (screenWidth - HORIZONTAL_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const handlePress = useCallback(
    (view: InventoryCardView) => {
      if (deckIsFull) {
        Alert.alert(
          'Deck is full',
          'Deck is full (15/15). Remove a card first.'
        );
        return;
      }
      if (view.quantity_in_deck >= view.quantity_owned) return;
      onAddCard(view.card.card_id);
    },
    [deckIsFull, onAddCard]
  );

  if (cards.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No cards match this filter</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={cards}
      keyExtractor={(item) => item.card.card_id}
      numColumns={COLUMNS}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => {
        const allInDeck = item.quantity_in_deck >= item.quantity_owned;
        const dimmed = deckIsFull || allInDeck;
        const tapDisabled = allInDeck && !deckIsFull;
        return (
          <Pressable
            onPress={() => handlePress(item)}
            disabled={tapDisabled}
            style={({ pressed }) => [
              { width: cardWidth, opacity: dimmed ? 0.45 : 1 },
              pressed && !tapDisabled && { opacity: 0.7 },
            ]}
          >
            <MiniCard card={item.card} factionColor={item.factionColor} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.quantity_in_deck}/{item.quantity_owned}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: GAP,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'flex-start',
    marginBottom: GAP,
    gap: GAP,
  },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
});
