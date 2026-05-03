// app/(app)/campaign.tsx
// Campaign hub. Vertical scroll of 6 faction cards. Unlocked cards link to
// /campaign/[factionId] (URL form: spaces → underscores). Locked cards are
// dimmed and tap-inert.

import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { useCampaignProgress } from '../../src/hooks/useCampaignProgress';
import {
  useCampaignStages,
  getStagesByFaction,
} from '../../src/hooks/useCampaignStages';
import { FACTIONS } from '../../src/lib/factions';
import type { FactionMeta } from '../../src/lib/factions';
import type { CampaignStage } from '../../src/types/campaign';

const STAGES_PER_FACTION = 9;

export default function CampaignHubScreen() {
  const router = useRouter();
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { progress, isLoading: progressLoading } = useCampaignProgress();
  const { stages, isLoading: stagesLoading } = useCampaignStages();

  const isLoading = profileLoading || progressLoading || stagesLoading;
  const unlockedFactions = profile?.unlocked_factions ?? [];

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
        <Text style={styles.topBarTitle}>Campaign</Text>
        <View style={styles.backButton} />
      </View>

      <Text style={styles.subtitle}>Choose your campaign</Text>

      {isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color="#d4a04a" size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {FACTIONS.map((faction) => (
            <FactionCampaignCard
              key={faction.id}
              faction={faction}
              isUnlocked={unlockedFactions.includes(faction.id)}
              factionProgress={progress?.progress?.[faction.id] ?? 0}
              factionStages={getStagesByFaction(stages, faction.id)}
              onPress={() =>
                router.push(`/campaign/${faction.id.replace(/ /g, '_')}`)
              }
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FactionCampaignCard({
  faction,
  isUnlocked,
  factionProgress,
  factionStages,
  onPress,
}: {
  faction: FactionMeta;
  isUnlocked: boolean;
  factionProgress: number;
  factionStages: CampaignStage[];
  onPress: () => void;
}) {
  const isComplete = factionProgress >= STAGES_PER_FACTION;
  const nextStage = factionStages.find(
    (s) => s.stage_number === factionProgress + 1,
  );

  const statusLine = (() => {
    if (!isUnlocked) return '🔒 Locked';
    if (isComplete) return '★ Campaign complete';
    return `✓ ${factionProgress} of ${STAGES_PER_FACTION} stages`;
  })();

  const previewLine =
    isUnlocked && !isComplete && nextStage
      ? `Next: Stage ${nextStage.stage_number} — ${nextStage.title}`
      : null;

  const cardStyle = [
    styles.factionCard,
    { borderLeftColor: faction.color },
    !isUnlocked && styles.factionCardLocked,
  ];

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={onPress}
      disabled={!isUnlocked}
      activeOpacity={isUnlocked ? 0.7 : 1}
    >
      <Text style={[styles.factionName, { color: faction.color }]}>
        {faction.name}
      </Text>
      <Text style={styles.statusLine}>{statusLine}</Text>
      {previewLine ? (
        <Text style={styles.previewLine}>{previewLine}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const ACCENT = '#d4a04a';

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
    color: '#f5e7c2',
    fontSize: 17,
    fontWeight: '700',
  },
  backButton: {
    minWidth: 64,
  },
  backText: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#888',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  loadingBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  factionCard: {
    backgroundColor: '#181818',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderColor: '#222',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
    minHeight: 140,
    justifyContent: 'center',
  },
  factionCardLocked: {
    opacity: 0.5,
  },
  factionName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  statusLine: {
    color: '#cfcfcf',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewLine: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
});
