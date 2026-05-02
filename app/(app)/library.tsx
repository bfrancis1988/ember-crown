// app/(app)/library.tsx
// Phase 4.5: Card Library browser. Read-only view of all 88 cards across all
// 6 factions, with locked/owned overlays and a tap-to-detail modal.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { usePlayerInventory } from '../../src/hooks/usePlayerInventory';
import { useCardLibrary } from '../../src/hooks/useCardLibrary';
import { LibraryFactionTabs } from '../../src/components/library/LibraryFactionTabs';
import { LibraryCardGrid } from '../../src/components/library/LibraryCardGrid';
import { CardDetailModal } from '../../src/components/library/CardDetailModal';
import { FACTIONS, STARTER_FACTION, type FactionId } from '../../src/lib/factions';
import type { CardLibraryEntry } from '../../src/types/card';

export default function CardLibraryScreen() {
  const router = useRouter();
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { inventory } = usePlayerInventory();
  const [libraryKey, setLibraryKey] = useState(0);

  // Defensive fallback: a profile with no unlocked_factions array is treated
  // as starter-only (matches isFactionUnlocked in lib/factions.ts).
  const unlockedFactions: FactionId[] =
    profile?.unlocked_factions && profile.unlocked_factions.length > 0
      ? (profile.unlocked_factions as FactionId[])
      : [STARTER_FACTION];

  const initialFaction =
    (profile?.active_faction as FactionId | null | undefined) ?? STARTER_FACTION;

  const [selectedFactionId, setSelectedFactionId] =
    useState<FactionId>(initialFaction);
  const [selectedCard, setSelectedCard] = useState<CardLibraryEntry | null>(null);

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.fullCenter}>
          <ActivityIndicator color="#d4a04a" />
        </View>
      </SafeAreaView>
    );
  }

  const isSelectedFactionLocked = !unlockedFactions.includes(selectedFactionId);

  const detailFactionMeta = selectedCard
    ? FACTIONS.find((f) => f.id === selectedCard.faction)
    : undefined;
  const detailFactionColor = detailFactionMeta?.color ?? '#888';
  const detailQuantityOwned = selectedCard
    ? inventory.find((i) => i.card_id === selectedCard.card_id)?.quantity_owned ?? 0
    : 0;
  const detailFactionLocked = selectedCard
    ? !unlockedFactions.includes(selectedCard.faction as FactionId)
    : false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Card Library</Text>
        <View style={styles.topBarRightSpacer} />
      </View>

      <LibraryFactionTabs
        selectedFactionId={selectedFactionId}
        unlockedFactions={unlockedFactions}
        onSelect={setSelectedFactionId}
      />

      <LibraryBody
        key={libraryKey}
        selectedFactionId={selectedFactionId}
        isFactionLocked={isSelectedFactionLocked}
        inventory={inventory}
        onTapCard={setSelectedCard}
        onRetry={() => setLibraryKey((k) => k + 1)}
      />

      <CardDetailModal
        card={selectedCard}
        factionColor={detailFactionColor}
        quantityOwned={detailQuantityOwned}
        isFactionLocked={detailFactionLocked}
        onClose={() => setSelectedCard(null)}
      />
    </SafeAreaView>
  );
}

type BodyProps = {
  selectedFactionId: FactionId;
  isFactionLocked: boolean;
  inventory: ReturnType<typeof usePlayerInventory>['inventory'];
  onTapCard: (card: CardLibraryEntry) => void;
  onRetry: () => void;
};

// Inner body so the key prop can remount the useCardLibrary hook on retry.
function LibraryBody({
  selectedFactionId,
  isFactionLocked,
  inventory,
  onTapCard,
  onRetry,
}: BodyProps) {
  const { cards, isLoading, error } = useCardLibrary();

  if (isLoading) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator color="#d4a04a" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.errorTitle}>Could not load card library</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable style={styles.retryCta} onPress={onRetry}>
          <Text style={styles.retryCtaText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.gridWrap}>
      <LibraryCardGrid
        factionId={selectedFactionId}
        allCards={cards}
        inventory={inventory}
        isFactionLocked={isFactionLocked}
        onTapCard={onTapCard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  backButton: { paddingHorizontal: 8, paddingVertical: 4 },
  backText: { color: '#ddd', fontSize: 22, fontWeight: '500' },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBarRightSpacer: { width: 40 },
  gridWrap: { flex: 1 },
  fullCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    color: '#bbb',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryCta: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
  },
  retryCtaText: { color: '#ddd', fontSize: 14, fontWeight: '600' },
});
