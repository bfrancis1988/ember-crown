// app/(app)/library.tsx
// Phase 4.5: Card Library browser. Read-only view of all 88 cards across all
// 6 factions, with locked/owned overlays and a tap-to-detail modal.
// Phase 6: gains a craft mode (?mode=craft) that overlays dust cost on every
// card and routes the detail modal's CTA through the craftCard Cloud Function.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../src/lib/firebase';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { usePlayerInventory } from '../../src/hooks/usePlayerInventory';
import { useCardLibrary } from '../../src/hooks/useCardLibrary';
import { useWalletAndCanSummon } from '../../src/hooks/useWalletAndCanSummon';
import { LibraryFactionTabs } from '../../src/components/library/LibraryFactionTabs';
import { LibraryCardGrid } from '../../src/components/library/LibraryCardGrid';
import { CardDetailModal } from '../../src/components/library/CardDetailModal';
import { FACTIONS, STARTER_FACTION, type FactionId } from '../../src/lib/factions';
import type { CardLibraryEntry } from '../../src/types/card';

type CraftInput = { card_id: string };
type CraftResult = {
  success: true;
  card_id: string;
  rarity: string;
  dust_spent: number;
  quantity_owned_after: number;
};

export default function CardLibraryScreen() {
  const router = useRouter();
  const { mode: rawMode } = useLocalSearchParams<{ mode?: string }>();
  const mode: 'browse' | 'craft' = rawMode === 'craft' ? 'craft' : 'browse';
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { inventory } = usePlayerInventory();
  const { wallet } = useWalletAndCanSummon();
  const [libraryKey, setLibraryKey] = useState(0);
  const [isCrafting, setIsCrafting] = useState(false);

  const dustAvailable = wallet?.dust ?? 0;

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

  async function handleCraft() {
    if (!selectedCard || isCrafting) return;
    setIsCrafting(true);
    try {
      const fn = httpsCallable<CraftInput, CraftResult>(functions, 'craftCard');
      await fn({ card_id: selectedCard.card_id });
      // The wallet/inventory live subscriptions update on their own; the
      // modal stays open with refreshed counts so the player can see the
      // result. Button will grey out automatically when atMax.
    } catch (err: any) {
      Alert.alert('Craft failed', err?.message ?? 'Unknown error');
    } finally {
      setIsCrafting(false);
    }
  }

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
        <Text style={styles.title}>{mode === 'craft' ? 'Craft' : 'Card Library'}</Text>
        {mode === 'craft' ? (
          <View style={styles.dustPill}>
            <Text style={styles.dustPillText}>✨ {dustAvailable}</Text>
          </View>
        ) : (
          <View style={styles.topBarRightSpacer} />
        )}
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
        mode={mode}
        dustAvailable={dustAvailable}
      />

      <CardDetailModal
        card={selectedCard}
        factionColor={detailFactionColor}
        quantityOwned={detailQuantityOwned}
        isFactionLocked={detailFactionLocked}
        onClose={() => setSelectedCard(null)}
        mode={mode}
        dustAvailable={dustAvailable}
        onCraft={handleCraft}
        isCrafting={isCrafting}
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
  mode: 'browse' | 'craft';
  dustAvailable: number;
};

// Inner body so the key prop can remount the useCardLibrary hook on retry.
function LibraryBody({
  selectedFactionId,
  isFactionLocked,
  inventory,
  onTapCard,
  onRetry,
  mode,
  dustAvailable,
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
        mode={mode}
        dustAvailable={dustAvailable}
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
  dustPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#d4a04a',
  },
  dustPillText: { color: '#d4a04a', fontSize: 13, fontWeight: '700' },
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
