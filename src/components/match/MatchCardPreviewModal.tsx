// src/components/match/MatchCardPreviewModal.tsx
// Update 1: lightweight read-only preview shown by long-pressing any card in
// hand or in a lane. Mid-match focused — no craft/disenchant CTAs, no
// ownership info (that's CardDetailModal's job in the library).
//
// Closes on backdrop tap or the X button. Renders nothing when there's no
// card to show, so the parent can keep the modal mounted conditionally
// without juggling exit-animation state.

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { CardLibraryEntry, Rarity } from '../../types/card';
import type { LiveBoardState } from '../../types/board';

type Props = {
  visible: boolean;
  onClose: () => void;
  cardLibraryEntry: CardLibraryEntry | null;
  liveBoardState: LiveBoardState | null;
  factionColor: string;
};

const RARITY_BORDER: Record<Rarity, string> = {
  Common: '#888888',
  Uncommon: '#4caf50',
  Rare: '#3a7bd5',
  Epic: '#a64ac9',
  Legendary: '#d4a04a',
};

function formatKeyword(kw: string): string {
  return kw.length === 0 ? kw : kw.charAt(0).toUpperCase() + kw.slice(1);
}

export function MatchCardPreviewModal({
  visible,
  onClose,
  cardLibraryEntry,
  liveBoardState,
  factionColor,
}: Props) {
  if (!cardLibraryEntry) return null;

  const base = cardLibraryEntry.base_power;
  const cur = liveBoardState?.current_power ?? base;
  const powerColor = cur > base ? '#5cd35c' : cur < base ? '#e05a5a' : '#f5e7c2';
  const borderColor =
    RARITY_BORDER[cardLibraryEntry.rarity] ?? RARITY_BORDER.Common;
  const hasImage =
    typeof cardLibraryEntry.image_url === 'string' &&
    cardLibraryEntry.image_url.length > 0;

  const isToken = liveBoardState?.is_token === true;
  const keywords = cardLibraryEntry.keywords ?? [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps on the card content so a tap on the
            card itself doesn't dismiss the modal. */}
        <Pressable style={styles.cardWrap} onPress={() => {}}>
          <View style={[styles.card, { borderColor }]}>
            <View style={[styles.art, { backgroundColor: factionColor }]}>
              {hasImage && (
                <ExpoImage
                  source={{ uri: cardLibraryEntry.image_url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={150}
                />
              )}

              {/* Top-left rarity / token badge */}
              <View
                style={[
                  styles.rarityBadge,
                  { backgroundColor: isToken ? '#444' : borderColor },
                ]}
              >
                <Text style={styles.rarityBadgeText}>
                  {isToken ? 'T' : cardLibraryEntry.rarity[0]}
                </Text>
              </View>

              {/* Top-right close button */}
              <Pressable
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                accessibilityRole="button"
                accessibilityLabel="Close card preview"
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.cardName} numberOfLines={2}>
                {cardLibraryEntry.card_name}
              </Text>
              <Text style={[styles.faction, { color: factionColor }]}>
                {cardLibraryEntry.faction}
              </Text>

              <Text style={styles.metaLine}>
                {cardLibraryEntry.card_type} · {cardLibraryEntry.klass}
              </Text>

              <View style={styles.powerRow}>
                <Text style={styles.sectionLabel}>Power</Text>
                <View style={styles.powerValues}>
                  {base !== cur ? (
                    <>
                      <Text style={styles.basePower}>{base}</Text>
                      <Text style={styles.powerArrow}>→</Text>
                      <Text style={[styles.currentPower, { color: powerColor }]}>
                        {cur}
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.currentPower, { color: powerColor }]}>
                      {cur}
                    </Text>
                  )}
                </View>
              </View>

              {cardLibraryEntry.card_type === 'Unit' && (
                <View style={styles.row}>
                  <Text style={styles.sectionLabel}>Optimal Lane</Text>
                  <Text style={styles.rowValue}>
                    {cardLibraryEntry.optimal_lane}
                  </Text>
                </View>
              )}

              {cardLibraryEntry.card_type === 'Spell' &&
                cardLibraryEntry.klass === 'Curse' &&
                cardLibraryEntry.lane_affinity && (
                  <View style={styles.row}>
                    <Text style={styles.sectionLabel}>Targets</Text>
                    <Text style={styles.rowValue}>
                      {cardLibraryEntry.lane_affinity}
                    </Text>
                  </View>
                )}

              {cardLibraryEntry.card_type === 'Spell' &&
                cardLibraryEntry.klass === 'Cleanse' && (
                  <Text style={styles.metaLine}>
                    Cleanses any of your lanes.
                  </Text>
                )}

              {liveBoardState?.status_effect ? (
                <View style={styles.row}>
                  <Text style={styles.sectionLabel}>Status</Text>
                  <Text style={[styles.rowValue, styles.statusValue]}>
                    {liveBoardState.status_effect}
                  </Text>
                </View>
              ) : null}

              {keywords.length > 0 && (
                <View style={styles.keywordBlock}>
                  <Text style={styles.sectionLabel}>Keywords</Text>
                  <View style={styles.keywordChipRow}>
                    {keywords.map((kw) => (
                      <View key={kw} style={styles.keywordChip}>
                        <Text style={styles.keywordChipText}>
                          {formatKeyword(kw)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {cardLibraryEntry.ability_text ? (
                <Text style={styles.ability}>
                  {cardLibraryEntry.ability_text}
                </Text>
              ) : null}
              {cardLibraryEntry.flavor_text ? (
                <Text style={styles.flavor}>
                  {cardLibraryEntry.flavor_text}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 48,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '100%',
  },
  card: {
    backgroundColor: '#15151b',
    borderRadius: 14,
    borderWidth: 3,
    overflow: 'hidden',
  },
  art: {
    aspectRatio: 5 / 4,
    width: '100%',
    overflow: 'hidden',
  },
  rarityBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rarityBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  body: {
    padding: 16,
    paddingBottom: 20,
  },
  cardName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  faction: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  metaLine: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  powerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#0e0e12',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#22222a',
  },
  powerValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  basePower: {
    color: '#888',
    fontSize: 16,
    fontWeight: '700',
  },
  powerArrow: {
    color: '#666',
    fontSize: 14,
    fontWeight: '700',
  },
  currentPower: {
    fontSize: 22,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rowValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusValue: {
    color: '#e0a0c8',
  },
  sectionLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  keywordBlock: {
    marginTop: 4,
    marginBottom: 8,
  },
  keywordChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  keywordChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3a3a44',
    backgroundColor: '#1d1d23',
  },
  keywordChipText: {
    color: '#d4a04a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ability: {
    color: '#ddd',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#22222a',
  },
  flavor: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 8,
  },
});
