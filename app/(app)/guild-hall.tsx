// app/(app)/guild-hall.tsx
// Phase 4 deck builder — single screen. Players can manage their active deck
// (15 slots) for their active faction, browse their inventory, and switch
// between the 3 commanders of that faction. All mutations are instant: tap to
// add, tap to remove, tap to set commander. No save button.

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { useSoloPlayableFactions } from '../../src/hooks/useSoloPlayableFactions';
import { usePlayerActiveDeck } from '../../src/hooks/usePlayerActiveDeck';
import {
  useFactionInventory,
  type InventoryCardView,
} from '../../src/hooks/useFactionInventory';
import { CommanderPicker } from '../../src/components/guild-hall/CommanderPicker';
import { DeckStrip } from '../../src/components/guild-hall/DeckStrip';
import { FactionTabs } from '../../src/components/guild-hall/FactionTabs';
import {
  InventoryFilters,
  type InventoryFilter,
  type InventorySort,
} from '../../src/components/guild-hall/InventoryFilters';
import { InventoryGrid } from '../../src/components/guild-hall/InventoryGrid';
import {
  addCardToDeck,
  removeCardFromDeck,
  setActiveCommander,
  setActiveFaction,
} from '../../src/lib/deckBuilder';
import { FACTIONS, STARTER_FACTION, type FactionId } from '../../src/lib/factions';
import type { Rarity } from '../../src/types/card';
import type { DeckSlot } from '../../src/types/deck';

const DECK_SIZE = 15;

const RARITY_RANK: Record<Rarity, number> = {
  Legendary: 5,
  Epic: 4,
  Rare: 3,
  Uncommon: 2,
  Common: 1,
};

