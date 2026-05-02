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
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
  },
  label: { fontSize: 13, fontWeight: '600' },
  labelSelected: { color: '#111' },
  labelUnlocked: { color: '#ddd' },
  labelLocked: { color: '#888' },
});
