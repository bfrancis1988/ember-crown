// app/(app)/onboarding/faction.tsx
// Faction picker. 2x3 grid of all 6 factions. Every tile is tappable and opens
// FactionPreviewModal — locked factions show their roster + unlock hint, only
// unlocked factions surface the "Choose" CTA inside the modal.
//
// TODO: Phase 3 extends isFactionUnlocked() with an inventory check.
// TODO: Phase 7 ties unlock to campaign progress.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FACTIONS, isFactionUnlocked, type FactionMeta } from '../../../src/lib/factions';
import { FactionPreviewModal } from '../../../src/components/FactionPreviewModal';
import { usePlayerProfile } from '../../../src/hooks/usePlayerProfile';

const HORIZONTAL_PADDING = 16;
const GRID_GAP = 12;
const COLUMNS = 2;

export default function FactionPickerScreen() {
  const router = useRouter();
  const { profile, updateProfile } = usePlayerProfile();
  const [previewFaction, setPreviewFaction] = useState<FactionMeta | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const tileWidth =
    (screenWidth - HORIZONTAL_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

  const handleSelect = async () => {
    if (!previewFaction) return;
    const factionToCommit = previewFaction;
    setPreviewFaction(null);
    try {
      await updateProfile({
        active_faction: factionToCommit.id,
        onboarding_step: 2,
      });
      router.replace('/home');
    } catch (err: any) {
      Alert.alert('Could not save faction', err?.message ?? 'Unknown error');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>Choose Your Faction</Text>
        <Text style={styles.subtitle}>
          Tap any banner to view its roster. Locked factions unlock through the campaign.
        </Text>

        <View style={styles.grid}>
          {FACTIONS.map((faction, idx) => {
            const unlocked = isFactionUnlocked(faction.id, profile);
            const isLastInRow = (idx + 1) % COLUMNS === 0;
            return (
              <TouchableOpacity
                key={faction.id}
                style={{
                  width: tileWidth,
                  marginRight: isLastInRow ? 0 : GRID_GAP,
                  marginBottom: GRID_GAP,
                }}
                onPress={() => setPreviewFaction(faction)}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.tile,
                    { backgroundColor: faction.color },
                    !unlocked && styles.tileLocked,
                  ]}
                >
                  <View style={styles.tileBody}>
                    <Text style={styles.tileName} numberOfLines={2}>
                      {faction.name}
                    </Text>
                    <Text style={styles.tileDescription} numberOfLines={2}>
                      {faction.description}
                    </Text>
                  </View>
                  {!unlocked && (
                    <View style={styles.lockOverlay}>
                      <Text style={styles.lockIcon}>🔒</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {previewFaction && (
        <FactionPreviewModal
          faction={previewFaction}
          isUnlocked={isFactionUnlocked(previewFaction.id, profile)}
          visible={previewFaction !== null}
          onClose={() => setPreviewFaction(null)}
          onSelect={
            isFactionUnlocked(previewFaction.id, profile) ? handleSelect : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 64,
    paddingBottom: 32,
  },
  header: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    aspectRatio: 5 / 7,
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tileLocked: {
    opacity: 0.6,
  },
  tileBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tileName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  tileDescription: {
    color: '#eee',
    fontSize: 12,
    lineHeight: 16,
  },
  lockOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 16,
  },
});
