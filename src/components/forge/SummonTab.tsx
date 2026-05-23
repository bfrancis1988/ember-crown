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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { Analytics, fireOnceAnalyticsEvent } from '../../lib/analytics';
import { useAuth } from '../../contexts/AuthContext';
import { BANNERS, type BannerId, type Rarity } from '../../lib/banners';
import { useWalletAndCanSummon } from '../../hooks/useWalletAndCanSummon';
import { BannerCard } from '../summon/BannerCard';
import {
  SummonResultModal,
  type SummonResult,
} from '../summon/SummonResultModal';
import type { CardLibraryEntry } from '../../types/card';
import { SummonCrystalAnimation } from '../summon/SummonCrystalAnimation';
import { RARITY_CRYSTAL_COLORS } from '../summon/rarityColors';
import { resetAllSummonSkipState } from '../summon/summonSkipStorage';

type SummonInput = { bannerId: BannerId };

export function SummonTab() {
  const { user } = useAuth();
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
      if (user) {
        fireOnceAnalyticsEvent(user.uid, `first_summon:${bannerId}`, () =>
          Analytics.firstSummon(bannerId),
        ).catch(() => {/* best-effort */});
      }
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
        {__DEV__ && <DevCrystalTestStrip />}
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

// ─── Dev-only crystal animation test strip ─────────────────────────────
// Renders the SummonCrystalAnimation in its own Modal — bypasses the
// summonCard Cloud Function entirely so no currency is spent. Will be
// stripped from production builds by the __DEV__ guard at the call site.

const TEST_RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

function DevCrystalTestStrip() {
  const [testRarity, setTestRarity] = useState<Rarity | null>(null);

  return (
    <>
      <View style={devStyles.strip}>
        <Text style={devStyles.label}>DEV crystal test</Text>
        <View style={devStyles.chipRow}>
          {TEST_RARITIES.map((r) => (
            <Pressable
              key={r}
              style={({ pressed }) => [
                devStyles.chip,
                { borderColor: RARITY_CRYSTAL_COLORS[r] },
                pressed && devStyles.chipPressed,
              ]}
              onPress={() => setTestRarity(r)}
            >
              <Text style={[devStyles.chipText, { color: RARITY_CRYSTAL_COLORS[r] }]}>
                {r}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [
              devStyles.chip,
              devStyles.resetChip,
              pressed && devStyles.chipPressed,
            ]}
            onPress={() => {
              resetAllSummonSkipState()
                .then(() => Alert.alert('Skip state cleared', 'All rarities back to first-view delay.'))
                .catch(() => Alert.alert('Reset failed', 'Could not clear AsyncStorage.'));
            }}
          >
            <Text style={[devStyles.chipText, { color: '#aaa' }]}>Reset skip</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={testRarity !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTestRarity(null)}
      >
        <View style={devStyles.modalBackdrop}>
          {testRarity !== null && (
            <SummonCrystalAnimation
              rarity={testRarity}
              onComplete={() => setTestRarity(null)}
            />
          )}
        </View>
      </Modal>
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

const devStyles = StyleSheet.create({
  strip: {
    marginBottom: 16,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#444',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  label: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  resetChip: {
    borderColor: '#555',
  },
  chipPressed: {
    opacity: 0.6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
});
