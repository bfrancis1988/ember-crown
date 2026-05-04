// src/components/summon/SummonResultModal.tsx
// Full-screen modal that animates the reveal of one summon pull.
// Wrapped → tap-to-reveal (or auto-advance after 800ms) → card + outcome line.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CardLibraryEntry } from '../../types/card';
import type { Rarity } from '../../lib/banners';

export type SummonResult = {
  success: true;
  card_id: string;
  rarity: Rarity;
  converted_to_dust: boolean;
  dust_gained?: number;
  quantity_owned_after: number;
  wallet_after: { coins: number; shards: number; keys: number; dust: number };
};

type Props = {
  result: SummonResult | null;
  cardLibraryEntry: CardLibraryEntry | null;
  onClose: () => void;
  onPullAgain: () => void;
  canPullAgain: boolean;
};

const RARITY_GLOW: Record<Rarity, string> = {
  Common: '#888888',
  Uncommon: '#4caf50',
  Rare: '#3a7bd5',
  Epic: '#a64ac9',
  Legendary: '#d4a04a',
};

const FACTION_COLORS: Record<string, string> = {
  'Vanguard Kingdoms': '#2c4a7c',
  'Ashen Hordes': '#7c2c2c',
  'Verdant Wilds': '#2c7c4a',
  'Sunward Order': '#c8a04a',
  'Voidborn Cult': '#5a2c7c',
  'Storm Reavers': '#2c7c7c',
};

export function SummonResultModal({
  result,
  cardLibraryEntry,
  onClose,
  onPullAgain,
  canPullAgain,
}: Props) {
  const visible = result !== null;
  const [revealed, setRevealed] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const revealScale = useRef(new Animated.Value(0.5)).current;
  const revealOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setRevealed(false);
      fadeAnim.setValue(0);
      revealScale.setValue(0.5);
      revealOpacity.setValue(0);
      glowAnim.setValue(0);
      return;
    }

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      triggerReveal();
    }, 800);

    return () => clearTimeout(timer);
  }, [visible]);

  const triggerReveal = () => {
    if (revealed) return;
    setRevealed(true);
    Animated.parallel([
      Animated.timing(revealScale, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(revealOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  if (!result) return null;

  const glowColor = RARITY_GLOW[result.rarity];
  const factionColor = cardLibraryEntry
    ? (FACTION_COLORS[cardLibraryEntry.faction] ?? '#444')
    : '#444';

  const cardName = cardLibraryEntry?.card_name ?? result.card_id;
  const basePower = cardLibraryEntry?.base_power ?? '?';
  const imageUrl = cardLibraryEntry?.image_url ?? '';
  const hasImage = imageUrl.length > 0;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
      transparent
    >
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <Pressable style={styles.touchArea} onPress={triggerReveal}>
            <View style={styles.center}>
              {!revealed ? (
                <View style={styles.wrappedCard}>
                  <Text style={styles.wrappedGlyph}>?</Text>
                  <Text style={styles.tapHint}>Tap to reveal</Text>
                </View>
              ) : (
                <>
                  <Animated.View
                    style={[
                      styles.glow,
                      {
                        backgroundColor: glowColor,
                        opacity: glowAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.25, 0.65],
                        }),
                        transform: [
                          {
                            scale: glowAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.95, 1.1],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.cardVisual,
                      {
                        backgroundColor: factionColor,
                        borderColor: glowColor,
                        opacity: revealOpacity,
                        transform: [{ scale: revealScale }],
                      },
                    ]}
                  >
                    {hasImage && (
                      <ExpoImage
                        source={{ uri: imageUrl }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={200}
                      />
                    )}
                    <View
                      style={[
                        styles.rarityBadge,
                        { backgroundColor: glowColor },
                      ]}
                    >
                      <Text style={styles.rarityBadgeText}>
                        {result.rarity[0]}
                      </Text>
                    </View>
                    <View style={styles.nameWrap}>
                      <Text style={styles.cardName} numberOfLines={2}>
                        {cardName}
                      </Text>
                    </View>
                    <View style={styles.powerWrap}>
                      <Text style={styles.powerText}>{basePower}</Text>
                    </View>
                  </Animated.View>

                  <Text style={[styles.rarityLine, { color: glowColor }]}>
                    {result.rarity}
                  </Text>

                  <View style={styles.outcomeBlock}>
                    {result.converted_to_dust ? (
                      <Text style={styles.outcomeDust}>
                        Duplicate — converted to ✨ {result.dust_gained} dust
                      </Text>
                    ) : (
                      <Text style={styles.outcomeNew}>
                        You got {cardName}! (×{result.quantity_owned_after} owned)
                      </Text>
                    )}
                  </View>
                </>
              )}
            </View>
          </Pressable>

          <View style={styles.actions}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
            <Pressable
              style={[
                styles.pullAgainButton,
                !canPullAgain && styles.pullAgainDisabled,
              ]}
              onPress={canPullAgain ? onPullAgain : undefined}
              disabled={!canPullAgain}
            >
              <Text style={styles.pullAgainText}>Pull Again</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  safe: { flex: 1 },
  touchArea: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  wrappedCard: {
    width: 200,
    aspectRatio: 5 / 7,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#666',
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wrappedGlyph: { color: '#888', fontSize: 96, fontWeight: '800' },
  tapHint: {
    position: 'absolute',
    bottom: -32,
    color: '#888',
    fontSize: 14,
  },
  glow: {
    position: 'absolute',
    width: 280,
    aspectRatio: 5 / 7,
    borderRadius: 30,
    top: '50%',
    marginTop: -196,
  },
  cardVisual: {
    width: 240,
    aspectRatio: 5 / 7,
    borderRadius: 14,
    borderWidth: 3,
    overflow: 'hidden',
  },
  rarityBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rarityBadgeText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  nameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 14,
    paddingHorizontal: 50,
    alignItems: 'center',
  },
  cardName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  powerWrap: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  powerText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  rarityLine: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 18,
    textTransform: 'uppercase',
  },
  outcomeBlock: { marginTop: 12, paddingHorizontal: 24 },
  outcomeNew: { color: '#fff', fontSize: 16, textAlign: 'center' },
  outcomeDust: { color: '#e6cfa6', fontSize: 16, textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  closeButton: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: { color: '#ddd', fontSize: 15, fontWeight: '600' },
  pullAgainButton: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#d4a04a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pullAgainDisabled: { opacity: 0.4 },
  pullAgainText: { color: '#111', fontSize: 15, fontWeight: '700' },
});
