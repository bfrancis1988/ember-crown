// app/(app)/summon.tsx
// Phase 6: banner-summon screen. Three vertically-stacked banners; each pull
// invokes the summonCard Cloud Function and renders the result in a modal.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '../../src/lib/firebase';
import { BANNERS, type BannerId } from '../../src/lib/banners';
import { useWalletAndCanSummon } from '../../src/hooks/useWalletAndCanSummon';
import { BannerCard } from '../../src/components/summon/BannerCard';
import {
  SummonResultModal,
  type SummonResult,
} from '../../src/components/summon/SummonResultModal';
import type { CardLibraryEntry } from '../../src/types/card';

type SummonInput = { bannerId: BannerId };

export default function SummonScreen() {
  const router = useRouter();
  const { wallet, isLoading, canSummon } = useWalletAndCanSummon();

  const [isPulling, setIsPulling] = useState<BannerId | null>(null);
  const [lastResult, setLastResult] = useState<SummonResult | null>(null);
  const [lastResultCard, setLastResultCard] = useState<CardLibraryEntry | null>(
    null
  );
  const [lastBannerId, setLastBannerId] = useState<BannerId | null>(null);

  async function handlePull(bannerId: BannerId) {
    if (isPulling) return;
    setIsPulling(bannerId);
    setLastBannerId(bannerId);
    try {
      const fn = httpsCallable<SummonInput, SummonResult>(
        functions,
        'summonCard'
      );
      const result = (await fn({ bannerId })).data;
      const cardSnap = await getDoc(doc(db, 'card_library', result.card_id));
      const cardData = cardSnap.exists()
        ? (cardSnap.data() as CardLibraryEntry)
        : null;
      setLastResult(result);
      setLastResultCard(cardData);
    } catch (err: any) {
      Alert.alert('Summon failed', err?.message ?? 'Unknown error');
    } finally {
      setIsPulling(null);
    }
  }

  const handlePullAgain = () => {
    if (!lastBannerId) return;
    setLastResult(null);
    setLastResultCard(null);
    handlePull(lastBannerId);
  };

  const canPullAgain = lastBannerId ? canSummon[lastBannerId] : false;

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
          🪙 {wallet.coins} · 💎 {wallet.shards} · 🗝️ {wallet.keys} · ✨{' '}
          {wallet.dust ?? 0}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {BANNERS.map((banner) => (
          <View key={banner.id} style={styles.bannerWrap}>
            <BannerCard
              banner={banner}
              canAfford={canSummon[banner.id]}
              onPress={() => handlePull(banner.id)}
              isPulling={isPulling === banner.id}
            />
          </View>
        ))}
      </ScrollView>

      <SummonResultModal
        result={lastResult}
        cardLibraryEntry={lastResultCard}
        onClose={() => {
          setLastResult(null);
          setLastResultCard(null);
        }}
        onPullAgain={handlePullAgain}
        canPullAgain={canPullAgain && !isPulling}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111' },
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  bannerWrap: { marginBottom: 14 },
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
