// app/(app)/summon.tsx
// Phase 6: banner-summon screen. Phase 9 Session 2: now a thin wrapper
// around the shared SummonTab component (also used by /forge). The route
// stays live for backwards compat — same UX, deprecation deferred.

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletAndCanSummon } from '../../src/hooks/useWalletAndCanSummon';
import { SummonTab } from '../../src/components/forge/SummonTab';

export default function SummonScreen() {
  const router = useRouter();
  const { wallet, isLoading } = useWalletAndCanSummon();

  if (isLoading || !wallet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.fullCenter}>
          <ActivityIndicator color="#d4a04a" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Summon</Text>
        <View style={styles.topBarRightSpacer} />
      </View>

      <View style={styles.walletStrip}>
        <Text style={styles.walletText}>
          🪙 {wallet.coins} · 💎 {wallet.shards} · 🗝️ {wallet.keys} · ✨ {wallet.dust ?? 0}
        </Text>
      </View>

      <SummonTab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  backButton: { paddingHorizontal: 8, paddingVertical: 4 },
  backText: { color: '#ddd', fontSize: 22, fontWeight: '500' },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBarRightSpacer: { width: 40 },
  walletStrip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
    alignItems: 'center',
  },
  walletText: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
