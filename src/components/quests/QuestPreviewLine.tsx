// One-line quest preview rendered on the home screen, in the slot the
// "Daily Check-In Coming Soon" placeholder used to occupy. Three modes:
//   - any complete-unclaimed quest → "Daily Quests — N ready to claim! 🎁" + red dot
//   - quests assigned, none claimable → most-progressed daily + "+N more"
//   - quest_progress doc missing (new player) → "Daily Quests — Tap to start"
// Tap navigates to /quests.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuestProgress } from '../../hooks/useQuestProgress';
import {
  countClaimableQuests,
  mostProgressedDaily,
} from '../../lib/quests';

export function QuestPreviewLine() {
  const router = useRouter();
  const { progress, isLoading } = useQuestProgress();

  // While we're waiting for the initial assignQuests + snapshot, render
  // a quiet placeholder so the home layout doesn't reflow when it lands.
  if (isLoading && !progress) {
    return (
      <PreviewShell onPress={() => router.push('/quests')}>
        <Text style={styles.label}>Daily Quests</Text>
        <Text style={styles.subLoading}>Loading…</Text>
      </PreviewShell>
    );
  }

  if (!progress) {
    return (
      <PreviewShell onPress={() => router.push('/quests')}>
        <Text style={styles.label}>Daily Quests</Text>
        <Text style={styles.subInactive}>Tap to start</Text>
      </PreviewShell>
    );
  }

  const allActive = [...progress.daily_quests, ...progress.weekly_quests];
  const claimable = countClaimableQuests(allActive);

  if (claimable > 0) {
    return (
      <PreviewShell onPress={() => router.push('/quests')}>
        <View style={styles.titleRow}>
          <View style={styles.redDot} />
          <Text style={styles.label}>Daily Quests</Text>
        </View>
        <Text style={styles.claimable}>
          {claimable} ready to claim! 🎁
        </Text>
      </PreviewShell>
    );
  }

  const featured = mostProgressedDaily(progress.daily_quests);
  if (!featured) {
    return (
      <PreviewShell onPress={() => router.push('/quests')}>
        <Text style={styles.label}>Daily Quests</Text>
        <Text style={styles.subInactive}>
          All complete! New quests at UTC midnight.
        </Text>
      </PreviewShell>
    );
  }

  // "+N more" counts the OTHER unclaimed dailies (not the featured one).
  const otherCount = progress.daily_quests.filter(
    (q) => !q.claimed && q.quest_id !== featured.quest_id,
  ).length;

  return (
    <PreviewShell onPress={() => router.push('/quests')}>
      <Text style={styles.label}>Daily Quests</Text>
      <View style={styles.featuredRow}>
        <Text style={styles.featuredTitle} numberOfLines={1}>
          {featured.title}
        </Text>
        <Text style={styles.featuredProgress}>
          {featured.progress}/{featured.target}
        </Text>
      </View>
      {otherCount > 0 && (
        <Text style={styles.moreHint}>+{otherCount} more</Text>
      )}
    </PreviewShell>
  );
}

function PreviewShell({
  onPress,
  children,
}: {
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  cardPressed: {
    opacity: 0.85,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    color: '#999',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e05a5a',
  },
  claimable: {
    color: '#5cd35c',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 10,
  },
  featuredTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  featuredProgress: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '700',
  },
  moreHint: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  subInactive: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  subLoading: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
  },
});
