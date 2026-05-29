// src/components/library/CommanderDetailModal.tsx
// Read-only full-screen modal showing one commander's details (art, faction,
// lane, passive + active abilities). Commanders aren't owned or craftable, so
// there are no ownership / craft / disenchant controls. Reused by the Card
// Library (browse mode) and the Guild Hall.

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CommanderEntry } from '../../types/commander';

type Props = {
  commander: CommanderEntry | null;
  factionColor: string;
  onClose: () => void;
};

const HORIZONTAL_PADDING = 16;

export function CommanderDetailModal({ commander, factionColor, onClose }: Props) {
  const visible = commander !== null;
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = screenWidth * 0.7;

  const [imageError, setImageError] = useState(false);
  // Reset the error flag whenever the modal swaps to a different commander.
  useEffect(() => {
    setImageError(false);
  }, [commander?.commander_id]);

  const showImage =
    !!commander &&
    typeof commander.image_url === 'string' &&
    commander.image_url.length > 0 &&
    !imageError;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {commander && (
          <>
            <View style={styles.topBar}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.cardWrap}>
                <View
                  style={[
                    styles.cardVisual,
                    {
                      width: cardWidth,
                      borderColor: factionColor,
                      backgroundColor: factionColor,
                    },
                  ]}
                >
                  {showImage && (
                    <ExpoImage
                      source={{ uri: commander.image_url }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={200}
                      onError={() => setImageError(true)}
                    />
                  )}
                  <View style={styles.nameWrap}>
                    <Text style={styles.cardName} numberOfLines={2}>
                      {commander.name}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.metadata}>
                <View style={styles.nameRow}>
                  <Text style={[styles.factionLine, { color: factionColor }]}>
                    {commander.faction}
                  </Text>
                  <View style={[styles.laneBadge, { borderColor: factionColor }]}>
                    <Text style={[styles.laneBadgeText, { color: factionColor }]}>
                      {commander.lane}
                    </Text>
                  </View>
                </View>

                <View style={styles.abilityBlock}>
                  <Text style={styles.abilityLabel}>Passive</Text>
                  <Text style={styles.abilityText}>{commander.passive.description}</Text>
                </View>

                <View style={styles.abilityBlock}>
                  <Text style={styles.abilityLabel}>Active</Text>
                  <Text style={styles.abilityText}>{commander.active.description}</Text>
                </View>
              </View>
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 8,
  },
  closeButton: { padding: 4 },
  closeText: { color: '#ccc', fontSize: 24, fontWeight: '500' },
  scrollContent: { paddingBottom: 32 },
  cardWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 24 },
  cardVisual: {
    aspectRatio: 5 / 7,
    borderRadius: 10,
    borderWidth: 3,
    overflow: 'hidden',
  },
  nameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cardName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metadata: { paddingHorizontal: HORIZONTAL_PADDING },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  factionLine: { fontSize: 18, fontWeight: '700' },
  laneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  laneBadgeText: { fontSize: 13, fontWeight: '700' },
  abilityBlock: {
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  abilityLabel: {
    color: '#d4a04a',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  abilityText: { color: '#ddd', fontSize: 15, lineHeight: 22 },
});
