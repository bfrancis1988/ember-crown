// app/(app)/battle.tsx
// Phase 9 Session 2: Battle hub. Consolidated landing page for all match
// modes (solo, campaign, tutorial). Replaces the stacked home-screen
// buttons that previously routed to each mode directly.
//
// Hero-card layout: each mode is a large pressable tile with title,
// subtitle, and CTA. Tutorial card disappears once profile.tutorial_completed
// flips true (Phase 7.1's tutorial gate).

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
import { functions } from '../../src/lib/firebase';
import { useCanStartMatch } from '../../src/hooks/useCanStartMatch';
import { useCampaignProgress } from '../../src/hooks/useCampaignProgress';
import { FACTIONS } from '../../src/lib/factions';
import type { InitializeNewMatchResult } from '../../src/types/matchActions';

const TOTAL_STAGES = 54;

export default function BattleHubScreen() {
  const router = useRouter();
  const { readiness, profile } = useCanStartMatch();
  const { progress } = useCampaignProgress();
  const [isStartingSolo, setIsStartingSolo] = useState(false);

  const factionMeta = profile?.active_faction
    ? FACTIONS.find((f) => f.id === profile.active_faction)
    : undefined;
  const soloAccent = factionMeta?.color ?? '#d4a04a';

  const stagesCleared = progress
    ? Object.values(progress.progress ?? {}).reduce((acc, n) => acc + n, 0)
    : 0;
  const factionsUnlocked = profile?.unlocked_factions?.length ?? 1;

  const showTutorial = profile != null && !profile.tutorial_completed;

  async function handleStartSolo() {
    if (isStartingSolo) return;
    if (!readiness.ready) {
      Alert.alert('Match unavailable', soloUnavailableCopy(readiness));
      return;
    }
    setIsStartingSolo(true);
    try {
      const fn = httpsCallable<Record<string, never>, InitializeNewMatchResult>(
        functions,
        'initializeNewMatch'
      );
      const result = await fn({});
      router.push(`/match/${result.data.match_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not start match', msg);
    } finally {
      setIsStartingSolo(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Battle</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {showTutorial && (
          <HeroCard
            accent="#d4a04a"
            title="Tutorial"
            subtitle="Learn the basics. Earn 1000 coins + 10 shards."
            cta="Begin"
            ctaTone="primary"
            onPress={() => router.push('/tutorial')}
          />
        )}

        <HeroCard
          accent={soloAccent}
          title="Solo Match"
          subtitle={soloSubtitle(readiness, factionMeta?.name ?? null)}
          cta={isStartingSolo ? 'Starting…' : 'Play'}
          ctaTone={readiness.ready ? 'primary' : 'disabled'}
          onPress={handleStartSolo}
          disabled={!readiness.ready || isStartingSolo}
          loading={isStartingSolo}
        />

        <HeroCard
          accent="#5a8a5a"
          title="Campaign"
          subtitle={`${factionsUnlocked} of 6 factions unlocked · ${stagesCleared} of ${TOTAL_STAGES} stages cleared`}
          cta="Choose Campaign"
          ctaTone="secondary"
          onPress={() => router.push('/campaign')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── HeroCard ───────────────────────────────────────────────────────────

type HeroCardProps = {
  accent: string;
  title: string;
  subtitle: string;
  cta: string;
  ctaTone: 'primary' | 'secondary' | 'disabled';
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

function HeroCard({
  accent,
  title,
  subtitle,
  cta,
  ctaTone,
  onPress,
  disabled,
  loading,
}: HeroCardProps) {
  const ctaBackground =
    ctaTone === 'primary' ? accent : ctaTone === 'secondary' ? '#2a2a30' : '#1f1f24';
  const ctaTextColor =
    ctaTone === 'primary' ? '#111' : ctaTone === 'disabled' ? '#666' : '#ddd';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.heroCard,
        { borderLeftColor: accent },
        pressed && !disabled && styles.heroCardPressed,
        disabled && styles.heroCardDisabled,
      ]}
    >
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
      <View style={[styles.heroCta, { backgroundColor: ctaBackground }]}>
        {loading ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text style={[styles.heroCtaText, { color: ctaTextColor }]}>{cta}</Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function soloSubtitle(
  readiness: ReturnType<typeof useCanStartMatch>['readiness'],
  factionName: string | null
): string {
  if (readiness.ready) {
    return factionName ? `Quick match as ${factionName}.` : 'Quick match against the AI.';
  }
  if (readiness.reason === 'loading') return 'Checking your loadout…';
  return soloUnavailableCopy(readiness);
}

function soloUnavailableCopy(
  r: ReturnType<typeof useCanStartMatch>['readiness']
): string {
  if (r.ready) return '';
  switch (r.reason) {
    case 'loading':
      return 'Loading…';
    case 'incomplete_onboarding':
      return 'Complete onboarding first.';
    case 'no_faction':
      return 'Choose a faction first.';
    case 'no_commander':
      return 'Choose a commander first.';
    case 'wrong_deck_size':
      return `Deck must be 15 cards (currently ${r.current}).`;
  }
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderColor: '#222',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 14,
    minHeight: 160,
    justifyContent: 'space-between',
  },
  heroCardPressed: {
    opacity: 0.85,
  },
  heroCardDisabled: {
    opacity: 0.6,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  heroSubtitle: {
    color: '#bbb',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 18,
  },
  heroCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  heroCtaText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
