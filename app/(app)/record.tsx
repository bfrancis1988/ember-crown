// app/(app)/record.tsx
// Phase 9 Session 2: Player record / stats screen.
//
// v1 reads only from existing collections — no new aggregation Cloud
// Functions. Match counts come from a one-shot query of match_sessions
// (limit 100; we show "100+" once we hit the cap). v1.1 should add a
// player_stats doc that increments on match completion to remove the
// query cost.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  collection,
  getDocs,
  limit as fsLimit,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePlayerProfile } from '../../src/hooks/usePlayerProfile';
import { usePlayerWallet } from '../../src/hooks/usePlayerWallet';
import { usePlayerInventory } from '../../src/hooks/usePlayerInventory';
import { useCampaignProgress } from '../../src/hooks/useCampaignProgress';
import { useCardLibrary } from '../../src/hooks/useCardLibrary';
import { FACTIONS } from '../../src/lib/factions';
import type { MatchSession, MatchMode } from '../../src/types/match';

const TOTAL_FACTIONS = 6;
const TOTAL_COMMANDERS = 18;
const TOTAL_CAMPAIGN_STAGES = 54;
const MATCH_QUERY_LIMIT = 100;

type MatchStats = {
  total: number;
  capped: boolean;
  byMode: Record<MatchMode, number>;
  wins: number;
  finishedTotal: number;
};

const EMPTY_MATCH_STATS: MatchStats = {
  total: 0,
  capped: false,
  byMode: { solo: 0, tutorial: 0, campaign: 0, battle_mode: 0 },
  wins: 0,
  finishedTotal: 0,
};

export default function RecordScreen() {
  const { user } = useAuth();
  const { profile, isLoading: profileLoading } = usePlayerProfile();
  const { wallet, isLoading: walletLoading } = usePlayerWallet();
  const { inventory, isLoading: inventoryLoading } = usePlayerInventory();
  const { progress, isLoading: progressLoading } = useCampaignProgress();
  // Phase 9.4.3C — total card count comes from card_library, not a hardcoded
  // constant. The library grows over time (88 → 144 in 9.4.2).
  const { cards: cardLibrary, isLoading: cardLibraryLoading } = useCardLibrary();

  const [matchStats, setMatchStats] = useState<MatchStats>(EMPTY_MATCH_STATS);
  const [matchStatsLoading, setMatchStatsLoading] = useState(true);
  const [matchStatsError, setMatchStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setMatchStatsLoading(true);
    setMatchStatsError(null);

    (async () => {
      try {
        const q = query(
          collection(db, 'match_sessions'),
          where('player_a_id', '==', user.uid),
          fsLimit(MATCH_QUERY_LIMIT)
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        const stats: MatchStats = {
          total: snap.size,
          capped: snap.size === MATCH_QUERY_LIMIT,
          byMode: { solo: 0, tutorial: 0, campaign: 0, battle_mode: 0 },
          wins: 0,
          finishedTotal: 0,
        };
        for (const d of snap.docs) {
          const m = d.data() as MatchSession;
          if (m.mode in stats.byMode) {
            stats.byMode[m.mode] += 1;
          }
          if (m.status === 'game_over') {
            stats.finishedTotal += 1;
            if (m.player_a_wins > m.player_b_wins) stats.wins += 1;
          }
        }
        setMatchStats(stats);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setMatchStatsError(msg);
      } finally {
        if (!cancelled) setMatchStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const winRatePct =
    matchStats.finishedTotal > 0
      ? Math.round((matchStats.wins / matchStats.finishedTotal) * 100)
      : 0;

  const matchTotalLabel = matchStats.capped
    ? `${MATCH_QUERY_LIMIT}+`
    : String(matchStats.total);

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
              value={matchStatsLoading ? '—' : matchTotalLabel}
            />
            <Stat
              label="Solo / Campaign / Battle / Tutorial"
              value={
                matchStatsLoading
                  ? '—'
                  : `${matchStats.byMode.solo} / ${matchStats.byMode.campaign} / ${matchStats.byMode.battle_mode} / ${matchStats.byMode.tutorial}`
              }
            />
            <Stat
              label="Win rate"
              value={
                matchStatsLoading
                  ? '—'
                  : matchStats.finishedTotal === 0
                  ? '—'
                  : `${winRatePct}% (${matchStats.wins} of ${matchStats.finishedTotal})`
              }
            />
            {matchStatsError && (
              <Text style={styles.errorText}>Couldn't load matches: {matchStatsError}</Text>
            )}
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
  errorText: {
    color: '#e08080',
    fontSize: 12,
    paddingVertical: 8,
  },
  loadingText: {
    color: '#888',
    fontSize: 12,
    paddingVertical: 8,
  },
});
