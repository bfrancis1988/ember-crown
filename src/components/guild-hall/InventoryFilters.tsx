// src/components/guild-hall/InventoryFilters.tsx
// Pill bar of card-type filters plus a sort selector. Pure presentational —
// state lives on the Guild Hall screen so the InventoryGrid can react to it.

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';

export type InventoryFilter = 'All' | 'Melee' | 'Ranged' | 'Siege' | 'Spell';
export type InventorySort = 'rarity' | 'power' | 'name';

const FILTERS: InventoryFilter[] = ['All', 'Melee', 'Ranged', 'Siege', 'Spell'];
const SORT_LABELS: Record<InventorySort, string> = {
  rarity: 'Rarity',
  power: 'Power',
  name: 'Name',
};

type Props = {
  selectedFilter: InventoryFilter;
  onFilterChange: (filter: InventoryFilter) => void;
  selectedSort: InventorySort;
  onSortChange: (sort: InventorySort) => void;
  accentColor?: string;
};

export function InventoryFilters({
  selectedFilter,
  onFilterChange,
  selectedSort,
  onSortChange,
  accentColor = '#d4a04a',
}: Props) {
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.pillRow}>
        {FILTERS.map((f) => {
          const selected = f === selectedFilter;
          return (
            <Pressable
              key={f}
              onPress={() => onFilterChange(f)}
              style={[
                styles.pill,
                selected && { backgroundColor: accentColor, borderColor: accentColor },
              ]}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.sortButton}
        onPress={() => setSortMenuOpen(true)}
      >
        <Text style={styles.sortLabel}>Sort: </Text>
        <Text style={styles.sortValue}>{SORT_LABELS[selectedSort]}</Text>
        <Text style={styles.sortChevron}>▾</Text>
      </Pressable>

      <Modal
        visible={sortMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSortMenuOpen(false)}
        >
          <View style={styles.menu}>
            {(Object.keys(SORT_LABELS) as InventorySort[]).map((opt) => {
              const selected = opt === selectedSort;
              return (
                <Pressable
                  key={opt}
                  style={styles.menuItem}
                  onPress={() => {
                    onSortChange(opt);
                    setSortMenuOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      selected && { color: accentColor, fontWeight: '700' },
                    ]}
                  >
                    {SORT_LABELS[opt]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#141414',
  },
  pillRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#444',
    marginRight: 6,
    marginVertical: 2,
  },
  pillText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextSelected: {
    color: '#111',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    marginLeft: 6,
  },
  sortLabel: {
    color: '#888',
    fontSize: 11,
  },
  sortValue: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '600',
  },
  sortChevron: {
    color: '#888',
    fontSize: 11,
    marginLeft: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: '#1f1f1f',
    borderRadius: 8,
    minWidth: 180,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    color: '#ddd',
    fontSize: 14,
  },
});
