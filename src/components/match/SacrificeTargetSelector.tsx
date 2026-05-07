// src/components/match/SacrificeTargetSelector.tsx
// Phase 9.4.2B — modal overlay shown after a Ritual unit is dragged onto a
// lane but before the play resolves. Lists all allied lane units (including
// tokens) as tap targets. Tapping one returns its instance_id; tapping
// "Skip" returns null (play without sacrifice); tapping "Cancel" aborts.
//
// `mode` = 'optional_single' is the only mode that surfaces this picker.
// `mode` = 'all_in_lane' (e.g. The Unmade) auto-resolves server-side and
// never opens this modal.

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { CardLibraryEntry } from '../../types/card';
import type { LiveBoardState } from '../../types/board';

type Props = {
  visible: boolean;
  // The Ritual card the player is about to play. Used for the header copy
  // ("Sacrifice for [Card Name]") and excluded from the target list.
  playedCard: { instance_id: string; card_name: string } | null;
  // Allied units currently on the board (the candidates).
  candidates: LiveBoardState[];
  cardLibraryMap: Map<string, CardLibraryEntry>;
  factionColorMap: Map<string, string>;
  onSelect: (sacrificeTargetInstanceId: string | null) => void;
  onCancel: () => void;
};

const FALLBACK_FACTION_COLOR = '#555';

export function SacrificeTargetSelector({
  visible,
  playedCard,
  candidates,
  cardLibraryMap,
  factionColorMap,
  onSelect,
  onCancel,
}: Props) {
  // Filter out the played Ritual card itself (defensive — caller already
  // restricts candidates to allied lane units, and the played card is in hand
  // at the time of the picker, so this is just a sanity check).
  const filtered = playedCard
    ? candidates.filter((c) => c.instance_id !== playedCard.instance_id)
    : candidates;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Sacrifice an allied unit</Text>
          {playedCard ? (
            <Text style={styles.subtitle}>
              for {playedCard.card_name} (+ unit's power)
            </Text>
          ) : null}

          {filtered.length === 0 ? (
            <Text style={styles.emptyHint}>
              No allied units on the board. You can play without sacrificing.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.candidatesRow}
            >
              {filtered.map((c) => {
                const entry = cardLibraryMap.get(c.card_id);
                const name = entry?.card_name ?? c.token_data?.card_name ?? '???';
                const faction =
                  entry?.faction ?? c.token_data?.faction ?? '';
                const color =
                  factionColorMap.get(faction) ?? FALLBACK_FACTION_COLOR;
                const power = c.current_power;
                const showImage =
                  entry &&
                  typeof entry.image_url === 'string' &&
                  entry.image_url.length > 0;
                return (
                  <Pressable
                    key={c.instance_id}
                    style={({ pressed }) => [
                      styles.candidate,
                      { backgroundColor: color },
                      pressed && styles.candidatePressed,
                    ]}
                    onPress={() => onSelect(c.instance_id)}
                  >
                    {showImage ? (
                      <ExpoImage
                        source={{ uri: entry!.image_url }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : null}
                    <View style={styles.candidateOverlay}>
                      <Text style={styles.candidateName} numberOfLines={2}>
                        {name}
                      </Text>
                      <View style={styles.candidatePowerRow}>
                        <Text style={styles.candidatePowerLabel}>+</Text>
                        <Text style={styles.candidatePower}>{power}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.skipButton]}
              onPress={() => onSelect(null)}
            >
              <Text style={styles.skipText}>Skip — play without sacrifice</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  title: {
    color: '#f5e7c2',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#bbb',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  emptyHint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  candidatesRow: {
    paddingVertical: 14,
    gap: 8,
  },
  candidate: {
    width: 80,
    aspectRatio: 5 / 7,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3a2c12',
    overflow: 'hidden',
  },
  candidatePressed: {
    opacity: 0.7,
  },
  candidateOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'space-between',
  },
  candidateName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  candidatePowerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  candidatePowerLabel: {
    color: '#f5c84a',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 1,
  },
  candidatePower: {
    color: '#f5c84a',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  cancelText: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '600',
  },
  skipButton: {
    backgroundColor: '#3a2c12',
    borderWidth: 1,
    borderColor: '#5a4424',
  },
  skipText: {
    color: '#f5c84a',
    fontSize: 13,
    fontWeight: '700',
  },
});
