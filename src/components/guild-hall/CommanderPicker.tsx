// src/components/guild-hall/CommanderPicker.tsx
// Compact horizontal selector for the 3 commanders of the active faction.
// Highlights the currently selected commander; tapping any other tile fires
// onSelectCommander to update the active commander on the player profile.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FACTIONS, type FactionId } from '../../lib/factions';
import type { CommanderEntry } from '../../types/commander';

type Props = {
  factionId: FactionId;
  selectedCommanderId: string | null;
  onSelectCommander: (commanderId: string) => void;
};

function CommanderArtSquare({
  imageUrl,
  factionColor,
}: {
  imageUrl: string | undefined;
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

export function CommanderPicker({
  factionId,
  selectedCommanderId,
  onSelectCommander,
}: Props) {
  const [commanders, setCommanders] = useState<CommanderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const factionColor = FACTIONS.find((f) => f.id === factionId)?.color ?? '#888';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const q = query(
          collection(db, 'commander_library'),
          where('faction', '==', factionId)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        setCommanders(snap.docs.map((d) => d.data() as CommanderEntry));
      } catch (err) {
        console.warn('CommanderPicker: fetch failed', err);
        if (!cancelled) setCommanders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [factionId]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Commander</Text>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#666" size="small" />
        </View>
      ) : (
        <View style={styles.row}>
          {commanders.map((c) => {
            const selected = c.commander_id === selectedCommanderId;
            return (
              <Pressable
                key={c.commander_id}
                onPress={() => onSelectCommander(c.commander_id)}
                style={[
                  styles.tile,
                  selected && {
                    borderColor: '#4caf50',
                    borderWidth: 2,
                  },
                  !selected && styles.dim,
                ]}
              >
                <CommanderArtSquare
                  imageUrl={c.image_url}
                  factionColor={factionColor}
                />
                <Text style={styles.name} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.lane} numberOfLines={1}>
                  {c.lane}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  header: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  loading: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 8,
    alignItems: 'center',
  },
  dim: {
    opacity: 0.7,
  },
  art: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  name: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  lane: {
    color: '#888',
    fontSize: 9,
    marginTop: 2,
  },
});
