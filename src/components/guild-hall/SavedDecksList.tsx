// src/components/guild-hall/SavedDecksList.tsx
// Phase 9.4.5B: shows the 3 saved-deck slots for a single faction. Each
// slot is either filled (name, power score, "Use" / "Delete" actions) or
// empty (a tap-to-build CTA that the parent screen wires to the deck
// builder workflow).
//
// The actual editing of cards still happens in the existing Guild Hall
// strip + inventory; this list is a navigation/selection surface, not an
// editor.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SavedDeck, SavedDeckSlotNumber } from '../../types/savedDeck';

const SLOTS: SavedDeckSlotNumber[] = [1, 2, 3];

type Props = {
  factionId: string;
  factionColor: string;
  decks: SavedDeck[];
  activeDeckId: string | null;
  onUseDeck: (deck: SavedDeck) => void;
  onDeleteDeck: (deck: SavedDeck) => void;
  onSelectEmptySlot: (slotNumber: SavedDeckSlotNumber) => void;
};

export function SavedDecksList({
  factionId,
  factionColor,
  decks,
  activeDeckId,
  onUseDeck,
  onDeleteDeck,
  onSelectEmptySlot,
}: Props) {
  const factionDecks = decks.filter((d) => d.faction === factionId);
  const bySlot = new Map<SavedDeckSlotNumber, SavedDeck>();
  for (const d of factionDecks) {
    if (d.slot_number === 1 || d.slot_number === 2 || d.slot_number === 3) {
      bySlot.set(d.slot_number, d);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Saved Decks</Text>
      <View style={styles.row}>
        {SLOTS.map((slot) => {
          const deck = bySlot.get(slot);
          if (deck) {
            const isActive = deck.deck_id === activeDeckId;
            return (
              <FilledSlot
                key={slot}
                deck={deck}
                isActive={isActive}
                accent={factionColor}
                canDelete={slot !== 1}
                onUse={() => onUseDeck(deck)}
                onDelete={() => onDeleteDeck(deck)}
              />
            );
          }
          return (
            <EmptySlot
              key={slot}
              slotNumber={slot}
              accent={factionColor}
              onPress={() => onSelectEmptySlot(slot)}
            />
          );
        })}
      </View>
    </View>
  );
}

function FilledSlot({
  deck,
  isActive,
  accent,
  canDelete,
  onUse,
  onDelete,
}: {
  deck: SavedDeck;
  isActive: boolean;
  accent: string;
  canDelete: boolean;
  onUse: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.slot, isActive && { borderColor: accent, borderWidth: 1.5 }]}>
      <Text style={styles.slotIndex}>Slot {deck.slot_number}</Text>
      <Text style={styles.slotName} numberOfLines={1}>
        {deck.name}
      </Text>
      <Text style={[styles.slotPower, { color: accent }]}>
        ⚡ {deck.power_score}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onUse}
          style={[
            styles.actionBtn,
            isActive
              ? { backgroundColor: '#1f1f24' }
              : { backgroundColor: accent },
          ]}
          disabled={isActive}
        >
          <Text
            style={[
              styles.actionText,
              isActive ? { color: '#888' } : { color: '#111' },
            ]}
          >
            {isActive ? 'In Use' : 'Use'}
          </Text>
        </Pressable>
        {canDelete && (
          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function EmptySlot({
  slotNumber,
  accent,
  onPress,
}: {
  slotNumber: SavedDeckSlotNumber;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.slot,
        styles.slotEmpty,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.slotIndex}>Slot {slotNumber}</Text>
      <Text style={[styles.emptyHint, { color: accent }]}>+ Build a Deck</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: '#161616',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  heading: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  slot: {
    flex: 1,
    backgroundColor: '#1c1c22',
    borderRadius: 8,
    padding: 8,
    minHeight: 92,
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a30',
  },
  slotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  slotIndex: {
    color: '#666',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  slotName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  slotPower: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 5,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  deleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2a1f24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#c87070',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyHint: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
