// src/components/summon/BannerCard.tsx
// Tappable card-shaped tile for one banner. Costs/colors keyed off banner.id.

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Banner, BannerId, CurrencyType } from '../../lib/banners';

type Props = {
  banner: Banner;
  canAfford: boolean;
  onPress: () => void;
  isPulling: boolean;
};

const CURRENCY_GLYPH: Record<CurrencyType, string> = {
  coins: '🪙',
  shards: '💎',
  keys: '🗝️',
  dust: '✨',
};

const BANNER_THEME: Record<BannerId, { background: string; accent: string; titleColor: string }> = {
  common: { background: '#3a2f24', accent: '#7a5a3a', titleColor: '#e6cfa6' },
  rare: { background: '#1a2540', accent: '#4a78c8', titleColor: '#aac6ff' },
  premium: { background: '#2a1a3a', accent: '#a878d8', titleColor: '#e8c878' },
};

export function BannerCard({ banner, canAfford, onPress, isPulling }: Props) {
  const theme = BANNER_THEME[banner.id];
  const disabled = !canAfford || isPulling;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: theme.background, borderColor: theme.accent },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.name, { color: theme.titleColor }]}>{banner.name}</Text>
      <Text style={styles.description}>{banner.description}</Text>

      <View style={styles.costBlock}>
        <Text style={[styles.costText, !canAfford && styles.costTextInsufficient]}>
          {banner.cost} {CURRENCY_GLYPH[banner.currency]} per pull
        </Text>
      </View>

      {isPulling && (
        <View style={styles.pullingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 160,
    width: '100%',
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  description: { color: '#cfcfcf', fontSize: 13, lineHeight: 18 },
  costBlock: { alignSelf: 'flex-start' },
  costText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  costTextInsufficient: { color: '#e87878' },
  pullingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
