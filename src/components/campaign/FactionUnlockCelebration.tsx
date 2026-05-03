// src/components/campaign/FactionUnlockCelebration.tsx
// Full-screen celebration overlay for newly-unlocked factions. Rendered by
// MatchCompleteOverlay (or its parent) when recordCampaignWin returns a
// non-empty factions_unlocked array. v1: simple fade-in + per-banner stagger.

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FACTIONS } from '../../lib/factions';

type Props = {
  factionsUnlocked: string[];   // 1 or 2 entries in v1
  onContinue: () => void;
};

const ENTRANCE_FADE_MS = 200;
const BANNER_STAGGER_MS = 200;

export function FactionUnlockCelebration({ factionsUnlocked, onContinue }: Props) {
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const bannerOpacities = useRef(
    factionsUnlocked.map(() => new Animated.Value(0))
  ).current;
  const continueOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: ENTRANCE_FADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: ENTRANCE_FADE_MS,
        delay: ENTRANCE_FADE_MS,
        useNativeDriver: true,
      }),
      ...bannerOpacities.map((val, i) =>
        Animated.timing(val, {
          toValue: 1,
          duration: ENTRANCE_FADE_MS,
          delay: ENTRANCE_FADE_MS * 2 + i * BANNER_STAGGER_MS,
          useNativeDriver: true,
        })
      ),
      Animated.timing(continueOpacity, {
        toValue: 1,
        duration: ENTRANCE_FADE_MS,
        delay:
          ENTRANCE_FADE_MS * 2 +
          bannerOpacities.length * BANNER_STAGGER_MS,
        useNativeDriver: true,
      }),
    ];
    Animated.parallel(animations).start();
  }, [backdropOpacity, headerOpacity, bannerOpacities, continueOpacity]);

  const headerText = factionsUnlocked.length > 1
    ? '⚒ NEW CAMPAIGNS UNLOCKED ⚒'
    : '⚒ NEW CAMPAIGN UNLOCKED ⚒';

  return (
    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
      <View style={styles.content}>
        <Animated.Text style={[styles.header, { opacity: headerOpacity }]}>
          {headerText}
        </Animated.Text>

        {factionsUnlocked.map((factionId, i) => {
          const meta = FACTIONS.find((f) => f.id === factionId);
          const color = meta?.color ?? '#888';
          const name = meta?.name ?? factionId;
          const desc = meta?.long_description ?? '';
          return (
            <React.Fragment key={factionId}>
              {i > 0 ? (
                <Animated.Text
                  style={[styles.andDivider, { opacity: bannerOpacities[i] }]}
                >
                  AND
                </Animated.Text>
              ) : null}
              <Animated.View
                style={[
                  styles.banner,
                  { backgroundColor: color, opacity: bannerOpacities[i] },
                ]}
              >
                <Text style={styles.bannerName}>{name}</Text>
                <Text style={styles.bannerDesc}>{desc}</Text>
              </Animated.View>
            </React.Fragment>
          );
        })}

        <Animated.View style={{ opacity: continueOpacity, width: '100%' }}>
          <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
    paddingHorizontal: 20,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  header: {
    color: '#f5e7c2',
    fontSize: 16,
    letterSpacing: 3,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 24,
    textTransform: 'uppercase',
  },
  banner: {
    width: '100%',
    minHeight: 150,
    borderRadius: 10,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    marginBottom: 6,
  },
  bannerName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bannerDesc: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    opacity: 0.92,
  },
  andDivider: {
    color: '#666',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
    marginVertical: 10,
  },
  continueButton: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    backgroundColor: '#d4a04a',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  continueButtonText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
