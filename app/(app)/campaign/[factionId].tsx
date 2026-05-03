// app/(app)/campaign/[factionId].tsx
// Per-faction stage map. URL form has underscores ('Vanguard_Kingdoms');
// converted to display form ('Vanguard Kingdoms') for filtering. Shows 9
// stages as a vertical list with locked/unlocked/completed/boss states.
// Tapping an unlocked stage opens StageDetailModal with battle CTA.
//
// TODO Session 3: Match Complete overlay needs a campaign branch.
//   Until then, campaign matches use the solo claim flow (claimMatchRewards),
//   which pays solo rewards instead of stage rewards.
//   Player progression is NOT yet recorded — Session 3 ships recordCampaignWin.

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../src/lib/firebase';
import { usePlayerProfile } from '../../../src/hooks/usePlayerProfile';
import { useCampaignProgress } from '../../../src/hooks/useCampaignProgress';
import {
  useCampaignStages,
  getStagesByFaction,
} from '../../../src/hooks/useCampaignStages';
import { FACTIONS } from '../../../src/lib/factions';
import { StageDetailModal } from '../../../src/components/campaign/StageDetailModal';
import type { CampaignStage } from '../../../src/types/campaign';
import type { InitializeNewMatchResult } from '../../../src/types/matchActions';

const ACCENT = '#d4a04a';

type StageStatus = 'locked' | 'unlocked' | 'completed';

type InitializeNewMatchInput = {
  mode: 'campaign';
  stage_id: string;
};

export default function FactionStageMapScreen() {
  const router = useRouter();
  const { factionId: rawFactionId } = useLocalSearchParams<{ factionId: string }>();
  const factionId = (rawFactionId ?? '').replace(/_/g, ' ');

  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { progress, isLoading: progressLoading } = useCampaignProgress();
  const { stages: allStages, isLoading: stagesLoading } = useCampaignStages();

  const [selectedStage, setSelectedStage] = useState<CampaignStage | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const factionMeta = FACTIONS.find((f) => f.id === factionId);
  const factionStages = useMemo(
    () => getStagesByFaction(allStages, factionId),
    [allStages, factionId],
  );
  const factionProgress = progress?.progress?.[factionId] ?? 0;
  const isLoading = profileLoading || progressLoading || stagesLoading;

  const isFactionUnlocked =
    profile?.unlocked_factions?.includes(factionId) ?? false;

  // Defensive: URL-hack into a locked faction.
  if (!isLoading && (!factionMeta || !isFactionUnlocked)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.errorBlock}>
          <Text style={styles.errorTitle}>Faction not unlocked</Text>
          <Text style={styles.errorBody}>
            You haven't unlocked {factionId || 'this faction'} yet.
          </Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={() => router.replace('/campaign')}
          >
            <Text style={styles.errorButtonText}>Back to Campaign</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const factionColor = factionMeta?.color ?? ACCENT;

  function getStageStatus(stage: CampaignStage): StageStatus {
    if (stage.stage_number <= factionProgress) return 'completed';
    if (stage.stage_number === factionProgress + 1) return 'unlocked';
    return 'locked';
  }

  async function handleStartBattle() {
    if (!selectedStage) return;
    setIsStarting(true);
    try {
      const fn = httpsCallable<InitializeNewMatchInput, InitializeNewMatchResult>(
        functions,
        'initializeNewMatch',
      );
      const result = await fn({
        mode: 'campaign',
        stage_id: selectedStage.stage_id,
      });
      // Replace the stage detail modal route with the match screen so back
      // navigation from the match returns to the stage map.
      setSelectedStage(null);
      router.push(`/match/${result.data.match_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not start match', msg);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: factionColor }]} numberOfLines={1}>
          {factionId}
        </Text>
        <View style={styles.backButton} />
      </View>

      {isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={factionColor} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.progressLine}>
            {factionProgress >= 9
              ? '★ Campaign complete'
              : `${factionProgress} of 9 stages cleared`}
          </Text>
          {factionStages.map((stage) => (
            <StageNode
              key={stage.stage_id}
              stage={stage}
              status={getStageStatus(stage)}
              factionColor={factionColor}
              onPress={() => setSelectedStage(stage)}
            />
          ))}
        </ScrollView>
      )}

      <StageDetailModal
        stage={selectedStage}
        isReplay={
          selectedStage ? selectedStage.stage_number <= factionProgress : false
        }
        isStarting={isStarting}
        onStartBattle={handleStartBattle}
        onClose={() => setSelectedStage(null)}
      />
    </SafeAreaView>
  );
}

function StageNode({
  stage,
  status,
  factionColor,
  onPress,
}: {
  stage: CampaignStage;
  status: StageStatus;
  factionColor: string;
  onPress: () => void;
}) {
  const isBoss = stage.difficulty === 'boss';
  const tappable = status !== 'locked';

  const icon =
    status === 'locked'
      ? '🔒'
      : status === 'completed'
        ? '✓'
        : isBoss
          ? '👑'
          : '⚔';

  const badge =
    status === 'completed' ? 'Replay' : status === 'unlocked' ? 'Battle' : null;

  const nodeColor =
    status === 'locked'
      ? '#3a3a3a'
      : isBoss
        ? '#e05a5a'
        : status === 'completed'
          ? '#6abf6a'
          : factionColor;

  return (
    <TouchableOpacity
      style={[
        styles.stageNode,
        { borderColor: nodeColor },
        status === 'locked' && styles.stageNodeLocked,
        isBoss && styles.stageNodeBoss,
      ]}
      onPress={onPress}
      disabled={!tappable}
      activeOpacity={tappable ? 0.7 : 1}
    >
      <View style={[styles.iconCircle, { backgroundColor: nodeColor }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <View style={styles.stageBody}>
        <Text style={styles.stageNumber}>
          Stage {stage.stage_number}
          {isBoss ? ' — Boss' : ''}
        </Text>
        <Text style={styles.stageTitle} numberOfLines={1}>
          {stage.title}
        </Text>
      </View>
      {badge ? (
        <View style={[styles.badge, { borderColor: nodeColor }]}>
          <Text style={[styles.badgeText, { color: nodeColor }]}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
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
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    minWidth: 64,
  },
  backText: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  progressLine: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  stageNode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  stageNodeLocked: {
    opacity: 0.45,
    backgroundColor: '#141414',
  },
  stageNodeBoss: {
    backgroundColor: '#1f1414',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  iconText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  stageBody: {
    flex: 1,
  },
  stageNumber: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  stageTitle: {
    color: '#f5e7c2',
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  errorBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorBody: {
    color: '#bbb',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorButton: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: ACCENT,
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '700',
  },
});
