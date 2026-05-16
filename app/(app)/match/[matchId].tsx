// app/(app)/match/[matchId].tsx
// Match board screen. Subscribes to match_sessions/{matchId} and all
// live_board_state docs for the match, then wires selection state to the
// D5/D6/D7 callables (playCardToLane, passTurn, activateCommander,
// claimMatchRewards). All errors surface as Alerts or inline banners.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../../src/contexts/AuthContext';
import { db, functions } from '../../../src/lib/firebase';
import { Analytics, fireOnceAnalyticsEvent } from '../../../src/lib/analytics';
import { usePlayerProfile } from '../../../src/hooks/usePlayerProfile';
import { FACTIONS } from '../../../src/lib/factions';
import { type Lane } from '../../../src/lib/matchConstants';
import { useMatchSession } from '../../../src/hooks/useMatchSession';
import { useMatchBoardState } from '../../../src/hooks/useMatchBoardState';
import { LaneRow } from '../../../src/components/match/LaneRow';
import { CommanderTile } from '../../../src/components/match/CommanderTile';
import { HandFan } from '../../../src/components/match/HandFan';
import { MatchCompleteOverlay } from '../../../src/components/match/MatchCompleteOverlay';
import { SacrificeTargetSelector } from '../../../src/components/match/SacrificeTargetSelector';
import { MatchCardPreviewModal } from '../../../src/components/match/MatchCardPreviewModal';
import {
  TutorialTooltipProvider,
  useTutorialTooltips,
} from '../../../src/components/tutorial/TutorialTooltipProvider';
import { TutorialTooltipOverlay } from '../../../src/components/tutorial/TutorialTooltipOverlay';
import type { CardLibraryEntry } from '../../../src/types/card';
import type { CommanderEntry } from '../../../src/types/commander';
import type { LiveBoardState } from '../../../src/types/board';
import type { MatchSession, Side } from '../../../src/types/match';
import type {
  ClaimMatchRewardsResult,
  ClaimMatchRewardsWithAdResult,
  RecordCampaignWinResult,
} from '../../../src/types/matchActions';

// Mirrored lane order: top-down on each side. The "front line" sits between
// each side's Melee row, so opponent's Melee is across from player's Melee.
const PLAYER_LANE_ORDER: Lane[] = ['Melee', 'Ranged', 'Siege'];
const OPPONENT_LANE_ORDER: Lane[] = ['Siege', 'Ranged', 'Melee'];

type CompleteTutorialResult = {
  success: true;
  coins_earned: number;
  shards_earned: number;
  keys_earned: number;
  skipped: boolean;
};

const FALLBACK_FACTION_COLOR = '#555';

function buildFactionColorMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of FACTIONS) m.set(f.id, f.color);
  return m;
}

function laneTotal(
  side: Side,
  lane: Lane,
  cards: LiveBoardState[],
  session: MatchSession,
): number {
  const inLane = cards.filter(
    (c) => c.owner === side && c.location_state === lane.toLowerCase(),
  );
  let total = inLane.reduce((s, c) => s + c.current_power, 0);
  const activeLane =
    side === 'player_a'
      ? session.player_a_commander_active_lane
      : session.player_b_commander_active_lane;
  if (activeLane === lane) total += inLane.length;
  return total;
}

function laneDebuffed(side: Side, lane: Lane, session: MatchSession): boolean {
  const key = `${side}_${lane.toLowerCase()}_debuffed` as keyof MatchSession;
  return Boolean(session[key]);
}

