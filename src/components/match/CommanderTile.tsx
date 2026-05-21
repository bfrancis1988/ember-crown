// src/components/match/CommanderTile.tsx
// Compact horizontal commander indicator. Rendered twice: opponent (top of
// board, no onActivate) and viewer (bottom of board, onActivate when unused).
//
// We accept the resolved CommanderEntry from the parent rather than fetching
// inside, since the screen already loads commander_library once on mount.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useMatchOverlay } from './overlay/MatchOverlay';
import type { CommanderEntry } from '../../types/commander';
import type { Side } from '../../types/match';
import type { Lane } from '../../lib/matchConstants';

type Props = {
  commanderId: string;
  commander: CommanderEntry | null;
  factionColor: string;
  usedFlag: boolean;
  activeLane: Lane | null;
  viewerSide: Side;
  thisSide: Side;
  handCount: number;
  hasPassed: boolean;
  onActivate?: () => void;
};

export function CommanderTile({
  commanderId,
  commander,
  factionColor,
  usedFlag,
  activeLane,
  viewerSide,
  thisSide,
  handCount,
  hasPassed,
  onActivate,
}: Props) {
  const isMe = thisSide === viewerSide;
  const canActivate = isMe && !usedFlag && onActivate !== undefined;

  // Release 1.1.0: register this tile so the opponent's hand-to-lane ghost
  // has an approximate source position to fly from.
  const { registerNode } = useMatchOverlay();
  const tileKey = `commander:${thisSide}`;

  const [imageError, setImageError] = useState(false);
  const showImage =
    !!commander?.image_url && commander.image_url.length > 0 && !imageError;

  const containerStyle = [
    styles.tile,
    activeLane ? styles.tileActive : null,
    usedFlag ? styles.tileUsed : null,
    canActivate ? styles.tileActivatable : null,
  ];

  const Inner = (
    <>
      <View style={[styles.art, { backgroundColor: factionColor }]}>
        {showImage ? (
          <ExpoImage
            source={{ uri: commander!.image_url! }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            onError={() => setImageError(true)}
          />
        ) : (
          <Text style={styles.artGlyph}>♛</Text>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {commander?.name ?? commanderId}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {commander?.lane ?? '—'}
          {activeLane ? ` · ACTIVE @ ${activeLane.toUpperCase()}` : ''}
        </Text>
        {canActivate ? (
          <Text style={styles.activateHint}>Tap to activate</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.handCount}>Hand: {handCount}</Text>
        {usedFlag ? <Text style={styles.usedBadge}>USED</Text> : null}
        {hasPassed ? <Text style={styles.passedBadge}>PASSED</Text> : null}
      </View>
    </>
  );

  if (canActivate) {
    return (
      <Pressable
        ref={(node) => registerNode(tileKey, node)}
        onPress={onActivate}
        style={({ pressed }) => [...containerStyle, pressed && styles.tilePressed]}
      >
        {Inner}
      </Pressable>
    );
  }
  return (
    <View ref={(node) => registerNode(tileKey, node)} style={containerStyle}>
      {Inner}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 8,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#1a1a1a',
    minHeight: 64,
  },
  tileActive: {
    borderColor: '#5cd35c',
    shadowColor: '#5cd35c',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  tileUsed: {
    opacity: 0.45,
  },
  tileActivatable: {
    borderColor: '#d4a04a',
  },
  tilePressed: {
    opacity: 0.7,
  },
  art: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artGlyph: {
    color: '#f5e7c2',
    fontSize: 22,
    opacity: 0.85,
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  activateHint: {
    color: '#d4a04a',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 1,
  },
  right: {
    alignItems: 'flex-end',
  },
  handCount: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
  },
  usedBadge: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 1,
  },
  passedBadge: {
    color: '#a85050',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 1,
  },
});
