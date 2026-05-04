// app/(app)/forge.tsx
// Phase 9 Session 2: Forge hub. Tabbed screen consolidating Summon and
// Craft into one route. The legacy /summon and /library?mode=craft routes
// stay live (kept simple by re-using the same SummonTab / CraftTab
// components) until Session 3 deprecation.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletAndCanSummon } from '../../src/hooks/useWalletAndCanSummon';
import { SummonTab } from '../../src/components/forge/SummonTab';
import { CraftTab } from '../../src/components/forge/CraftTab';

type Tab = 'summon' | 'craft';

export default function ForgeScreen() {
  const { wallet, isLoading } = useWalletAndCanSummon();
  const [activeTab, setActiveTab] = useState<Tab>('summon');

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
        <Text style={styles.topBarTitle}>Forge</Text>
      </View>

      <View style={styles.walletStrip}>
        <Text style={styles.walletText}>
          🪙 {wallet.coins} · 💎 {wallet.shards} · 🗝️ {wallet.keys} · ✨ {wallet.dust ?? 0}
        </Text>
      </View>

      <View style={styles.tabBar}>
        <TabButton
          label="Summon"
          active={activeTab === 'summon'}
          onPress={() => setActiveTab('summon')}
        />
        <TabButton
          label="Craft"
          active={activeTab === 'craft'}
          onPress={() => setActiveTab('craft')}
        />
      </View>

      <View style={styles.tabContent}>
        {activeTab === 'summon' ? <SummonTab /> : <CraftTab mode="craft" />}
      </View>
    </SafeAreaView>
  );
}

// ─── TabButton ──────────────────────────────────────────────────────────

type TabButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function TabButton({ label, active, onPress }: TabButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tabButton,
        active && styles.tabButtonActive,
        pressed && !active && styles.tabButtonPressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
        {label}
      </Text>
      {active && <View style={styles.tabButtonIndicator} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  topBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  walletStrip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {},
  tabButtonPressed: {
    opacity: 0.7,
  },
  tabButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tabButtonTextActive: {
    color: '#FFD700',
  },
  tabButtonIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: '#FFD700',
  },
  tabContent: {
    flex: 1,
  },
  fullCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
