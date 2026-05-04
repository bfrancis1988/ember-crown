// app/(app)/campaign.tsx
// Campaign hub. Vertical scroll of 6 faction cards. Unlocked cards link to
// /campaign/[factionId] (URL form: spaces → underscores). Locked cards are
// dimmed and tap-inert.

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { useCampaignProgress } from '../../src/hooks/useCampaignProgress';
import {
  useCampaignStages,
  getStagesByFaction,
} from '../../src/hooks/useCampaignStages';
import { useCardLibrary } from '../../src/hooks/useCardLibrary';
import { FACTIONS } from '../../src/lib/factions';
import type { FactionMeta } from '../../src/lib/factions';
import {
  FACTION_REPRESENTATIVE_CARDS,
  hexToRgba,
} from '../../src/lib/factionRepresentativeCards';
import type { CampaignStage } from '../../src/types/campaign';

const STAGES_PER_FACTION = 9;

export default function CampaignHubScreen() {
  const router = useRouter();
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { progress, isLoading: progressLoading } = useCampaignProgress();
  const { stages, isLoading: stagesLoading } = useCampaignStages();
  const { cards: cardLibrary } = useCardLibrary();

  const isLoading = profileLoading || progressLoading || stagesLoading;
  const unlockedFactions = profile?.unlocked_factions ?? [];

  // Resolve representative card_id → image_url once. Card library is cached
  // module-level so this is essentially a Map lookup after the first render.
  const factionBackgrounds = useMemo(() => {
    const m = new Map<string, string>();
    for (const card of cardLibrary) {
      m.set(card.card_id, card.image_url ?? '');
    }
    const out = new Map<string, string>();
    for (const f of FACTIONS) {
      const cardId = FACTION_REPRESENTATIVE_CARDS[f.id];
      out.set(f.id, m.get(cardId) ?? '');
    }
    return out;
  }, [cardLibrary]);

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
              backgroundUrl={factionBackgrounds.get(faction.id) ?? ''}
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
  backgroundUrl,
  onPress,
}: {
  faction: FactionMeta;
  isUnlocked: boolean;
  factionProgress: number;
  factionStages: CampaignStage[];
  backgroundUrl: string;
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

  // Locked tiles dim the art further to signal "not yet yours" without going
  // grayscale — RN Image lacks a built-in grayscale filter, so we just lower
  // the image opacity instead of layering a tone-mapping shader.
  const imageOpacity = isUnlocked ? 0.4 : 0.18;
  const tintAlpha = isUnlocked ? 0.55 : 0.75;

  return (
    <TouchableOpacity
      style={[
        styles.factionCard,
        { borderLeftColor: faction.color },
        !isUnlocked && styles.factionCardLocked,
      ]}
      onPress={onPress}
      disabled={!isUnlocked}
      activeOpacity={isUnlocked ? 0.7 : 1}
    >
      {backgroundUrl ? (
        <ExpoImage
          source={{ uri: backgroundUrl }}
          style={[StyleSheet.absoluteFill, { opacity: imageOpacity }]}
          contentFit="cover"
          transition={200}
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: hexToRgba(faction.color, tintAlpha) },
        ]}
        pointerEvents="none"
      />
      <View style={styles.factionCardContent}>
        <Text style={[styles.factionName, styles.factionNameOverImage]}>
          {faction.name}
        </Text>
        <Text style={[styles.statusLine, styles.textOverImage]}>{statusLine}</Text>
        {previewLine ? (
          <Text style={[styles.previewLine, styles.textOverImage]}>{previewLine}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const ACCENT = '#d4a04a';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
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
    marginBottom: 12,
    minHeight: 140,
    overflow: 'hidden',
  },
  factionCardLocked: {
    opacity: 0.7,
  },
  factionCardContent: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    justifyContent: 'center',
    minHeight: 140,
  },
  factionName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  factionNameOverImage: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  textOverImage: {
    color: '#f5e7c2',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
