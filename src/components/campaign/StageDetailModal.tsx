// src/components/campaign/StageDetailModal.tsx
// Pre-battle modal that previews a campaign stage's opponent, difficulty,
// boss rules (if any), and rewards. CTA dispatches initializeNewMatch via
// the parent's onStartBattle handler.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FACTIONS } from '../../lib/factions';
import type { CampaignStage, BossSpecialRule } from '../../types/campaign';
import type { CommanderEntry } from '../../types/commander';

const ACCENT = '#d4a04a';

type Props = {
  stage: CampaignStage | null;
  isReplay: boolean;
  isStarting: boolean;
  onStartBattle: () => void;
  onClose: () => void;
};

export function StageDetailModal({
  stage,
  isReplay,
  isStarting,
  onStartBattle,
  onClose,
}: Props) {
  const [commander, setCommander] = useState<CommanderEntry | null>(null);

  useEffect(() => {
    if (!stage) {
      setCommander(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(
          doc(db, 'commander_library', stage.opponent_commander_id),
        );
        if (cancelled) return;
        setCommander(snap.exists() ? (snap.data() as CommanderEntry) : null);
      } catch (err) {
        console.warn('StageDetailModal: commander fetch failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage]);

  const visible = stage !== null;
  if (!stage) {
    return (
      <Modal visible={false} onRequestClose={onClose} transparent>
        <View />
      </Modal>
    );
  }

  const factionMeta = FACTIONS.find((f) => f.id === stage.faction);
  const factionColor = factionMeta?.color ?? ACCENT;

  const difficultyLabel =
    stage.difficulty === 'boss'
      ? 'Boss'
      : stage.difficulty === 'standard'
        ? 'Standard'
        : 'Easy';
  const difficultyColor =
    stage.difficulty === 'boss'
      ? '#e05a5a'
      : stage.difficulty === 'standard'
        ? '#d4a04a'
        : '#6abf6a';

  const ctaLabel = isReplay ? 'Replay' : 'Battle';

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.factionName, { color: factionColor }]} numberOfLines={1}>
            {stage.faction}
          </Text>
          <View style={styles.closeButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.stageTitle}>
            Stage {stage.stage_number}: {stage.title}
          </Text>
          <Text style={styles.description}>{stage.description}</Text>

          <View style={styles.opponentBlock}>
            <Text style={styles.label}>Opponent</Text>
            <Text style={styles.opponentName}>{stage.opponent_name}</Text>
            <Text style={styles.commanderLine}>
              {commander
                ? `Commander: ${commander.name} (${commander.lane})`
                : `Commander: ${stage.opponent_commander_id}`}
            </Text>
          </View>

          <View style={styles.difficultyRow}>
            <View
              style={[styles.difficultyBadge, { borderColor: difficultyColor }]}
            >
              <Text style={[styles.difficultyText, { color: difficultyColor }]}>
                {difficultyLabel}
              </Text>
            </View>
          </View>

          {stage.boss_special_rules ? (
            <BossRulesBlock rules={stage.boss_special_rules} />
          ) : null}

          <View style={styles.rewardsBlock}>
            <Text style={styles.label}>Rewards</Text>
            {isReplay ? (
              <ReplayRewards rewards={stage.rewards} />
            ) : (
              <FirstWinRewards rewards={stage.rewards} />
            )}
          </View>
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: factionColor }]}
            onPress={onStartBattle}
            disabled={isStarting}
            activeOpacity={0.8}
          >
            {isStarting ? (
              <ActivityIndicator color="#111" />
            ) : (
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </SafeAreaView>
    </Modal>
  );
}

function BossRulesBlock({ rules }: { rules: BossSpecialRule }) {
  const lines: string[] = [];
  if (rules.commander_pre_activated) {
    lines.push('Commander begins pre-activated');
  }
  if (rules.debuff_strength_override) {
    lines.push(
      `Debuffs hit harder (−${rules.debuff_strength_override} instead of −2)`,
    );
  }
  if (rules.extra_round_draw) {
    lines.push(
      `Boss draws +${rules.extra_round_draw} card${rules.extra_round_draw === 1 ? '' : 's'} per round`,
    );
  }
  if (rules.starting_lane_buff) {
    const { lane, card_count } = rules.starting_lane_buff;
    lines.push(
      `Boss starts with ${card_count} card${card_count === 1 ? '' : 's'} already in ${lane}`,
    );
  }
  if (lines.length === 0) return null;

  return (
    <View style={styles.bossBlock}>
      <Text style={styles.bossHeader}>⚠ Special Rules</Text>
      {lines.map((line, i) => (
        <Text key={i} style={styles.bossRuleLine}>
          • {line}
        </Text>
      ))}
    </View>
  );
}

function FirstWinRewards({ rewards }: { rewards: CampaignStage['rewards'] }) {
  const parts: string[] = [];
  if (rewards.coins > 0) parts.push(`${rewards.coins} coins`);
  if (rewards.shards > 0) parts.push(`${rewards.shards} shards`);
  if (rewards.keys > 0)
    parts.push(`${rewards.keys} key${rewards.keys === 1 ? '' : 's'}`);
  return (
    <Text style={styles.rewardLine}>
      {parts.length === 0 ? 'No rewards' : parts.join(' · ')}
    </Text>
  );
}

function ReplayRewards({ rewards }: { rewards: CampaignStage['rewards'] }) {
  // 50% of coins + shards on replay; keys never on replay.
  const replayCoins = Math.floor(rewards.coins / 2);
  const replayShards = Math.floor(rewards.shards / 2);
  const parts: string[] = [];
  if (replayCoins > 0) parts.push(`${replayCoins} coins`);
  if (replayShards > 0) parts.push(`${replayShards} shards`);
  return (
    <>
      <Text style={styles.rewardLine}>
        {parts.length === 0 ? 'No rewards' : parts.join(' · ')}
      </Text>
      <Text style={styles.rewardSub}>(50% of first win — no keys on replay)</Text>
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0e0e0e',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  factionName: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    minWidth: 44,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#ccc',
    fontSize: 22,
    fontWeight: '500',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  stageTitle: {
    color: '#f5e7c2',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 10,
  },
  description: {
    color: '#bbb',
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
    marginBottom: 24,
  },
  opponentBlock: {
    marginBottom: 18,
  },
  label: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  opponentName: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 4,
  },
  commanderLine: {
    color: '#aaa',
    fontSize: 14,
  },
  difficultyRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  bossBlock: {
    backgroundColor: '#1f1414',
    borderColor: '#5a2c2c',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
  },
  bossHeader: {
    color: '#e05a5a',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  bossRuleLine: {
    color: '#e8b8b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  rewardsBlock: {
    backgroundColor: '#181818',
    borderColor: '#2a2a2a',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
  },
  rewardLine: {
    color: '#f5e7c2',
    fontSize: 15,
    fontWeight: '600',
  },
  rewardSub: {
    color: '#777',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#222',
  },
  ctaButton: {
    height: 54,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    color: '#111',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
