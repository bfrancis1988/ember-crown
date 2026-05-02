// src/components/library/LibraryCardGrid.tsx
// Phase 4.5: 3-column scrollable grid of cards in one faction. Layers
// owned-count and locked overlays on top of the shared MiniCard component.

import React, { useMemo } from 'react';
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { MiniCard } from '../MiniCard';
import { FACTIONS, type FactionId } from '../../lib/factions';
import type { CardLibraryEntry, Rarity } from '../../types/card';
import type { InventoryCard } from '../../types/inventory';
import { CRAFT_DUST_COSTS, MAX_COPIES_PER_CARD } from '../../lib/banners';

type Props = {
  factionId: FactionId;
  allCards: CardLibraryEntry[];
  inventory: InventoryCard[];
  isFactionLocked: boolean;
  onTapCard: (card: CardLibraryEntry) => void;
  mode?: 'browse' | 'craft';
  dustAvailable?: number;
};

const COLUMNS = 3;
const GAP = 8;
const HORIZONTAL_PADDING = 12;

const RARITY_RANK: Record<Rarity, number> = {
  Legendary: 5,
  Epic: 4,
  Rare: 3,
  Uncommon: 2,
  Common: 1,
};

function sortCards(cards: CardLibraryEntry[]): CardLibraryEntry[] {
  return [...cards].sort((a, b) => {
    if (a.card_type !== b.card_type) {
      return a.card_type === 'Unit' ? -1 : 1;
    }
    const rDiff = RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
    if (rDiff !== 0) return rDiff;
    return b.base_power - a.base_power;
  });
}

export function LibraryCardGrid({
  factionId,
  allCards,
  inventory,
  isFactionLocked,
  onTapCard,
  mode = 'browse',
  dustAvailable = 0,
}: Props) {
  const factionMeta = FACTIONS.find((f) => f.id === factionId);
  const factionColor = factionMeta?.color ?? '#888';

  const sortedCards = useMemo(
    () => sortCards(allCards.filter((c) => c.faction === factionId)),
    [allCards, factionId]
  );

  const ownedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of inventory) m.set(inv.card_id, inv.quantity_owned);
    return m;
  }, [inventory]);

  const screenWidth = Dimensions.get('window').width;
  const cardWidth =
    (screenWidth - HORIZONTAL_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  if (sortedCards.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No cards in this faction.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={sortedCards}
      keyExtractor={(card) => card.card_id}
      numColumns={COLUMNS}
      contentContainerStyle={styles.listContent}
      columnWrapperStyle={styles.row}
      renderItem={({ item: card }) => {
        const quantityOwned = ownedMap.get(card.card_id) ?? 0;
        const dustCost = CRAFT_DUST_COSTS[card.rarity];
        const atMax = quantityOwned >= MAX_COPIES_PER_CARD;
        const canAffordCraft = dustAvailable >= dustCost;

        const isCraftMode = mode === 'craft';
        // Browse mode: lock if faction locked OR card not owned.
        // Craft mode: lock visual only when faction locked. Affordability
        // and max-copy are signaled with their own overlays.
        const browseLocked = !isCraftMode && (isFactionLocked || quantityOwned === 0);
        const craftFactionLocked = isCraftMode && isFactionLocked;
        const dimmed =
          browseLocked ||
          craftFactionLocked ||
          (isCraftMode && (atMax || !canAffordCraft));

        return (
          <TouchableOpacity
            style={{ width: cardWidth }}
            onPress={() => onTapCard(card)}
            activeOpacity={0.7}
          >
            <View style={dimmed ? styles.dim : undefined}>
              <MiniCard card={card} factionColor={factionColor} />
            </View>

            {quantityOwned > 0 && (
              <View style={styles.ownedBadge}>
                <Text style={styles.ownedBadgeText}>x{quantityOwned}</Text>
              </View>
            )}

            {isCraftMode && !craftFactionLocked && (
              <View
                style={[
                  styles.craftCostBadge,
                  !canAffordCraft && !atMax && styles.craftCostBadgeUnaffordable,
                ]}
              >
                <Text
                  style={[
                    styles.craftCostText,
                    !canAffordCraft && !atMax && styles.craftCostTextUnaffordable,
                  ]}
                >
                  ✨{dustCost}
                </Text>
              </View>
            )}

            {isCraftMode && atMax && (
              <View pointerEvents="none" style={styles.maxOverlay}>
                <Text style={styles.maxOverlayText}>MAX</Text>
              </View>
            )}

            {browseLocked && (
              <View pointerEvents="none" style={styles.lockOverlay}>
                <Text style={styles.lockGlyph}>🔒</Text>
              </View>
            )}

            {craftFactionLocked && (
              <View pointerEvents="none" style={styles.lockOverlay}>
                <Text style={styles.lockGlyph}>🔒</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 8,
    paddingBottom: 24,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
  },
  dim: { opacity: 0.6 },
  ownedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  ownedBadgeText: {
    color: '#4caf50',
    fontSize: 11,
    fontWeight: '700',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockGlyph: {
    fontSize: 28,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#888', fontSize: 14 },
  craftCostBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: '#d4a04a',
  },
  craftCostBadgeUnaffordable: { borderColor: '#666' },
  craftCostText: { color: '#d4a04a', fontSize: 11, fontWeight: '700' },
  craftCostTextUnaffordable: { color: '#888' },
  maxOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  maxOverlayText: {
    color: '#e87878',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
