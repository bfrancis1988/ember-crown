// app/(app)/battle-mode.tsx
// Phase 9.4.5C: Battle Mode entry screen. Player picks a faction (limited
// to Solo-playable factions), the screen surfaces the deck that would
// enter matchmaking (slot 1 of that faction, or active_saved_deck_id if
// it matches), and the "Find Battle" button calls initializeNewMatch
// with mode='battle_mode'.

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../src/lib/firebase';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { usePlayerSavedDecks } from '../../src/hooks/usePlayerSavedDecks';
import { useSoloPlayableFactions } from '../../src/hooks/useSoloPlayableFactions';
import { FACTIONS, type FactionId } from '../../src/lib/factions';
import type { SavedDeck } from '../../src/types/savedDeck';
import type { InitializeNewMatchResult } from '../../src/types/matchActions';

export default function BattleModeScreen() {
  const router = useRouter();
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { decks: savedDecks, isLoading: decksLoading } = usePlayerSavedDecks();
  const playableFactions = useSoloPlayableFactions();
  const [selectedFaction, setSelectedFaction] = useState<FactionId | null>(null);
  const [searching, setSearching] = useState(false);

  // Default selected faction = profile's active faction if it's playable;
  // otherwise the first playable faction.
  React.useEffect(() => {
    if (selectedFaction || playableFactions.length === 0) return;
    const active = profile?.active_faction as FactionId | undefined;
    setSelectedFaction(
      active && playableFactions.includes(active)
        ? active
        : playableFactions[0],
    );
  }, [selectedFaction, playableFactions, profile?.active_faction]);

  const playerDeck: SavedDeck | null = useMemo(() => {
    if (!selectedFaction) return null;
    const factionDecks = savedDecks.filter((d) => d.faction === selectedFaction);
    if (factionDecks.length === 0) return null;
    // Prefer the explicitly active deck if it matches the chosen faction.
    const activeId = profile?.active_saved_deck_id;
    if (activeId) {
      const active = factionDecks.find((d) => d.deck_id === activeId);
      if (active) return active;
    }
    // Else slot 1.
    const slot1 = factionDecks.find((d) => d.slot_number === 1);
    if (slot1) return slot1;
    // Else lowest slot number available.
    return [...factionDecks].sort(
      (a, b) => a.slot_number - b.slot_number,
    )[0];
  }, [selectedFaction, savedDecks, profile?.active_saved_deck_id]);

  const factionMeta = selectedFaction
    ? FACTIONS.find((f) => f.id === selectedFaction)
    : undefined;
  const accent = factionMeta?.color ?? '#d4a04a';

  async function handleFindBattle() {
    if (!playerDeck || searching) return;
    setSearching(true);
    try {
      const fn = httpsCallable<
        { mode: 'battle_mode'; player_deck_id: string },
        InitializeNewMatchResult
      >(functions, 'initializeNewMatch');
      const result = await fn({
        mode: 'battle_mode',
        player_deck_id: playerDeck.deck_id,
      });
      router.replace(`/match/${result.data.match_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not find a battle', msg);
      setSearching(false);
    }
  }

  if (profileLoading || decksLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color="#d4a04a" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Battle Mode</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Battle decks built by other commanders. Wins pay the same as Solo.
        </Text>

        <Text style={styles.sectionLabel}>Faction</Text>
        <View style={styles.factionRow}>
          {playableFactions.map((id) => {
            const meta = FACTIONS.find((f) => f.id === id);
            const selected = id === selectedFaction;
            return (
              <Pressable
                key={id}
                onPress={() => setSelectedFaction(id)}
                style={[
                  styles.factionChip,
                  selected && {
                    borderColor: meta?.color ?? '#888',
                    backgroundColor: '#1f1f24',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.factionChipText,
                    selected && { color: meta?.color ?? '#fff' },
                  ]}
                  numberOfLines={1}
                >
                  {meta?.name ?? id}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {playerDeck ? (
          <View style={[styles.deckCard, { borderLeftColor: accent }]}>
            <Text style={styles.deckLabel}>Your Deck</Text>
            <Text style={styles.deckName}>{playerDeck.name}</Text>
            <Text style={[styles.deckPower, { color: accent }]}>
              ⚡ {playerDeck.power_score}
            </Text>
            <Text style={styles.deckMeta}>
              Slot {playerDeck.slot_number} · 15 cards
            </Text>
          </View>
        ) : (
          <View style={[styles.deckCard, styles.deckCardEmpty]}>
            <Text style={styles.deckLabel}>No saved deck for this faction</Text>
            <Text style={styles.deckHint}>
              Build a deck in Guild Hall first.
            </Text>
          </View>
        )}

        <Pressable
          onPress={handleFindBattle}
          disabled={!playerDeck || searching}
          style={({ pressed }) => [
            styles.findCta,
            {
              backgroundColor: playerDeck ? accent : '#1f1f24',
              opacity: pressed && playerDeck ? 0.85 : 1,
            },
          ]}
        >
          {searching ? (
            <View style={styles.searchingRow}>
              <ActivityIndicator color="#111" />
              <Text style={[styles.findCtaText, { color: '#111' }]}>
                Searching for opponent…
              </Text>
            </View>
          ) : (
            <Text
              style={[
                styles.findCtaText,
                { color: playerDeck ? '#111' : '#666' },
              ]}
            >
              Find Battle
            </Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Opponent identities are anonymized.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  back: { paddingHorizontal: 8, width: 40 },
  backText: { color: '#ddd', fontSize: 22, fontWeight: '500' },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: { padding: 16, paddingBottom: 48 },
  intro: {
    color: '#bbb',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  sectionLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  factionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 18,
  },
  factionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a30',
    backgroundColor: '#181820',
  },
  factionChipText: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '700',
  },
  deckCard: {
    backgroundColor: '#15151a',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderColor: '#222',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
  },
  deckCardEmpty: {
    borderLeftColor: '#444',
    alignItems: 'center',
  },
  deckLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  deckName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  deckPower: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  deckMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  deckHint: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  findCta: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  findCtaText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footnote: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
