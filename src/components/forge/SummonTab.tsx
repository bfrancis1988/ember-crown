// src/components/forge/SummonTab.tsx
// Phase 9 Session 2: extracted summon body. Renders the 3 banner cards and
// drives the summonCard Cloud Function. Used by both the standalone /summon
// route (kept live for backwards compat) and the new /forge Summon tab.
//
// The host screen owns the top-bar + wallet-strip chrome. This component is
// just the scrolling banner list + result modal.

import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { BANNERS, type BannerId } from '../../lib/banners';
import { useWalletAndCanSummon } from '../../hooks/useWalletAndCanSummon';
import { BannerCard } from '../summon/BannerCard';
import {
  SummonResultModal,
  type SummonResult,
} from '../summon/SummonResultModal';
import type { CardLibraryEntry } from '../../types/card';

type SummonInput = { bannerId: BannerId };

export function SummonTab() {
  const { canSummon } = useWalletAndCanSummon();

  const [isPulling, setIsPulling] = useState<BannerId | null>(null);
  const [lastResult, setLastResult] = useState<SummonResult | null>(null);
  const [lastResultCard, setLastResultCard] = useState<CardLibraryEntry | null>(null);
  const [lastBannerId, setLastBannerId] = useState<BannerId | null>(null);

  async function handlePull(bannerId: BannerId) {
    if (isPulling) return;
    setIsPulling(bannerId);
    setLastBannerId(bannerId);
    try {
      const fn = httpsCallable<SummonInput, SummonResult>(functions, 'summonCard');
      const result = (await fn({ bannerId })).data;
      const cardSnap = await getDoc(doc(db, 'card_library', result.card_id));
      const cardData = cardSnap.exists() ? (cardSnap.data() as CardLibraryEntry) : null;
      setLastResult(result);
      setLastResultCard(cardData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Summon failed', msg);
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

  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  bannerWrap: { marginBottom: 14 },
});