export default function GuildHallScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { deck, isLoading: deckLoading } = usePlayerActiveDeck();

  const activeFaction = profile?.active_faction as FactionId | null | undefined;
  const factionId = activeFaction ?? null;

  const { cards, isLoading: invLoading, deckSize } = useFactionInventory(factionId);

  const [filter, setFilter] = useState<InventoryFilter>('All');
  const [sort, setSort] = useState<InventorySort>('rarity');
  const [actionLoading, setActionLoading] = useState(false);

  const factionMeta = factionId ? FACTIONS.find((f) => f.id === factionId) : undefined;
  const accent = factionMeta?.color ?? '#d4a04a';

  // Filtered slots for the strip (active-faction-only). Lazy migration in the
  // inventory hook keeps faction populated even on legacy slots; here we still
  // fall back to Vanguard Kingdoms for the brief window before migration lands.
  const factionSlots = useMemo<DeckSlot[]>(() => {
    if (!factionId) return [];
    return deck
      .map<DeckSlot>((s) => ({
        ...s,
        faction: (s.faction ?? 'Vanguard Kingdoms') as FactionId,
      }))
      .filter((s) => s.faction === factionId);
  }, [deck, factionId]);

  // Defensive: if more than 15 slots somehow exist, warn once.
  const overCapacity = factionSlots.length > DECK_SIZE;
  React.useEffect(() => {
    if (overCapacity) {
      Alert.alert(
        'Deck has too many cards',
        'Extras are inactive. Remove cards to bring the deck back to 15.'
      );
    }
  }, [overCapacity]);

  // Maps required by DeckStrip — built from the inventory view (deck cards are
  // a subset of inventory cards in v1).
  const cardLibraryMap = useMemo(() => {
    const m = new Map<string, InventoryCardView['card']>();
    for (const c of cards) m.set(c.card.card_id, c.card);
    return m;
  }, [cards]);

  const factionColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of FACTIONS) m.set(f.id, f.color);
    return m;
  }, []);

  // Apply filter + sort to inventory cards.
  const visibleCards = useMemo(() => {
    let list = cards;
    if (filter !== 'All') {
      list = list.filter((view) => {
        const c = view.card;
        if (filter === 'Spell') return c.card_type === 'Spell';
        // Melee/Ranged/Siege: units by optimal_lane, plus Curse spells by
        // lane_affinity (cleanses don't carry a lane and stay out of lane filters).
        if (c.card_type === 'Unit') return c.optimal_lane === filter;
        if (c.card_type === 'Spell' && c.klass === 'Curse') {
          return c.lane_affinity === filter;
        }
        return false;
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'rarity': {
          const r = RARITY_RANK[b.card.rarity] - RARITY_RANK[a.card.rarity];
          if (r !== 0) return r;
          return b.card.base_power - a.card.base_power;
        }
        case 'power':
          return b.card.base_power - a.card.base_power;
        case 'name':
          return a.card.card_name.localeCompare(b.card.card_name);
      }
    });
    return sorted;
  }, [cards, filter, sort]);

  const handleAddCard = async (cardId: string) => {
    if (!user || !factionId) return;
    const view = cards.find((c) => c.card.card_id === cardId);
    if (!view) return;
    setActionLoading(true);
    try {
      await addCardToDeck(
        user.uid,
        factionId,
        cardId,
        deckSize,
        view.quantity_owned,
        view.quantity_in_deck
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not add card', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveSlot = async (slotId: string) => {
    if (!user) return;
    setActionLoading(true);
    try {
      await removeCardFromDeck(user.uid, slotId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not remove card', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectCommander = async (commanderId: string) => {
    if (!user) return;
    if (commanderId === profile?.selected_commander) return;
    setActionLoading(true);
    try {
      await setActiveCommander(user.uid, commanderId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not change commander', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectFaction = async (newFactionId: FactionId) => {
    if (!user) return;
    if (newFactionId === factionId) return;
    setActionLoading(true);
    try {
      await setActiveFaction(user.uid, newFactionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not switch faction', msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Phase 9.4.4: Guild Hall is collection management — show every faction the
  // player can play in Solo (campaign-unlocked + threshold-unlocked).
  // Campaign UI still reads unlocked_factions directly.
  const soloPlayableFactions = useSoloPlayableFactions();
  const unlockedFactions: FactionId[] =
    soloPlayableFactions.length > 0 ? soloPlayableFactions : [STARTER_FACTION];

  // Top-level loading / error states.
  if (profileLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.fullCenter}>
          <ActivityIndicator color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!factionId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.fullCenter}>
          <Text style={styles.errorTitle}>No faction selected</Text>
          <Text style={styles.errorBody}>Complete onboarding first.</Text>
          <Pressable style={styles.backCta} onPress={() => router.back()}>
            <Text style={styles.backCtaText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isLoading = deckLoading || invLoading;

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
        <Text style={styles.title}>Guild Hall</Text>
        {/* TODO: Phase 7 polish may move this to a tab bar or main nav. */}
        <View style={styles.topBarRight}>
          {actionLoading && (
            <ActivityIndicator color="#888" size="small" style={{ marginRight: 8 }} />
          )}
          <Pressable
            onPress={() => router.push('/summon')}
            style={[styles.navPill, { borderColor: accent }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.navPillText, { color: accent }]}>✨</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/library?mode=craft')}
            style={[styles.navPill, { borderColor: accent }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.navPillText, { color: accent }]}>⚒</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/library')}
            style={[styles.libraryButton, { borderColor: accent }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.libraryButtonText, { color: accent }]}>
              📖 Library
            </Text>
          </Pressable>
        </View>
      </View>

      <FactionTabs
        selectedFactionId={factionId}
        unlockedFactions={unlockedFactions}
        onSelect={handleSelectFaction}
      />

      {isLoading ? (
        <View style={styles.fullCenter}>
          <ActivityIndicator color={accent} />
        </View>
      ) : (
        <>
          <CommanderPicker
            factionId={factionId}
            selectedCommanderId={profile?.selected_commander ?? null}
            onSelectCommander={handleSelectCommander}
          />

          <DeckStrip
            deckSlots={factionSlots}
            cardLibraryMap={cardLibraryMap}
            factionColorMap={factionColorMap}
            onRemoveSlot={handleRemoveSlot}
          />

          <InventoryFilters
            selectedFilter={filter}
            onFilterChange={setFilter}
            selectedSort={sort}
            onSortChange={setSort}
            accentColor={accent}
          />

          <View style={styles.gridWrap}>
            <InventoryGrid
              cards={visibleCards}
              onAddCard={handleAddCard}
              deckIsFull={deckSize >= DECK_SIZE}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backText: {
    color: '#ddd',
    fontSize: 22,
    fontWeight: '500',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  libraryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  navPill: {
    width: 32,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPillText: { fontSize: 14, fontWeight: '700' },
  libraryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  gridWrap: {
    flex: 1,
  },
  fullCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorBody: {
    color: '#bbb',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  backCta: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
  },
  backCtaText: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600',
  },
});
