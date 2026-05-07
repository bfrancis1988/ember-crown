// src/components/guild-hall/SavedDecksList.tsx
// Phase 9.4.5B: shows the 3 saved-deck slots for a single faction. Each
// slot is either filled (name, power score, "Use" / "Delete" actions) or
// empty (a tap-to-build CTA that the parent screen wires to the deck
// builder workflow).
//
// Phase 9.4.5-fix-2B: header row hosts the Save Deck button (replaces the
// standalone saveBar). Slot tiles are vertically tighter (minHeight 92->76).

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
  // Phase 9.4.5-fix-2B: Save Deck moved into this header.
  canSave: boolean;
  onSave: () => void;
};

export function SavedDecksList({
  factionId,
  factionColor,
  decks,
  activeDeckId,
  onUseDeck,
  onDeleteDeck,
  onSelectEmptySlot,
  canSave,
  onSave,
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
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Saved Decks</Text>
        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={[
            styles.saveBtn,
            canSave
              ? { backgroundColor: factionColor }
              : { backgroundColor: '#1f1f24' },
          ]}
        >
          <Text
            style={[
              styles.saveBtnText,
              canSave ? { color: '#111' } : { color: '#666' },
            ]}
          >
            Save Deck
          </Text>
        </Pressable>
      </View>
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
    <Pressable
      onPress={onUse}
      disabled={isActive}
      style={[
        styles.slot,
        isActive && { borderColor: accent, borderWidth: 1.5 },
      ]}
    >
      <Text style={styles.slotName} numberOfLines={1}>
        {deck.name}
      </Text>
      <Text style={[styles.slotPower, { color: accent }]}>
        ⚡ {deck.power_score}
      </Text>
      <View
        style={[
          styles.useTag,
          isActive
            ? { backgroundColor: '#1f1f24' }
            : { backgroundColor: accent },
        ]}
      >
        <Text
          style={[
            styles.useTagText,
            isActive ? { color: '#888' } : { color: '#111' },
          ]}
        >
          {isActive ? 'In Use' : 'Tap to Use'}
        </Text>
      </View>
      {canDelete && (
        <Pressable
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.deleteCorner}
        >
          <Text style={styles.deleteText}>✕</Text>
        </Pressable>
      )}
    </Pressable>
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
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: '#161616',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  heading: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  saveBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  saveBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  slot: {
    flex: 1,
    backgroundColor: '#1c1c22',
    borderRadius: 8,
    padding: 6,
    minHeight: 76,
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a30',
    position: 'relative',
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
    fontSize: 12,
    fontWeight: '700',
  },
  slotPower: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  useTag: {
    marginTop: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignItems: 'center',
  },
  useTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  deleteCorner: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(42,31,36,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#c87070',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyHint: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
