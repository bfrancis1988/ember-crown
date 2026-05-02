// src/components/match/LaneRow.tsx
// One horizontal row representing a single lane on one side of the board.
// Used 6 times by the match screen (3 opponent + 3 player).
//
// The parent computes laneTotal, isDebuffed, isCommanderActive, and isTappable
// from the live session — this component is purely presentational.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MatchCard } from './MatchCard';
import type { CardLibraryEntry } from '../../types/card';
import type { LiveBoardState } from '../../types/board';
import type { Side } from '../../types/match';
import type { Lane } from '../../lib/matchConstants';

type Props = {
  lane: Lane;
  owner: Side;
  viewerSide: Side;
  cards: LiveBoardState[];
  cardLibraryMap: Map<string, CardLibraryEntry>;
  factionColorMap: Map<string, string>;
  laneTotal: number;
  isDebuffed: boolean;
  isCommanderActive: boolean;
  isTappable: boolean;
  onTapLane: () => void;
};

const FALLBACK_FACTION_COLOR = '#555';

export function LaneRow({
  lane,
  owner,
  viewerSide,
  cards,
  cardLibraryMap,
  factionColorMap,
  laneTotal,
  isDebuffed,
  isCommanderActive,
  isTappable,
  onTapLane,
}: Props) {
  const isOpponent = owner !== viewerSide;
  const totalColor = isCommanderActive
    ? '#5cd35c'
    : isDebuffed
      ? '#e05a5a'
      : '#f5e7c2';

  const containerStyle = [
    styles.row,
    isOpponent ? styles.rowOpponent : styles.rowPlayer,
    isTappable && styles.rowTappable,
  ];

  const Inner = (
    <>
      <View style={styles.labelCol}>
        <Text style={styles.laneLabel}>{lane.toUpperCase()}</Text>
        <Text style={[styles.laneTotal, { color: totalColor }]}>{laneTotal}</Text>
        <View style={styles.badges}>
          {isCommanderActive ? <Text style={styles.badge}>🛡</Text> : null}
          {isDebuffed ? <Text style={styles.badge}>❄</Text> : null}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsRow}
      >
        {cards.length === 0 ? (
          <Text style={styles.empty}>{isTappable ? 'Drop here' : 'Empty'}</Text>
        ) : (
          cards.map((c) => {
            const entry = cardLibraryMap.get(c.card_id);
            if (!entry) return null;
            const color = factionColorMap.get(entry.faction) ?? FALLBACK_FACTION_COLOR;
            return (
              <View key={c.instance_id} style={styles.cardWrap}>
                <MatchCard card={c} cardLibraryEntry={entry} factionColor={color} />
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );

  if (isTappable) {
    return (
      <Pressable
        onPress={onTapLane}
        style={({ pressed }) => [...containerStyle, pressed && styles.rowPressed]}
      >
        {Inner}
      </Pressable>
    );
  }
  return <View style={containerStyle}>{Inner}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginVertical: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 86,
  },
  rowOpponent: {
    backgroundColor: '#161616',
    borderColor: '#1f1f1f',
  },
  rowPlayer: {
    backgroundColor: '#1c1c1c',
    borderColor: '#262626',
  },
  rowTappable: {
    borderColor: '#f5c84a',
    backgroundColor: '#241d0d',
  },
  rowPressed: {
    opacity: 0.7,
  },
  labelCol: {
    width: 64,
    alignItems: 'flex-start',
  },
  laneLabel: {
    color: '#777',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  laneTotal: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    marginTop: 2,
  },
  badge: {
    fontSize: 12,
    marginRight: 4,
  },
  cardsRow: {
    paddingRight: 8,
    alignItems: 'center',
    gap: 6,
  },
  cardWrap: {
    width: 56,
  },
  empty: {
    color: '#444',
    fontSize: 11,
    fontStyle: 'italic',
    paddingHorizontal: 8,
  },
});
