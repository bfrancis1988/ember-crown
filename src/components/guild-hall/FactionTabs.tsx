// src/components/guild-hall/FactionTabs.tsx
// Compact horizontal pill bar across unlocked factions for the Guild Hall.
// Tapping a pill switches the active faction so the Commander picker, deck
// strip, and inventory grid re-render for the new faction. Locked factions
// are not shown — the Guild Hall is only for managing decks the player owns.

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { FACTIONS, type FactionId } from '../../lib/factions';

type Props = {
  selectedFactionId: FactionId;
  unlockedFactions: FactionId[];
  onSelect: (factionId: FactionId) => void;
};

export function FactionTabs({
  selectedFactionId,
  unlockedFactions,
  onSelect,
}: Props) {
  const unlockedSet = new Set(unlockedFactions);
  const visible = FACTIONS.filter((f) => unlockedSet.has(f.id));

  // Hide the strip entirely if the player only has one faction unlocked —
  // there's nothing to switch to.
  if (visible.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.row}
    >
      {visible.map((faction) => {
        const isSelected = faction.id === selectedFactionId;
        return (
          <TouchableOpacity
            key={faction.id}
            onPress={() => onSelect(faction.id)}
            style={[
              styles.pill,
              isSelected
                ? {
                    backgroundColor: faction.color,
                    borderColor: faction.color,
                    borderWidth: 2,
                  }
                : { borderColor: faction.color, borderWidth: 1 },
            ]}
          >
            <Text
              style={[
                styles.label,
                isSelected ? styles.labelSelected : styles.labelUnlocked,
              ]}
              numberOfLines={1}
            >
              {faction.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Pin to content height so the horizontal strip doesn't grow vertically and
  // steal space from the inventory grid below (same fix as LibraryFactionTabs).
  strip: { flexGrow: 0, flexShrink: 0 },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '700' },
  labelSelected: { color: '#111' },
  labelUnlocked: { color: '#ddd' },
});
