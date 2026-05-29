// src/components/library/LibraryCommanderSection.tsx
// "Commanders" section shown above the card grid in the browse-mode Card
// Library. Commanders aren't owned or craftable; tapping one opens the
// read-only CommanderDetailModal.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { CommanderEntry } from '../../types/commander';

type Props = {
  commanders: CommanderEntry[];
  factionColor: string;
  onTapCommander: (commander: CommanderEntry) => void;
};

function CommanderArt({
  imageUrl,
  factionColor,
}: {
  imageUrl?: string;
  factionColor: string;
}) {
  const [error, setError] = useState(false);
  const showImage = !!imageUrl && !error;
  return (
    <View style={[styles.art, { backgroundColor: factionColor }]}>
      {showImage && (
        <ExpoImage
          source={{ uri: imageUrl! }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          onError={() => setError(true)}
        />
      )}
    </View>
  );
}

export function LibraryCommanderSection({
  commanders,
  factionColor,
  onTapCommander,
}: Props) {
  if (commanders.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Commanders</Text>
      <View style={styles.row}>
        {commanders.map((c) => (
          <Pressable
            key={c.commander_id}
            style={styles.tile}
            onPress={() => onTapCommander(c)}
          >
            <CommanderArt imageUrl={c.image_url} factionColor={factionColor} />
            <Text style={styles.name} numberOfLines={1}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingBottom: 4 },
  heading: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tile: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 6,
    alignItems: 'center',
  },
  art: {
    width: '100%',
    height: 56,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  name: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
