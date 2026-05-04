// src/components/library/LibraryFactionTabs.tsx
// Phase 4.5: horizontal pill bar across the 6 factions. Locked factions are
// still tappable — the screen handles the locked card display.

import React from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import { FACTIONS, type FactionId } from '../../lib/factions';

type Props = {
  selectedFactionId: FactionId;
  unlockedFactions: FactionId[];
  onSelect: (factionId: FactionId) => void;
};

export function LibraryFactionTabs({
  selectedFactionId,
  unlockedFactions,
  onSelect,
}: Props) {
  const unlockedSet = new Set(unlockedFactions);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.row}
    >
      {FACTIONS.map((faction) => {
        const isSelected = faction.id === selectedFactionId;
        const isUnlocked = unlockedSet.has(faction.id);
        const label = isUnlocked ? faction.name : `🔒 ${faction.name}`;

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
                isSelected
                  ? styles.labelSelected
                  : isUnlocked
                  ? styles.labelUnlocked
                  : styles.labelLocked,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
      <View style={{ width: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ScrollView defaults to flexGrow:1 / flexShrink:1, which makes a horizontal
  // strip in a column flex parent grow vertically and steal space from the
  // sibling card grid. Pin it to its content height.
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
  labelLocked: { color: '#888' },
});
