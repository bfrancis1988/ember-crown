// app/(app)/record.tsx
// Phase 9 Session 2: Player record / stats screen.
//
// Release 1.1.0 — match counts now read from player_stats/{uid}, an
// authoritative server-incremented doc written by claimMatchRewards and
// recordCampaignWin. Replaces the prior approach of querying
// match_sessions (which silently lost data once cleanupStaleMatches
// deleted claimed matches 12h after game_over).

import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { usePlayerWallet } from '../../src/hooks/usePlayerWallet';
import { usePlayerInventory } from '../../src/hooks/usePlayerInventory';
import { useCampaignProgress } from '../../src/hooks/useCampaignProgress';
import { useCardLibrary } from '../../src/hooks/useCardLibrary';
import { usePlayerStats } from '../../src/hooks/usePlayerStats';
import { FACTIONS } from '../../src/lib/factions';

const TOTAL_FACTIONS = 6;
const TOTAL_COMMANDERS = 18;
const TOTAL_CAMPAIGN_STAGES = 54;

export default function RecordScreen() {
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { wallet, isLoading: walletLoading } = usePlayerWallet();
  const { inventory, isLoading: inventoryLoading } = usePlayerInventory();
  const { progress, isLoading: progressLoading } = useCampaignProgress();
  // Phase 9.4.3C — total card count comes from card_library, not a hardcoded
  // constant. The library grows over time (88 → 144 in 9.4.2).
  const { cards: cardLibrary, isLoading: cardLibraryLoading } = useCardLibrary();
  const { stats: matchStats, isLoading: matchStatsLoading } = usePlayerStats();

  const isLoading =
    profileLoading ||
    walletLoading ||
    inventoryLoading ||
    progressLoading ||
    cardLibraryLoading;

  // ─── Derived values ──────────────────────────────────────────────────

  const cardsOwned = inventory.length;
  const totalCards = cardLibrary.length;
  const cardsOwnedPct =
    totalCards > 0 ? Math.round((cardsOwned / totalCards) * 100) : 0;

  const factionsUnlocked = profile?.unlocked_factions?.length ?? 1;
  // Each unlocked faction grants its 3 commanders. v1 commander unlock is
  // 1:1 with faction unlock — no per-commander gating.
  const commandersUnlocked = factionsUnlocked * 3;

  const stagesCleared = progress
    ? Object.values(progress.progress ?? {}).reduce((acc, n) => acc + n, 0)
    : 0;

  const totalMatches = matchStats?.total_matches ?? 0;
  const totalWins = matchStats?.total_wins ?? 0;
  const winRatePct =
    totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

  const memberSinceLabel = profile?.created_at
    ? formatDate(profile.created_at.toDate())
    : '—';

  const activeFactionMeta = profile?.active_faction
    ? FACTIONS.find((f) => f.id === profile.active_faction)
    : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Record</Text>
      </View>

      {isLoading ? (
        <View style={styles.fullCenter}>
          <ActivityIndicator color="#d4a04a" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileHeader}>
            <Text style={styles.username}>{profile?.username ?? '—'}</Text>
            <Text style={styles.profileSub}>
              {activeFactionMeta?.name ?? '—'}
              {profile?.selected_commander ? ` · ${profile.selected_commander}` : ''}
            </Text>
          </View>

          <Section title="Match Stats">
            <Stat
              label="Total matches"
              value={matchStatsLoading ? '—' : String(totalMatches)}
            />
            <Stat
              label="Solo / Campaign / Battle"
              value={
                matchStatsLoading
                  ? '—'
                  : `${matchStats?.solo_matches ?? 0} / ${matchStats?.campaign_matches ?? 0} / ${matchStats?.battle_matches ?? 0}`
              }
            />
            <Stat
              label="Win rate"
              value={
                matchStatsLoading
                  ? '—'
                  : totalMatches === 0
                  ? '—'
                  : `${winRatePct}% (${totalWins} of ${totalMatches})`
              }
            />
          </Section>

          <Section title="Collection">
            <Stat label="Cards owned" value={`${cardsOwned} of ${totalCards} (${cardsOwnedPct}%)`} />
            <Stat label="Factions unlocked" value={`${factionsUnlocked} of ${TOTAL_FACTIONS}`} />
            <Stat label="Commanders unlocked" value={`${commandersUnlocked} of ${TOTAL_COMMANDERS}`} />
            <Stat label="Campaign stages cleared" value={`${stagesCleared} of ${TOTAL_CAMPAIGN_STAGES}`} />
          </Section>

          <Section title="Current Balance">
            <Stat label="🪙 Coins" value={String(wallet?.coins ?? 0)} />
            <Stat label="💎 Shards" value={String(wallet?.shards ?? 0)} />
            <Stat label="🗝️ Keys" value={String(wallet?.keys ?? 0)} />
            <Stat label="✨ Dust" value={String(wallet?.dust ?? 0)} />
          </Section>

          <Section title="Account">
            <Stat label="Member since" value={memberSinceLabel} />
            <Stat
              label="Tutorial"
              value={profile?.tutorial_completed ? 'Completed' : 'Not yet'}
            />
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Section / Stat primitives ──────────────────────────────────────────

type SectionProps = { title: string; children: React.ReactNode };
function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

type StatProps = { label: string; value: string };
function Stat({ label, value }: StatProps) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
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
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileHeader: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 12,
    alignItems: 'center',
  },
  username: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  profileSub: {
    color: '#bbb',
    fontSize: 13,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionBody: {
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f1f24',
  },
  statLabel: {
    color: '#bbb',
    fontSize: 14,
  },
  statValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
