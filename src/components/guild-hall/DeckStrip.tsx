// src/components/guild-hall/DeckStrip.tsx
// Horizontal scroll of 15 deck slots — filled slots followed by empty
// placeholders. A floating overlay pill on the left edge shows the deck's
// power score and slot count (green when exactly full).

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

      {/* Floating overlay pill — power + count, doesn't push the row down. */}
      <View style={styles.overlayPill} pointerEvents="none">
        {powerScore != null && (
          <Text style={[styles.overlayPower, { color: accent }]}>
            ⚡ {powerScore}
          </Text>
        )}
        <Text
          style={[
            styles.overlayCount,
            { color: isFull ? '#4caf50' : accent },
          ]}
        >
          {count}/{DECK_TARGET}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161616',
    paddingTop: 4,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
    position: 'relative',
  },
  scroll: {
    paddingHorizontal: 12,
    paddingLeft: 76, // leave room for the overlay pill on the left edge
  },
  slotWrap: {
    marginRight: 8,
  },
  overlayPill: {
    position: 'absolute',
    left: 8,
    top: '50%',
    transform: [{ translateY: -16 }],
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a30',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  overlayPower: {
    fontSize: 10,
    fontWeight: '700',
  },
  overlayCount: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
});