function MatchScreenInner() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = usePlayerProfile();

  const { session, isLoading: sessionLoading, error: sessionError } =
    useMatchSession(matchId ?? null);
  const { cards, isLoading: cardsLoading } = useMatchBoardState(matchId ?? null);

  const [cardLibraryMap, setCardLibraryMap] = useState<Map<string, CardLibraryEntry>>(
    new Map(),
  );
  const [commanderMap, setCommanderMap] = useState<Map<string, CommanderEntry>>(
    new Map(),
  );

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Phase 9.4.2B — Ritual sacrifice picker. Holds the in-flight play
  // intent (instanceId + lane) until the player picks a target or skips.
  const [pendingRitual, setPendingRitual] = useState<{
    instanceId: string;
    lane: Lane;
    cardName: string;
  } | null>(null);

  // Update 1 — long-press preview modal. Holds the instance_id of the card
  // being previewed (read-only view; no mutation of selection state).
  const [previewInstanceId, setPreviewInstanceId] = useState<string | null>(null);

  const factionColorMap = useMemo(buildFactionColorMap, []);

  // One-time fetch of every card_library entry referenced by the live board.
  // Re-runs whenever a brand-new card_id appears (e.g., end-of-round draw).
  // Phase 9.4.2B — Swarm-spawned tokens carry their display data inline on
  // token_data; synthesise a CardLibraryEntry for each so render code can
  // treat them uniformly with real cards.
  useEffect(() => {
    if (cards.length === 0) return;

    // 1. Synthesise lib entries for tokens that aren't yet in the map.
    const tokenSynth: Array<[string, CardLibraryEntry]> = [];
    for (const c of cards) {
      if (!c.is_token || !c.token_data) continue;
      if (cardLibraryMap.has(c.card_id)) continue;
      const synthetic: CardLibraryEntry = {
        card_id: c.card_id,
        card_name: c.token_data.card_name,
        card_type: 'Unit',
        faction: c.token_data.faction,
        rarity: 'Common',
        base_power: c.token_data.base_power,
        image_url: '',
        keywords: [],
        keyword_params: {},
        // Display label comes from token_data.klass (e.g. 'Swarm', 'Brood').
        // Cast through UnitKlass — UI just renders the string.
        klass: (c.token_data.klass ?? 'Warrior') as 'Warrior',
        optimal_lane: 'Melee',
        race: 'Token',
      };
      tokenSynth.push([c.card_id, synthetic]);
    }

    // 2. Real card_ids that need a Firestore fetch.
    const missing = cards
      .filter((c) => !c.is_token)
      .map((c) => c.card_id)
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .filter((id) => !cardLibraryMap.has(id));

    if (tokenSynth.length === 0 && missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const fetched: Array<[string, CardLibraryEntry]> = [];
      if (missing.length > 0) {
        await Promise.all(
          missing.map(async (id) => {
            try {
              const snap = await getDoc(doc(db, 'card_library', id));
              if (snap.exists()) {
                fetched.push([id, snap.data() as CardLibraryEntry]);
              }
            } catch (err) {
              console.warn('card_library fetch failed', id, err);
            }
          }),
        );
      }
      if (cancelled || (tokenSynth.length === 0 && fetched.length === 0)) return;
      setCardLibraryMap((prev) => {
        const next = new Map(prev);
        for (const [id, entry] of tokenSynth) next.set(id, entry);
        for (const [id, entry] of fetched) next.set(id, entry);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [cards, cardLibraryMap]);

  // One-time fetch of both commander_library entries.
  useEffect(() => {
    if (!session) return;
    const ids = [session.player_a_commander_id, session.player_b_commander_id].filter(
      (id) => id && !commanderMap.has(id),
    );
    if (ids.length === 0) return;

    let cancelled = false;
    (async () => {
      const fetched: Array<[string, CommanderEntry]> = [];
      await Promise.all(
        ids.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'commander_library', id));
            if (snap.exists()) {
              fetched.push([id, snap.data() as CommanderEntry]);
            }
          } catch (err) {
            console.warn('commander_library fetch failed', id, err);
          }
        }),
      );
      if (cancelled || fetched.length === 0) return;
      setCommanderMap((prev) => {
        const next = new Map(prev);
        for (const [id, entry] of fetched) next.set(id, entry);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [session, commanderMap]);

  // ---- tutorial tooltip triggers ----
  // Always inside the provider; gated on tutorial mode so solo matches see no
  // tooltips. shownTriggers de-dupes within a session, so each useEffect can
  // re-fire safely on every render once its condition holds.
  const { showTooltip } = useTutorialTooltips();
  const isTutorial = session?.mode === 'tutorial';

  // match_start: fires once when the tutorial match becomes available.
  useEffect(() => {
    if (isTutorial) showTooltip('match_start');
  }, [isTutorial, showTooltip]);

  // optimal_lane_select: fires once the first time the player selects a Unit
  // card. Teaches the green-glow optimal-lane hint before they pick a lane.
  useEffect(() => {
    if (!isTutorial || !selectedInstanceId) return;
    const card = cards.find((c) => c.instance_id === selectedInstanceId);
    if (!card) return;
    const entry = cardLibraryMap.get(card.card_id);
    if (entry?.card_type === 'Unit') showTooltip('optimal_lane_select');
  }, [isTutorial, selectedInstanceId, cards, cardLibraryMap, showTooltip]);

  // first_card_played: fires the first time any of the player's cards reaches a lane.
  useEffect(() => {
    if (!isTutorial || !user || !session) return;
    const me: Side = user.uid === session.player_b_id ? 'player_b' : 'player_a';
    const anyInLane = cards.some(
      (c) =>
        c.owner === me &&
        (c.location_state === 'melee' ||
          c.location_state === 'ranged' ||
          c.location_state === 'siege'),
    );
    if (anyInLane) showTooltip('first_card_played');
  }, [isTutorial, user, session, cards, showTooltip]);

  // first_optimal_lane_bonus: fires once when the player plays a Unit in its
  // optimal lane. Provider's shownTriggers Set guarantees once-per-match.
  useEffect(() => {
    if (!isTutorial || !user || !session) return;
    const me: Side = user.uid === session.player_b_id ? 'player_b' : 'player_a';
    for (const card of cards) {
      if (card.owner !== me) continue;
      const loc = card.location_state;
      if (loc !== 'melee' && loc !== 'ranged' && loc !== 'siege') continue;
      const entry = cardLibraryMap.get(card.card_id);
      if (!entry || entry.card_type !== 'Unit') continue;
      if (entry.optimal_lane && entry.optimal_lane.toLowerCase() === loc) {
        showTooltip('first_optimal_lane_bonus');
        break;
      }
    }
  }, [isTutorial, user, session, cards, cardLibraryMap, showTooltip]);

  // first_round_ended: fires when round transitions past 1.
  useEffect(() => {
    if (!isTutorial || !session) return;
    if (session.current_round >= 2) showTooltip('first_round_ended');
  }, [isTutorial, session, showTooltip]);

  // commander_activate_hint: fires from round 2 onward while commander is unused.
  useEffect(() => {
    if (!isTutorial || !user || !session) return;
    if (session.current_round < 2) return;
    const me: Side = user.uid === session.player_b_id ? 'player_b' : 'player_a';
    const used =
      me === 'player_a' ? session.player_a_commander_used : session.player_b_commander_used;
    if (!used) showTooltip('commander_activate_hint');
  }, [isTutorial, user, session, showTooltip]);

  // curse_hint: fires the first time a curse appears in the player's hand.
  useEffect(() => {
    if (!isTutorial || !user || !session) return;
    const me: Side = user.uid === session.player_b_id ? 'player_b' : 'player_a';
    for (const card of cards) {
      if (card.owner !== me || card.location_state !== 'hand') continue;
      const entry = cardLibraryMap.get(card.card_id);
      if (entry?.card_type === 'Spell' && entry.klass === 'Curse') {
        showTooltip('curse_hint');
        break;
      }
    }
  }, [isTutorial, user, session, cards, cardLibraryMap, showTooltip]);

  // cleanse_hint: fires the first time a cleanse appears in the player's hand.
  useEffect(() => {
    if (!isTutorial || !user || !session) return;
    const me: Side = user.uid === session.player_b_id ? 'player_b' : 'player_a';
    for (const card of cards) {
      if (card.owner !== me || card.location_state !== 'hand') continue;
      const entry = cardLibraryMap.get(card.card_id);
      if (entry?.card_type === 'Spell' && entry.klass === 'Cleanse') {
        showTooltip('cleanse_hint');
        break;
      }
    }
  }, [isTutorial, user, session, cards, cardLibraryMap, showTooltip]);

  // ---- guards ----

  if (sessionLoading || (session && cardsLoading)) {
    return (
      <View style={styles.centeredScreen}>
        <ActivityIndicator size="large" color="#d4a04a" />
        <Text style={styles.statusText}>Loading match…</Text>
      </View>
    );
  }

  if (sessionError || !session) {
    return (
      <View style={styles.centeredScreen}>
        <Text style={styles.statusText}>{sessionError ?? 'Match not found.'}</Text>
        <TouchableOpacity
          style={styles.returnButton}
          onPress={() => router.replace('/home')}
        >
          <Text style={styles.returnButtonText}>Return Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (user && user.uid !== session.player_a_id && user.uid !== session.player_b_id) {
    return (
      <View style={styles.centeredScreen}>
        <Text style={styles.statusText}>You are not a participant in this match.</Text>
        <TouchableOpacity
          style={styles.returnButton}
          onPress={() => router.replace('/home')}
        >
          <Text style={styles.returnButtonText}>Return Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---- view-side derivation ----

  const viewerSide: Side =
    user && user.uid === session.player_b_id ? 'player_b' : 'player_a';
  const opponentSide: Side = viewerSide === 'player_a' ? 'player_b' : 'player_a';

  const isPlayerTurn =
    session.status === 'in_progress' && session.active_turn === viewerSide;
  const myPassed =
    viewerSide === 'player_a' ? session.player_a_passed : session.player_b_passed;

  const myHand = cards.filter(
    (c) => c.owner === viewerSide && c.location_state === 'hand',
  );
  const oppHand = cards.filter(
    (c) => c.owner === opponentSide && c.location_state === 'hand',
  );
  const cardsBySideAndLane = (side: Side, lane: Lane) =>
    cards.filter(
      (c) => c.owner === side && c.location_state === lane.toLowerCase(),
    );

  const myVp = viewerSide === 'player_a' ? session.player_a_wins : session.player_b_wins;
  const oppVp = viewerSide === 'player_a' ? session.player_b_wins : session.player_a_wins;

  const myCommanderId =
    viewerSide === 'player_a' ? session.player_a_commander_id : session.player_b_commander_id;
  const oppCommanderId =
    viewerSide === 'player_a' ? session.player_b_commander_id : session.player_a_commander_id;
  const myCommander = commanderMap.get(myCommanderId) ?? null;
  const oppCommander = commanderMap.get(oppCommanderId) ?? null;

  const myCommanderActiveLane =
    viewerSide === 'player_a'
      ? session.player_a_commander_active_lane
      : session.player_b_commander_active_lane;
  const oppCommanderActiveLane =
    viewerSide === 'player_a'
      ? session.player_b_commander_active_lane
      : session.player_a_commander_active_lane;
  const myCommanderUsed =
    viewerSide === 'player_a' ? session.player_a_commander_used : session.player_b_commander_used;
  const oppCommanderUsed =
    viewerSide === 'player_a' ? session.player_b_commander_used : session.player_a_commander_used;
  const oppPassed =
    viewerSide === 'player_a' ? session.player_b_passed : session.player_a_passed;

  const myCommanderColor = myCommander
    ? factionColorMap.get(myCommander.faction) ?? FALLBACK_FACTION_COLOR
    : FALLBACK_FACTION_COLOR;
  const oppCommanderColor = oppCommander
    ? factionColorMap.get(oppCommander.faction) ?? FALLBACK_FACTION_COLOR
    : FALLBACK_FACTION_COLOR;

  // ---- selection-driven lane targetability ----

  const selectedCard = selectedInstanceId
    ? cards.find((c) => c.instance_id === selectedInstanceId) ?? null
    : null;
  const selectedEntry = selectedCard
    ? cardLibraryMap.get(selectedCard.card_id) ?? null
    : null;

  function laneTappableFor(owner: Side): boolean {
    if (!isPlayerTurn) return false;
    if (myPassed) return false;
    if (!selectedInstanceId || !selectedEntry) return false;
    if (actionLoading) return false;
    if (selectedEntry.card_type === 'Spell') {
      if (selectedEntry.klass === 'Cleanse') return owner === viewerSide;
      if (selectedEntry.klass === 'Curse') return owner === opponentSide;
      return false;
    }
    // Unit
    return owner === viewerSide;
  }

  // Update 1: highlight the selected Unit's optimal lane on the viewer's side.
  // Spells return false (they don't have an optimal_lane). Opponent rows always
  // return false because the optimal-lane bonus is a "play here" hint for you.
  function laneIsOptimalForSelected(lane: Lane, ownerSide: Side): boolean {
    if (!selectedEntry || selectedEntry.card_type !== 'Unit') return false;
    if (ownerSide !== viewerSide) return false;
    return selectedEntry.optimal_lane === lane;
  }

  // ---- action handlers ----

  async function handlePlayCard(
    instanceId: string,
    lane: Lane,
    sacrificeTargetInstanceId: string | null = null,
  ) {
    if (!matchId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const fn = httpsCallable(functions, 'playCardToLane');
      await fn({
        matchId,
        instanceId,
        targetLane: lane,
        sacrificeTargetInstanceId,
      });
      setSelectedInstanceId(null);
      setPendingRitual(null);
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to play card.';
      setActionError(msg);
      Alert.alert('Play failed', msg);
    } finally {
      setActionLoading(false);
    }
  }

  // Phase 9.4.2B — when the player taps a lane with a Ritual card selected,
  // route through the sacrifice picker (mode='optional_single') OR
  // pass-through directly to handlePlayCard (mode='all_in_lane' or no Ritual).
  function handleLaneTap(instanceId: string, lane: Lane) {
    const card = cards.find((c) => c.instance_id === instanceId);
    if (!card) return;
    const entry = cardLibraryMap.get(card.card_id);
    const hasRitual =
      entry?.card_type === 'Unit' && entry.keywords?.includes('ritual');
    if (!hasRitual) {
      handlePlayCard(instanceId, lane);
      return;
    }
    const ritualParams = (entry.keyword_params?.ritual ?? {}) as { mode?: string };
    if (ritualParams.mode === 'all_in_lane') {
      handlePlayCard(instanceId, lane);
      return;
    }
    setPendingRitual({ instanceId, lane, cardName: entry.card_name });
  }

  async function handlePass() {
    if (!matchId) return;
    if (isTutorial) showTooltip('first_pass');
    setActionLoading(true);
    setActionError(null);
    try {
      const fn = httpsCallable(functions, 'passTurn');
      await fn({ matchId });
      setSelectedInstanceId(null);
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to pass.';
      setActionError(msg);
      Alert.alert('Pass failed', msg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleActivateCommander() {
    if (!matchId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const fn = httpsCallable(functions, 'activateCommander');
      await fn({ matchId });
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to activate commander.';
      setActionError(msg);
      Alert.alert('Activate failed', msg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaim(): Promise<ClaimMatchRewardsResult> {
    if (!matchId) throw new Error('Missing matchId');
    const fn = httpsCallable(functions, 'claimMatchRewards');
    const result = await fn({ matchId });
    return result.data as ClaimMatchRewardsResult;
  }

  async function handleCompleteTutorial(): Promise<CompleteTutorialResult> {
    const fn = httpsCallable<{ skipped: boolean }, CompleteTutorialResult>(
      functions,
      'completeTutorial',
    );
    const result = await fn({ skipped: false });
    Analytics.tutorialComplete();
    return result.data;
  }

  async function handleClaimCampaign(): Promise<RecordCampaignWinResult> {
    if (!matchId) throw new Error('Missing matchId');
    const fn = httpsCallable<{ match_id: string }, RecordCampaignWinResult>(
      functions,
      'recordCampaignWin',
    );
    const result = await fn({ match_id: matchId });
    if (user && result.data?.is_first_win) {
      const faction = profile?.active_faction ?? 'unknown';
      fireOnceAnalyticsEvent(user.uid, 'first_campaign_win', () =>
        Analytics.firstCampaignWin(faction),
      ).catch(() => {/* best-effort */});
    }
    return result.data;
  }

  async function handleClaimWithAd(): Promise<ClaimMatchRewardsWithAdResult> {
    if (!matchId) throw new Error('Missing matchId');
    const fn = httpsCallable<{ match_id: string }, ClaimMatchRewardsWithAdResult>(
      functions,
      'claimMatchRewardsWithAd',
    );
    const result = await fn({ match_id: matchId });
    return result.data;
  }

  function handleRetreat() {
    Alert.alert(
      'Retreat?',
      'Leaving the match will not update Firestore yet — the match becomes orphaned. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retreat',
          style: 'destructive',
          onPress: () => router.replace('/home'),
        },
      ],
    );
  }

  function handleSelectHandCard(instanceId: string) {
    if (!isPlayerTurn || myPassed || actionLoading) return;
    setSelectedInstanceId((prev) => (prev === instanceId ? null : instanceId));
  }

  // ---- render ----

  const showOverlay = session.status === 'game_over';
  const passDisabled = !isPlayerTurn || myPassed || actionLoading;
  const commanderActivatable =
    isPlayerTurn && !myPassed && !myCommanderUsed && !actionLoading;

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarText}>Round {session.current_round}</Text>
        <Text style={styles.topBarText}>
          VP {myVp} – {oppVp}
        </Text>
        <TouchableOpacity onPress={handleRetreat} hitSlop={10}>
          <Text style={styles.retreatText}>Retreat</Text>
        </TouchableOpacity>
      </View>

      {/* Turn / error banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          {actionLoading
            ? 'Working…'
            : myPassed
              ? 'You passed — waiting on opponent'
              : isPlayerTurn
                ? selectedInstanceId
                  ? 'Tap a lane to play'
                  : 'Your turn — tap a card or pass'
                : 'Opponent thinking…'}
        </Text>
        {actionError ? <Text style={styles.bannerError}>{actionError}</Text> : null}
      </View>

      <ScrollView style={styles.boardScroll} contentContainerStyle={styles.boardContent}>
        {/* Opponent commander tile */}
        <CommanderTile
          commanderId={oppCommanderId}
          commander={oppCommander}
          factionColor={oppCommanderColor}
          usedFlag={oppCommanderUsed}
          activeLane={oppCommanderActiveLane}
          viewerSide={viewerSide}
          thisSide={opponentSide}
          handCount={oppHand.length}
          hasPassed={oppPassed}
        />

        {/* Opponent lanes (top-down: Siege, Ranged, Melee) */}
        {OPPONENT_LANE_ORDER.map((lane) => (
          <LaneRow
            key={`opp-${lane}`}
            lane={lane}
            owner={opponentSide}
            viewerSide={viewerSide}
            cards={cardsBySideAndLane(opponentSide, lane)}
            cardLibraryMap={cardLibraryMap}
            factionColorMap={factionColorMap}
            laneTotal={laneTotal(opponentSide, lane, cards, session)}
            isDebuffed={laneDebuffed(opponentSide, lane, session)}
            isCommanderActive={oppCommanderActiveLane === lane}
            isTappable={laneTappableFor(opponentSide)}
            isOptimalForSelected={laneIsOptimalForSelected(lane, opponentSide)}
            onTapLane={() => {
              if (selectedInstanceId) handleLaneTap(selectedInstanceId, lane);
            }}
          />
        ))}

        {/* Front line divider */}
        <View style={styles.frontLine}>
          <View style={styles.frontLineBar} />
          <Text style={styles.frontLineText}>FRONT LINE</Text>
          <View style={styles.frontLineBar} />
        </View>

        {/* Player lanes (top-down: Melee, Ranged, Siege) */}
        {PLAYER_LANE_ORDER.map((lane) => (
          <LaneRow
            key={`me-${lane}`}
            lane={lane}
            owner={viewerSide}
            viewerSide={viewerSide}
            cards={cardsBySideAndLane(viewerSide, lane)}
            cardLibraryMap={cardLibraryMap}
            factionColorMap={factionColorMap}
            laneTotal={laneTotal(viewerSide, lane, cards, session)}
            isDebuffed={laneDebuffed(viewerSide, lane, session)}
            isCommanderActive={myCommanderActiveLane === lane}
            isTappable={laneTappableFor(viewerSide)}
            isOptimalForSelected={laneIsOptimalForSelected(lane, viewerSide)}
            onTapLane={() => {
              if (selectedInstanceId) handleLaneTap(selectedInstanceId, lane);
            }}
          />
        ))}

        {/* Player commander + Pass row */}
        <View style={styles.commanderRow}>
          <View style={styles.commanderRowLeft}>
            <CommanderTile
              commanderId={myCommanderId}
              commander={myCommander}
              factionColor={myCommanderColor}
              usedFlag={myCommanderUsed}
              activeLane={myCommanderActiveLane}
              viewerSide={viewerSide}
              thisSide={viewerSide}
              handCount={myHand.length}
              hasPassed={myPassed}
              onActivate={commanderActivatable ? handleActivateCommander : undefined}
            />
          </View>
          <TouchableOpacity
            style={[styles.passButton, passDisabled && styles.disabled]}
            onPress={handlePass}
            disabled={passDisabled}
          >
            <Text style={styles.passButtonText}>PASS</Text>
          </TouchableOpacity>
        </View>

        {/* Player hand */}
        <HandFan
          cards={myHand}
          cardLibraryMap={cardLibraryMap}
          factionColorMap={factionColorMap}
          selectedInstanceId={selectedInstanceId}
          onSelectCard={handleSelectHandCard}
          isPlayerTurn={isPlayerTurn && !myPassed && !actionLoading}
          onLongPressCard={setPreviewInstanceId}
        />
      </ScrollView>

      {showOverlay ? (
        <MatchCompleteOverlay
          session={session}
          viewerSide={viewerSide}
          onClaim={handleClaim}
          onCompleteTutorial={handleCompleteTutorial}
          onClaimCampaign={handleClaimCampaign}
          onClaimWithAd={handleClaimWithAd}
          onReturnHome={() => router.replace('/home')}
          onReturnToCampaign={() => router.replace('/campaign')}
          onReturnToBattleHub={() => router.replace('/battle')}
          onBattleAgain={() => router.replace('/battle-mode')}
        />
      ) : null}

      <SacrificeTargetSelector
        visible={pendingRitual !== null}
        playedCard={
          pendingRitual
            ? { instance_id: pendingRitual.instanceId, card_name: pendingRitual.cardName }
            : null
        }
        candidates={cards.filter(
          (c) =>
            c.owner === viewerSide &&
            (c.location_state === 'melee' ||
              c.location_state === 'ranged' ||
              c.location_state === 'siege'),
        )}
        cardLibraryMap={cardLibraryMap}
        factionColorMap={factionColorMap}
        onSelect={(targetId) => {
          if (!pendingRitual) return;
          handlePlayCard(pendingRitual.instanceId, pendingRitual.lane, targetId);
        }}
        onCancel={() => setPendingRitual(null)}
      />

      {/* Update 1 — long-press preview. Derive entry + faction color here so
          the modal stays a thin presentational component. */}
      {(() => {
        const previewCard = previewInstanceId
          ? cards.find((c) => c.instance_id === previewInstanceId) ?? null
          : null;
        const previewEntry = previewCard
          ? cardLibraryMap.get(previewCard.card_id) ?? null
          : null;
        const previewFactionColor = previewEntry
          ? factionColorMap.get(previewEntry.faction) ?? FALLBACK_FACTION_COLOR
          : FALLBACK_FACTION_COLOR;
        return (
          <MatchCardPreviewModal
            visible={previewInstanceId !== null}
            onClose={() => setPreviewInstanceId(null)}
            cardLibraryEntry={previewEntry}
            liveBoardState={previewCard}
            factionColor={previewFactionColor}
          />
        );
      })()}
    </View>
  );
}

export default function MatchScreen() {
  // Provider always wraps; tooltip useEffects inside MatchScreenInner gate on
  // session.mode === 'tutorial', so solo matches see no tooltips. The overlay
  // returns null when no trigger is active.
  return (
    <TutorialTooltipProvider>
      <MatchScreenInner />
      <TutorialTooltipOverlay />
    </TutorialTooltipProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0e0e0e',
  },
  centeredScreen: {
    flex: 1,
    backgroundColor: '#0e0e0e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  statusText: {
    color: '#bbb',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  returnButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#d4a04a',
  },
  returnButtonText: {
    color: '#111',
    fontWeight: '700',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: '#181818',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  topBarText: {
    color: '#f5e7c2',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  retreatText: {
    color: '#e05a5a',
    fontSize: 13,
    fontWeight: '600',
  },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#141414',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  bannerText: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
  },
  bannerError: {
    color: '#e05a5a',
    fontSize: 11,
    marginTop: 2,
  },
  boardScroll: {
    flex: 1,
  },
  boardContent: {
    paddingBottom: 24,
  },
  frontLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  frontLineBar: {
    flex: 1,
    height: 1,
    backgroundColor: '#3a2c12',
  },
  frontLineText: {
    color: '#d4a04a',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    paddingHorizontal: 10,
  },
  commanderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  commanderRowLeft: {
    flex: 1,
  },
  passButton: {
    marginRight: 8,
    marginTop: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a2c12',
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 76,
  },
  passButtonText: {
    color: '#d4a04a',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  disabled: {
    opacity: 0.4,
  },
});
