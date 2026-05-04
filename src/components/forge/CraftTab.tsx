// src/components/forge/CraftTab.tsx
// Phase 9 Session 2: extracted craft body. Renders the faction tabs + card
// grid + card detail modal in craft mode. Used by both the standalone
// /library?mode=craft route (kept live for backwards compat) and the new
// /forge Craft tab.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { usePlayerProfile } from '../../hooks/usePlayerProfile';
import { usePlayerInventory } from '../../hooks/usePlayerInventory';
import { useCardLibrary } from '../../hooks/useCardLibrary';
import { useWalletAndCanSummon } from '../../hooks/useWalletAndCanSummon';
import { LibraryFactionTabs } from '../library/LibraryFactionTabs';
import { LibraryCardGrid } from '../library/LibraryCardGrid';
import { CardDetailModal } from '../library/CardDetailModal';
import { FACTIONS, STARTER_FACTION, type FactionId } from '../../lib/factions';
import type { CardLibraryEntry } from '../../types/card';

type CraftInput = { card_id: string };
type CraftResult = {
  success: true;
  card_id: string;
  rarity: string;
  dust_spent: number;
  quantity_owned_after: number;
};

type Props = {
  // 'browse' is exported here for parity with the original library screen so
  // /library (no mode param) can also use this component if it ever wants to.
  // /forge Craft tab and /library?mode=craft both pass 'craft'.
  mode?: 'browse' | 'craft';
};

export function CraftTab({ mode = 'craft' }: Props) {
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { inventory } = usePlayerInventory();
  const { wallet } = useWalletAndCanSummon();
  const [libraryKey, setLibraryKey] = useState(0);
  const [isCrafting, setIsCrafting] = useState(false);

  const dustAvailable = wallet?.dust ?? 0;

  const unlockedFactions: FactionId[] =
    profile?.unlocked_factions && profile.unlocked_factions.length > 0
      ? (profile.unlocked_factions as FactionId[])
      : [STARTER_FACTION];

  const initialFaction =
    (profile?.active_faction as FactionId | null | undefined) ?? STARTER_FACTION;

  const [selectedFactionId, setSelectedFactionId] = useState<FactionId>(initialFaction);
  const [selectedCard, setSelectedCard] = useState<CardLibraryEntry | null>(null);

  if (profileLoading) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator color="#d4a04a" />
      </View>
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Craft failed', msg);
    } finally {
      setIsCrafting(false);
    }
  }

  return (
    <>
      <LibraryFactionTabs
        selectedFactionId={selectedFactionId}
        unlockedFactions={unlockedFactions}
        onSelect={setSelectedFactionId}
      />

      <CraftBody
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
    </>
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

function CraftBody({
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
