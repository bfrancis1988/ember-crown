// src/components/match/LaneRow.tsx
// One horizontal row representing a single lane on one side of the board.
// Used 6 times by the match screen (3 opponent + 3 player).
//
// The parent computes laneTotal, isDebuffed, isCommanderActive, and isTappable
// from the live session — this component is purely presentational.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  // Update 1: true when a Unit is selected in hand and this lane is its
  // optimal_lane on the viewer's side. Adds an additive green glow so
  // the tappable gold border still reads when both are true.
  isOptimalForSelected: boolean;
  onTapLane: () => void;
};

const FALLBACK_FACTION_COLOR = '#555';

// Lane badges with self-managed entry/exit. PulsingDebuffBadge layers a
// continuous pulse on the entrance opacity (Animated.multiply); CommanderBadge
// is fade-only — informational, intentionally calmer than the debuff badge.
// Both stay mounted during exit fade so they don't pop out of existence.
function PulsingDebuffBadge({ visible }: { visible: boolean }) {
  const [shouldRender, setShouldRender] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (shouldRender) {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setShouldRender(false);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!shouldRender) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shouldRender, pulse]);

  if (!shouldRender) return null;

  return (
    <Animated.Text style={[styles.badge, { opacity: Animated.multiply(opacity, pulse) }]}>
      ❄
    </Animated.Text>
  );
}

function CommanderBadge({ visible }: { visible: boolean }) {
  const [shouldRender, setShouldRender] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (shouldRender) {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setShouldRender(false);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!shouldRender) return null;

  return <Animated.Text style={[styles.badge, { opacity }]}>🛡</Animated.Text>;
}

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
  isOptimalForSelected,
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
    // rowOptimal uses shadow only — additive, so it stacks with rowTappable's
    // gold border instead of overriding it.
    isOptimalForSelected && styles.rowOptimal,
  ];

  const Inner = (
    <>
      <View style={styles.labelCol}>
        <Text style={styles.laneLabel}>{lane.toUpperCase()}</Text>
        <Text style={[styles.laneTotal, { color: totalColor }]}>{laneTotal}</Text>
        <View style={styles.badges}>
          <CommanderBadge visible={isCommanderActive} />
          <PulsingDebuffBadge visible={isDebuffed} />
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
  // Subtle green glow that signals "this is the selected card's optimal lane".
  // Shadow-only (no border change) so it coexists with rowTappable's gold
  // border when both are true — and doesn't shift layout when toggled.
  rowOptimal: {
    shadowColor: '#5cd35c',
    shadowOpacity: 0.55,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
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
