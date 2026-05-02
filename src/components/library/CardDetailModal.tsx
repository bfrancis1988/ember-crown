// src/components/library/CardDetailModal.tsx
// Phase 4.5: full-screen sliding modal showing one card's full metadata.
// Read-only — no summon/purchase CTA in v1 (Phase 6 may revisit).

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CardLibraryEntry, Rarity } from '../../types/card';
import { CRAFT_DUST_COSTS, MAX_COPIES_PER_CARD } from '../../lib/banners';

type Props = {
  card: CardLibraryEntry | null;
  factionColor: string;
  quantityOwned: number;
  isFactionLocked: boolean;
  onClose: () => void;
  mode?: 'browse' | 'craft';
  dustAvailable?: number;
  onCraft?: () => void;
  isCrafting?: boolean;
};

const RARITY_BORDER: Record<Rarity, string> = {
  Common: '#888888',
  Uncommon: '#4caf50',
  Rare: '#3a7bd5',
  Epic: '#a64ac9',
  Legendary: '#d4a04a',
};

const HORIZONTAL_PADDING = 16;

export function CardDetailModal({
  card,
  factionColor,
  quantityOwned,
  isFactionLocked,
  onClose,
  mode = 'browse',
  dustAvailable = 0,
  onCraft,
  isCrafting = false,
}: Props) {
  const visible = card !== null;
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = screenWidth * 0.7;

  const isCraftMode = mode === 'craft';
  // In craft mode the visual is never "locked" by ownership-zero — every
  // card is a candidate. Faction lock still applies.
  const isLockedDisplay = isCraftMode
    ? isFactionLocked
    : isFactionLocked || quantityOwned === 0;

  const dustCost = card ? CRAFT_DUST_COSTS[card.rarity] : 0;
  const atMax = quantityOwned >= MAX_COPIES_PER_CARD;
  const canAffordCraft = dustAvailable >= dustCost;
  const craftEnabled =
    isCraftMode && !isFactionLocked && !atMax && canAffordCraft && !isCrafting;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {card && (
          <>
            <View style={styles.topBar}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.cardWrap}>
                <View
                  style={[
                    styles.cardVisual,
                    {
                      width: cardWidth,
                      borderColor: RARITY_BORDER[card.rarity],
                      backgroundColor: factionColor,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.rarityBadge,
                      { backgroundColor: RARITY_BORDER[card.rarity] },
                    ]}
                  >
                    <Text style={styles.rarityBadgeText}>{card.rarity[0]}</Text>
                  </View>

                  <View style={styles.nameWrap}>
                    <Text style={styles.cardName} numberOfLines={2}>
                      {card.card_name}
                    </Text>
                  </View>

                  <View style={styles.powerWrap}>
                    <Text style={styles.powerText}>{card.base_power}</Text>
                  </View>

                  {isLockedDisplay && (
                    <View style={styles.lockOverlay}>
                      <Text style={styles.lockOverlayText}>🔒</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.metadata}>
                <Text style={[styles.factionLine, { color: factionColor }]}>
                  {card.faction}
                </Text>

                <Text style={styles.metaLine}>
                  {card.card_type} — {card.klass}
                </Text>

                {renderLaneLine(card)}

                <Text style={styles.metaLine}>Base Power: {card.base_power}</Text>

                <View style={styles.ownershipBlock}>
                  {isFactionLocked ? (
                    <Text style={styles.ownershipLocked}>
                      🔒 {card.faction} not yet unlocked
                    </Text>
                  ) : quantityOwned > 0 ? (
                    <Text style={styles.ownershipOwned}>
                      Owned: {quantityOwned}
                    </Text>
                  ) : (
                    <Text style={styles.ownershipLocked}>
                      🔒 Not yet collected
                    </Text>
                  )}
                </View>

                {/* Phase 8 will populate this slot with flavor text + art notes. */}
                <View style={styles.flavorPlaceholder}>
                  <Text style={styles.flavorText}>
                    {card.faction} — {card.rarity}.
                  </Text>
                </View>

                {isCraftMode && (
                  <View style={styles.craftBlock}>
                    {isFactionLocked ? (
                      <Text style={styles.craftLocked}>
                        🔒 Unlock {card.faction} to craft this card.
                      </Text>
                    ) : atMax ? (
                      <View
                        style={[styles.craftButton, styles.craftButtonDisabled]}
                      >
                        <Text style={styles.craftButtonTextDisabled}>
                          Already owned ({MAX_COPIES_PER_CARD}/{MAX_COPIES_PER_CARD})
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.craftButton,
                          !craftEnabled && styles.craftButtonDisabled,
                        ]}
                        onPress={craftEnabled ? onCraft : undefined}
                        disabled={!craftEnabled}
                      >
                        {isCrafting ? (
                          <ActivityIndicator color="#111" />
                        ) : (
                          <Text
                            style={
                              craftEnabled
                                ? styles.craftButtonText
                                : styles.craftButtonTextDisabled
                            }
                          >
                            Craft (✨ {dustCost})
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                    {!atMax && !isFactionLocked && !canAffordCraft && (
                      <Text style={styles.craftHint}>
                        Need {dustCost - dustAvailable} more dust.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function renderLaneLine(card: CardLibraryEntry) {
  if (card.card_type === 'Unit') {
    return (
      <Text style={styles.metaLine}>Optimal Lane: {card.optimal_lane}</Text>
    );
  }
  if (card.klass === 'Curse') {
    if (!card.lane_affinity) return null;
    return <Text style={styles.metaLine}>Targets: {card.lane_affinity}</Text>;
  }
  return <Text style={styles.metaLine}>Cleanses any of your lanes</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 8,
  },
  closeButton: { padding: 4 },
  closeText: { color: '#ccc', fontSize: 24, fontWeight: '500' },
  scrollContent: { paddingBottom: 32 },
  cardWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 24 },
  cardVisual: {
    aspectRatio: 5 / 7,
    borderRadius: 10,
    borderWidth: 3,
    overflow: 'hidden',
  },
  rarityBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rarityBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  nameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 44,
    alignItems: 'center',
  },
  cardName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  powerWrap: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  powerText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockOverlayText: { fontSize: 56 },
  metadata: { paddingHorizontal: HORIZONTAL_PADDING },
  factionLine: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  metaLine: { color: '#ddd', fontSize: 15, lineHeight: 22 },
  ownershipBlock: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  ownershipOwned: { color: '#4caf50', fontSize: 16, fontWeight: '700' },
  ownershipLocked: { color: '#999', fontSize: 16, fontWeight: '600' },
  flavorPlaceholder: {
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
  },
  flavorText: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
  },
  craftBlock: { marginTop: 24 },
  craftButton: {
    height: 50,
    borderRadius: 10,
    backgroundColor: '#d4a04a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  craftButtonDisabled: { backgroundColor: '#2a2a2a' },
  craftButtonText: { color: '#111', fontSize: 16, fontWeight: '700' },
  craftButtonTextDisabled: { color: '#888', fontSize: 14, fontWeight: '600' },
  craftLocked: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 14,
  },
  craftHint: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
