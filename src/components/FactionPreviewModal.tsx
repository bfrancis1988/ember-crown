// src/components/FactionPreviewModal.tsx
// Full-screen sliding modal that previews a faction's roster + flavor.
// Reused by the faction picker screen (Phase 2) and will be reusable from
// the deck builder card library (Phase 4).

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MiniCard } from './MiniCard';
import type { FactionMeta } from '../lib/factions';
import type { CardLibraryEntry } from '../types/card';

type Props = {
  faction: FactionMeta;
  isUnlocked: boolean;
  visible: boolean;
  onClose: () => void;
  onSelect?: () => void;
};

const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const HORIZONTAL_PADDING = 16;

function sortRoster(cards: CardLibraryEntry[]): CardLibraryEntry[] {
  return [...cards].sort((a, b) => {
    // Units (card_type === 'Unit') sort before spells.
    if (a.card_type !== b.card_type) {
      return a.card_type === 'Unit' ? -1 : 1;
    }
    return b.base_power - a.base_power;
  });
}

export function FactionPreviewModal({
  faction,
  isUnlocked,
  visible,
  onClose,
  onSelect,
}: Props) {
  const [cards, setCards] = useState<CardLibraryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setIsLoading(true);
    setCards([]);

    (async () => {
      try {
        const q = query(
          collection(db, 'card_library'),
          where('faction', '==', faction.id)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const rows = snap.docs.map((d) => d.data() as CardLibraryEntry);
        setCards(sortRoster(rows));
      } catch (err) {
        console.warn('FactionPreviewModal: roster fetch failed', err);
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, faction.id]);

  // Compute mini-card width so 3 columns fit with consistent gaps.
  const screenWidth = Dimensions.get('window').width;
  const totalGap = GRID_GAP * (GRID_COLUMNS - 1);
  const cardWidth =
    (screenWidth - HORIZONTAL_PADDING * 2 - totalGap) / GRID_COLUMNS;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Text style={[styles.title, { color: faction.color }]} numberOfLines={1}>
            {faction.name}
          </Text>
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
          <View style={[styles.hero, { backgroundColor: faction.color }]}>
            <Text style={styles.heroText}>{faction.name}</Text>
          </View>

          <Text style={styles.longDescription}>{faction.long_description}</Text>

          <Text style={styles.sectionHeader}>Roster</Text>

          {isLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : cards.length === 0 ? (
            <Text style={styles.emptyText}>No cards found.</Text>
          ) : (
            <View style={styles.grid}>
              {cards.map((card, idx) => {
                const isLastInRow = (idx + 1) % GRID_COLUMNS === 0;
                return (
                  <View
                    key={card.card_id}
                    style={{
                      width: cardWidth,
                      marginRight: isLastInRow ? 0 : GRID_GAP,
                      marginBottom: GRID_GAP,
                    }}
                  >
                    <MiniCard card={card} factionColor={faction.color} />
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {isUnlocked ? (
            <TouchableOpacity
              style={[styles.chooseButton, { backgroundColor: faction.color }]}
              onPress={onSelect}
              disabled={!onSelect}
            >
              <Text style={styles.chooseButtonText}>Choose {faction.name}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.lockedFooter}>
              <Text style={styles.lockedText}>🔒 {faction.unlock_hint}</Text>
            </View>
          )}
        </SafeAreaView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#111',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    position: 'absolute',
    right: HORIZONTAL_PADDING,
    top: 8,
    bottom: 8,
    justifyContent: 'center',
  },
  closeText: {
    color: '#ccc',
    fontSize: 22,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 24,
  },
  hero: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  heroText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  longDescription: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
  sectionHeader: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
  },
  loadingBlock: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  footer: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#222',
    backgroundColor: '#111',
  },
  chooseButton: {
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chooseButtonText: {
    color: '#111',
    fontSize: 17,
    fontWeight: '700',
  },
  lockedFooter: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  lockedText: {
    color: '#999',
    fontSize: 14,
  },
});
