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
import { usePlayerSavedDecks } from '../../src/hooks/usePlayerSavedDecks';
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
import { SavedDecksList } from '../../src/components/guild-hall/SavedDecksList';
import { SaveDeckModal } from '../../src/components/guild-hall/SaveDeckModal';
import {
  addCardToDeck,
  removeCardFromDeck,
  setActiveCommander,
  setActiveFaction,
} from '../../src/lib/deckBuilder';
import { computeDeckPower } from '../../src/lib/computeDeckPower';
import {
  callDeleteSavedDeck,
  callSaveDeck,
  callSetActiveSavedDeck,
  syncActiveDeckBuffer,
} from '../../src/lib/savedDeckHelpers';
import { FACTIONS, STARTER_FACTION, type FactionId } from '../../src/lib/factions';
import type { Rarity } from '../../src/types/card';
import type { DeckSlot } from '../../src/types/deck';
import type { SavedDeck, SavedDeckSlotNumber } from '../../src/types/savedDeck';

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

  // Phase 9.4.5B saved decks state.
  const { decks: savedDecks } = usePlayerSavedDecks();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  // When the player taps an empty slot in SavedDecksList, remember which
  // slot they chose so the modal opens with that slot pre-selected.
  const [requestedSlot, setRequestedSlot] = useState<SavedDeckSlotNumber | null>(null);
  // When editing an existing deck, remember which deck so saving
  // becomes an update rather than a fresh create.
  const [editingDeck, setEditingDeck] = useState<SavedDeck | null>(null);

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

  // ─── Saved decks (Phase 9.4.5B) ──────────────────────────────────────

  // Live-computed power score for the current draft. Mirrors the server
  // formula from saveDeck — useful while the player is mid-edit.
  const draftPowerScore = useMemo(() => {
    if (!factionId) return null;
    const idsForFaction = factionSlots.map((s) => s.card_id);
    const libraryRecord: Record<string, { rarity: Rarity }> = {};
    for (const [id, card] of cardLibraryMap) {
      libraryRecord[id] = { rarity: card.rarity };
    }
    // commander base_power isn't in the v1 commander_library shape; default
    // to 0 to match the server. Will start contributing if/when commanders
    // gain a base_power field.
    return computeDeckPower(idsForFaction, libraryRecord, { base_power: 0 });
  }, [factionId, factionSlots, cardLibraryMap]);

  // Existing names, for the slot picker preview in SaveDeckModal.
  const existingNamesBySlot = useMemo(() => {
    const map: Record<SavedDeckSlotNumber, string | null> = { 1: null, 2: null, 3: null };
    if (!factionId) return map;
    for (const d of savedDecks) {
      if (d.faction !== factionId) continue;
      const s = d.slot_number;
      if (s === 1 || s === 2 || s === 3) map[s] = d.name;
    }
    return map;
  }, [savedDecks, factionId]);

  // Pre-fill the modal when "Update Deck" is tapped on a filled slot.
  const initialSlot: SavedDeckSlotNumber | undefined = editingDeck
    ? editingDeck.slot_number
    : (requestedSlot ?? undefined);
  const initialName = editingDeck?.name;

  const handleOpenSave = () => {
    if (!factionId) return;
    if (factionSlots.length !== DECK_SIZE) {
      Alert.alert(
        'Deck not ready',
        `Save requires exactly ${DECK_SIZE} cards (currently ${factionSlots.length}).`,
      );
      return;
    }
    setEditingDeck(null);
    setRequestedSlot(null);
    setSaveModalVisible(true);
  };

  const handleConfirmSave = async (slot: SavedDeckSlotNumber, name: string) => {
    if (!factionId || !profile?.selected_commander) {
      Alert.alert('Cannot save', 'Pick a commander first.');
      return;
    }
    if (factionSlots.length !== DECK_SIZE) {
      Alert.alert(
        'Deck not ready',
        `Save requires exactly ${DECK_SIZE} cards (currently ${factionSlots.length}).`,
      );
      return;
    }
    setSaveBusy(true);
    try {
      // If the chosen slot is already occupied AND we're not in update
      // mode, treat the save as an update of that existing deck so we
      // don't violate any future per-slot uniqueness invariant.
      const existingForSlot = savedDecks.find(
        (d) => d.faction === factionId && d.slot_number === slot,
      );
      const result = await callSaveDeck({
        deck_id: editingDeck?.deck_id ?? existingForSlot?.deck_id ?? null,
        slot_number: slot,
        name,
        faction: factionId,
        commander_id: profile.selected_commander,
        card_ids: factionSlots.map((s) => s.card_id),
      });
      // After saving, also point active_saved_deck_id at this deck so the
      // player's "currently selected" deck is the one they just saved.
      try {
        await callSetActiveSavedDeck(result.deck_id);
      } catch (err) {
        console.warn('setActiveSavedDeck after save failed', err);
      }
      setSaveModalVisible(false);
      setEditingDeck(null);
      setRequestedSlot(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not save deck', msg);
    } finally {
      setSaveBusy(false);
    }
  };

  const handleUseDeck = async (deck: SavedDeck) => {
    if (!user) return;
    setActionLoading(true);
    try {
      // Set as active first so an interrupted sync doesn't leave the
      // player pointing at the old deck.
      await callSetActiveSavedDeck(deck.deck_id);
      await syncActiveDeckBuffer(user.uid, deck.faction, deck.card_ids);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not switch deck', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDeck = async (deck: SavedDeck) => {
    if (deck.slot_number === 1) {
      Alert.alert(
        'Cannot delete slot 1',
        'Slot 1 is your default deck for this faction. Overwrite it with a new build instead.',
      );
      return;
    }
    setActionLoading(true);
    try {
      await callDeleteSavedDeck(deck.deck_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not delete deck', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectEmptySlot = (slot: SavedDeckSlotNumber) => {
    setEditingDeck(null);
    setRequestedSlot(slot);
    setSaveModalVisible(true);
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

          <SavedDecksList
            factionId={factionId}
            factionColor={accent}
            decks={savedDecks}
            activeDeckId={profile?.active_saved_deck_id ?? null}
            onUseDeck={handleUseDeck}
            onDeleteDeck={handleDeleteDeck}
            onSelectEmptySlot={handleSelectEmptySlot}
          />

          <DeckStrip
            deckSlots={factionSlots}
            cardLibraryMap={cardLibraryMap}
            factionColorMap={factionColorMap}
            onRemoveSlot={handleRemoveSlot}
            powerScore={draftPowerScore}
            accentColor={accent}
          />

          <View style={styles.saveBar}>
            <Pressable
              onPress={handleOpenSave}
              disabled={factionSlots.length !== DECK_SIZE}
              style={[
                styles.saveBtn,
                factionSlots.length === DECK_SIZE
                  ? { backgroundColor: accent }
                  : { backgroundColor: '#1f1f24' },
              ]}
            >
              <Text
                style={[
                  styles.saveBtnText,
                  factionSlots.length === DECK_SIZE
                    ? { color: '#111' }
                    : { color: '#666' },
                ]}
              >
                Save Deck
              </Text>
            </Pressable>
          </View>

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

          <SaveDeckModal
            visible={saveModalVisible}
            factionName={factionMeta?.name ?? factionId}
            factionColor={accent}
            existingNamesBySlot={existingNamesBySlot}
            initialSlot={initialSlot}
            initialName={initialName}
            isUpdating={!!editingDeck}
            busy={saveBusy}
            onCancel={() => {
              if (saveBusy) return;
              setSaveModalVisible(false);
              setEditingDeck(null);
              setRequestedSlot(null);
            }}
            onConfirm={handleConfirmSave}
          />
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
  saveBar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#161616',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  saveBtn: {
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
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
