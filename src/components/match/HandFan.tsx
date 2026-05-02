// src/components/match/HandFan.tsx
// Horizontal scrolling fan of the viewer's hand. Each card is a MatchCard;
// the selected card raises ~20px upward to indicate selection. When it's not
// the player's turn the whole fan dims and ignores taps.

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MatchCard } from './MatchCard';
import type { CardLibraryEntry } from '../../types/card';
import type { LiveBoardState } from '../../types/board';

type Props = {
  cards: LiveBoardState[];
  cardLibraryMap: Map<string, CardLibraryEntry>;
  factionColorMap: Map<string, string>;
  selectedInstanceId: string | null;
  onSelectCard: (instanceId: string) => void;
  isPlayerTurn: boolean;
};

const FALLBACK_FACTION_COLOR = '#555';

const CARD_WIDTH = 78;
const CARD_OVERLAP = 16; // pixels of overlap between adjacent cards (fan effect)

export function HandFan({
  cards,
  cardLibraryMap,
  factionColorMap,
  selectedInstanceId,
  onSelectCard,
  isPlayerTurn,
}: Props) {
  if (cards.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No cards in hand</Text>
      </View>
    );
  }

  return (
    <View style={[styles.outer, !isPlayerTurn && styles.dimmed]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {cards.map((c, i) => {
          const entry = cardLibraryMap.get(c.card_id);
          if (!entry) return null;
          const color = factionColorMap.get(entry.faction) ?? FALLBACK_FACTION_COLOR;
          const isSelected = selectedInstanceId === c.instance_id;
          return (
            <View
              key={c.instance_id}
              style={[
                styles.cardSlot,
                {
                  width: CARD_WIDTH,
                  marginLeft: i === 0 ? 0 : -CARD_OVERLAP,
                  zIndex: isSelected ? 10 : i,
                  transform: [{ translateY: isSelected ? -20 : 0 }],
                },
              ]}
            >
              <MatchCard
                card={c}
                cardLibraryEntry={entry}
                factionColor={color}
                isSelected={isSelected}
                onPress={isPlayerTurn ? () => onSelectCard(c.instance_id) : undefined}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {},
  dimmed: {
    opacity: 0.55,
  },
  row: {
    // Top padding lives INSIDE the ScrollView's content so the selected
    // card's translateY(-20) lift stays within content bounds. Putting it
    // on the outer wrapper instead lets Android clip the lifted card.
    paddingTop: 28,
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignItems: 'flex-end',
  },
  cardSlot: {
    // width and margins set inline per index
  },
  empty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
