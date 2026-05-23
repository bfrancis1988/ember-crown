// Single quest visual: title, progress bar, reward icons, claim button.
// Used in app/(app)/quests.tsx inside the daily and weekly sections.

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { isQuestComplete, STREAK_QUEST_IDS } from '../../types/quests';
import type { AssignedQuest } from '../../types/quests';
import { renderRewardSegments } from '../../lib/quests';

type Props = {
  quest: AssignedQuest;
  onClaim: () => void;
  isClaiming: boolean;
};

export function QuestCard({ quest, onClaim, isClaiming }: Props) {
  const isComplete = isQuestComplete(quest);
  const isStreak = STREAK_QUEST_IDS.has(quest.quest_id);
  const ratio = quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 0;
  const segments = renderRewardSegments(quest.reward);

  // Visual state precedence: claimed > complete > in-progress.
  const showAsClaimed = quest.claimed;
  const showAsClaimable = !quest.claimed && isComplete;

  return (
    <View
      style={[
        styles.card,
        isStreak && styles.streakCard,
        showAsClaimed && styles.cardClaimed,
      ]}
    >
      <View style={styles.headerRow}>
        {isStreak && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakBadgeText}>STREAK</Text>
          </View>
        )}
        <Text style={[styles.title, isStreak && styles.streakTitle]} numberOfLines={2}>
          {quest.title}
        </Text>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${ratio * 100}%` },
              isComplete && styles.progressFillComplete,
              isStreak && !isComplete && styles.progressFillStreak,
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {quest.progress}/{quest.target}
        </Text>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.rewardRow}>
          {segments.map((seg, i) => (
            <Text key={i} style={styles.rewardText}>
              {seg.icon} {seg.amount}
            </Text>
          ))}
        </View>

        {showAsClaimed && (
          <View style={[styles.claimButton, styles.claimButtonClaimed]}>
            <Text style={styles.claimedText}>Claimed</Text>
          </View>
        )}
        {showAsClaimable && (
          <Pressable
            style={({ pressed }) => [
              styles.claimButton,
              styles.claimButtonReady,
              pressed && styles.claimButtonPressed,
              isClaiming && styles.claimButtonDisabled,
            ]}
            onPress={isClaiming ? undefined : onClaim}
            disabled={isClaiming}
          >
            {isClaiming ? (
              <ActivityIndicator color="#111" size="small" />
            ) : (
              <Text style={styles.claimReadyText}>Claim</Text>
            )}
          </Pressable>
        )}
        {!showAsClaimed && !showAsClaimable && (
          <View style={[styles.claimButton, styles.claimButtonIdle]}>
            <Text style={styles.claimIdleText}>In Progress</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
    padding: 14,
    marginBottom: 10,
  },
  streakCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#d4a04a',
  },
  cardClaimed: {
    opacity: 0.55,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  streakBadge: {
    backgroundColor: '#d4a04a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  streakBadgeText: {
    color: '#111',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  streakTitle: {
    color: '#f4d49a',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4a78c8',
    borderRadius: 4,
  },
  progressFillStreak: {
    backgroundColor: '#d4a04a',
  },
  progressFillComplete: {
    backgroundColor: '#5cd35c',
  },
  progressText: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 56,
    textAlign: 'right',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rewardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rewardText: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '600',
  },
  claimButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimButtonReady: {
    backgroundColor: '#5cd35c',
  },
  claimButtonPressed: {
    opacity: 0.75,
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonClaimed: {
    backgroundColor: '#2a2a30',
  },
  claimButtonIdle: {
    backgroundColor: '#1a1a20',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
  },
  claimReadyText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  claimedText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  claimIdleText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
});
