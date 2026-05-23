// app/(app)/quests.tsx
// Release 1.1.0 — daily & weekly quest panel. Two sections, 3 quests
// each. Live Firestore subscription via useQuestProgress; on mount the
// hook fires assignQuests to ensure the doc is provisioned and the
// cycles are fresh. Claim button calls the claimQuest callable.

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../src/lib/firebase';
import { useQuestProgress } from '../../src/hooks/useQuestProgress';
import { QuestCard } from '../../src/components/quests/QuestCard';
import { CycleCountdown } from '../../src/components/quests/CycleCountdown';
import { isQuestComplete } from '../../src/types/quests';
import type { AssignedQuest } from '../../src/types/quests';

type ClaimQuestInput = { period: 'daily' | 'weekly'; quest_id: string };
type ClaimQuestResult = {
  success: true;
  coins_earned: number;
  shards_earned: number;
  keys_earned: number;
  streak_day_recorded: boolean;
};

export default function QuestsScreen() {
  const router = useRouter();
  const { progress, isLoading, error, refresh } = useQuestProgress();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleClaim = useCallback(
    async (period: 'daily' | 'weekly', quest: AssignedQuest) => {
      if (claimingId) return;
      setClaimingId(quest.quest_id);
      try {
        const fn = httpsCallable<ClaimQuestInput, ClaimQuestResult>(
          functions,
          'claimQuest',
        );
        const res = (await fn({ period, quest_id: quest.quest_id })).data;
        const parts: string[] = [];
        if (res.coins_earned > 0) parts.push(`🪙 ${res.coins_earned}`);
        if (res.shards_earned > 0) parts.push(`💎 ${res.shards_earned}`);
        if (res.keys_earned > 0) parts.push(`🗝️ ${res.keys_earned}`);
        const earned = parts.join('  ');
        Alert.alert(
          'Reward Claimed',
          earned + (res.streak_day_recorded ? '\n\n✨ Streak day recorded!' : ''),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        Alert.alert('Claim failed', msg);
      } finally {
        setClaimingId(null);
      }
    },
    [claimingId],
  );

  const handlePullRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  // ── Initial loading state ─────────────────────────────────────────
  if (isLoading && !progress) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color="#d4a04a" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state (with retry) ──────────────────────────────────────
  if (error && !progress) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Could not load quests</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={refresh}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!progress) {
    // Defensive — should be unreachable now (loading covers initial state,
    // error covers failure). Render the same retry UI just in case.
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>No quest data</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={refresh}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const allDailiesClaimed =
    progress.daily_quests.length > 0 &&
    progress.daily_quests.every((q) => q.claimed);
  const allDailiesDoneNotClaimed =
    progress.daily_quests.length > 0 &&
    progress.daily_quests.every((q) => q.claimed || isQuestComplete(q));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullRefresh}
            tintColor="#d4a04a"
          />
        }
      >
        {/* ── Daily section ─────────────────────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Daily</Text>
          <CycleCountdown period="daily" />
        </View>

        {allDailiesClaimed ? (
          <View style={styles.allDoneCard}>
            <Text style={styles.allDoneText}>
              All daily quests complete! Come back tomorrow for new quests.
            </Text>
          </View>
        ) : (
          progress.daily_quests.map((q) => (
            <QuestCard
              key={q.quest_id}
              quest={q}
              onClaim={() => handleClaim('daily', q)}
              isClaiming={claimingId === q.quest_id}
            />
          ))
        )}

        {!allDailiesClaimed && allDailiesDoneNotClaimed && (
          <Text style={styles.subtleHint}>
            All daily quests ready to claim above.
          </Text>
        )}

        {/* ── Weekly section ────────────────────────────────────────── */}
        <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
          <Text style={styles.sectionTitle}>Weekly</Text>
          <CycleCountdown period="weekly" />
        </View>

        {progress.weekly_quests.map((q) => (
          <QuestCard
            key={q.quest_id}
            quest={q}
            onClaim={() => handleClaim('weekly', q)}
            isClaiming={claimingId === q.quest_id}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        style={styles.backButton}
        onPress={onBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.backText}>←</Text>
      </Pressable>
      <Text style={styles.title}>Quests</Text>
      <View style={styles.topBarRightSpacer} />
    </View>
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
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    color: '#bbb',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#d4a04a',
  },
  pressed: { opacity: 0.7 },
  retryText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '700',
  },
  allDoneCard: {
    backgroundColor: 'rgba(20, 20, 26, 0.55)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1f1f24',
    padding: 16,
    marginBottom: 12,
  },
  allDoneText: {
    color: '#bbb',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  subtleHint: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
});
