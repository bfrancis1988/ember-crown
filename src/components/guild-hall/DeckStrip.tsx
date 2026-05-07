// src/components/guild-hall/DeckStrip.tsx
// Horizontal scroll of 15 deck slots — filled slots followed by empty
// placeholders. Header text shows current/total count, colored green when
// the deck is exactly full and yellow otherwise.

import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { DeckSlot as DeckSlotTile } from './DeckSlot';
import type { CardLibraryEntry } from '../../types/card';
import type { DeckSlot } from '../../types/deck';

const DECK_TARGET = 15;

type Props = {
  deckSlots: DeckSlot[];
  cardLibraryMap: Map<string, CardLibraryEntry>;
  factionColorMap: Map<string, string>;
  onRemoveSlot: (slotId: string) => void;
  // Phase 9.4.5B: live-computed deck power score for the strip's contents.
  // Optional so legacy callers stay rendered without it.
  powerScore?: number | null;
  accentColor?: string;
};

export function DeckStrip({
  deckSlots,
  cardLibraryMap,
  factionColorMap,
  onRemoveSlot,
  powerScore,
  accentColor,
}: Props) {
  // Render at most DECK_TARGET filled slots; pad to DECK_TARGET total with empties.
  const filled = deckSlots.slice(0, DECK_TARGET);
  const emptyCount = Math.max(0, DECK_TARGET - filled.length);
  const count = filled.length;
  const isFull = count === DECK_TARGET;
  const accent = accentColor ?? '#d4a04a';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Active Deck</Text>
        <View style={styles.headerRight}>
          {powerScore != null && (
            <Text style={[styles.headerPower, { color: accent }]}>
              ⚡ {powerScore}
            </Text>
          )}
          <Text
            style={[
              styles.headerCount,
              { color: isFull ? '#4caf50' : accent },
            ]}
          >
            {count}/{DECK_TARGET}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        snapToInterval={68}
        decelerationRate="fast"
      >
        {filled.map((slot) => {
          const card = cardLibraryMap.get(slot.card_id) ?? null;
          const color = factionColorMap.get(slot.faction) ?? '#888';
          return (
            <View key={slot.slot_id} style={styles.slotWrap}>
              <DeckSlotTile
                card={card}
                factionColor={color}
                onPress={() => onRemoveSlot(slot.slot_id)}
              />
            </View>
          );
        })}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.slotWrap}>
            <DeckSlotTile card={null} factionColor="#888" onPress={() => {}} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161616',
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  headerLabel: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerPower: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerCount: {
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 12,
  },
  slotWrap: {
    marginRight: 8,
  },
});
