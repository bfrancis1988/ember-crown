// app/(app)/match/[matchId].tsx
// Match board screen. Subscribes to match_sessions/{matchId} and all
// live_board_state docs for the match, then wires selection state to the
// D5/D6/D7 callables (playCardToLane, passTurn, activateCommander,
// claimMatchRewards). All errors surface as Alerts or inline banners.

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  useBoardObserver,
  type PlayTransitionEvent,
} from '../../../src/hooks/useBoardObserver';
import { LaneRow } from '../../../src/components/match/LaneRow';
import { CommanderTile } from '../../../src/components/match/CommanderTile';
import { HandFan } from '../../../src/components/match/HandFan';
import { MatchCompleteOverlay } from '../../../src/components/match/MatchCompleteOverlay';
import { SacrificeTargetSelector } from '../../../src/components/match/SacrificeTargetSelector';
import { MatchCardPreviewModal } from '../../../src/components/match/MatchCardPreviewModal';
import {
  MatchOverlayProvider,
  useMatchOverlay,
  type OverlayRect,
} from '../../../src/components/match/overlay/MatchOverlay';
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

// Release 1.1.0 — hand-to-lane flight geometry + state.
// If a flight's two signals never both arrive, this timeout aborts it so a
// card can't stay suppressed (invisible) indefinitely.
const FLIGHT_TIMEOUT_MS = 5000;

// Lane cards render at width 56 (LaneRow cardWrap) with a 6px gap; the lane
// row's label column (64) + horizontal padding (8) precede the card area.
const GHOST_LANE_CARD_W = 56;
const GHOST_LANE_CARD_GAP = 6;
const LANE_CARD_AREA_OFFSET_X = 72;

type Flight = {
  kind: 'own' | 'opponent';
  animDone: boolean;
  confirmed: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

// Approximates where a newly played card will sit so the ghost lands roughly
// aligned with the real card the moment it appears.
function computeLaneTarget(rowRect: OverlayRect, cardIndex: number): OverlayRect {
  const height = (GHOST_LANE_CARD_W * 7) / 5;
  const slot =
    LANE_CARD_AREA_OFFSET_X + cardIndex * (GHOST_LANE_CARD_W + GHOST_LANE_CARD_GAP);
  const maxX = Math.max(LANE_CARD_AREA_OFFSET_X, rowRect.width - GHOST_LANE_CARD_W - 8);
  return {
    x: rowRect.x + Math.min(slot, maxX),
    y: rowRect.y + Math.max(0, (rowRect.height - height) / 2),
    width: GHOST_LANE_CARD_W,
    height,
  };
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

  // enemy_passed: fires once when the bot has passed but the player hasn't.
  // Bot's tutorial script plays 2 cards then passes in round 1, so by the
  // time this fires the player has had 1-2 turns. Teaches the Pass button.
  useEffect(() => {
    if (!isTutorial || !user || !session) return;
    const me: Side = user.uid === session.player_b_id ? 'player_b' : 'player_a';
    const oppPassedNow =
      me === 'player_a' ? session.player_b_passed : session.player_a_passed;
    const mePassed =
      me === 'player_a' ? session.player_a_passed : session.player_b_passed;
    if (oppPassedNow && !mePassed) showTooltip('enemy_passed');
  }, [isTutorial, user, session, showTooltip]);

  // commander_activate_hint primary: fires once the player has at least one
  // unit on a lane AND their commander is still unused — the moment when
  // activating would actually do something useful.
  useEffect(() => {
    if (!isTutorial || !user || !session) return;
    const me: Side = user.uid === session.player_b_id ? 'player_b' : 'player_a';
    const used =
      me === 'player_a' ? session.player_a_commander_used : session.player_b_commander_used;
    if (used) return;
    const hasUnitOnLane = cards.some(
      (c) =>
        c.owner === me &&
        (c.location_state === 'melee' ||
          c.location_state === 'ranged' ||
          c.location_state === 'siege'),
    );
    if (hasUnitOnLane) showTooltip('commander_activate_hint');
  }, [isTutorial, user, session, cards, showTooltip]);

  // commander_activate_hint fallback: if round 2 starts and the player still
  // hasn't seen the hint (no units placed in round 1), fire it anyway.
  // Provider dedupe ensures only one of the two effects shows the tooltip.
  useEffect(() => {
    if (!isTutorial || !user || !session) return;
    if (session.current_round < 2) return;
    const me: Side = user.uid === session.player_b_id ? 'player_b' : 'player_a';
    const used =
      me === 'player_a' ? session.player_a_commander_used : session.player_b_commander_used;
    if (!used) showTooltip('commander_activate_hint');
  }, [isTutorial, user, session, showTooltip]);

  // spell_select: fires once the first time the player selects a Spell card.
  // Replaces the older curse_hint / cleanse_hint pair — one unified message
  // since the tutorial deck has 1 curse and 1 cleanse and hand-watching for
  // each class separately was fragile.
  useEffect(() => {
    if (!isTutorial || !selectedInstanceId) return;
    const card = cards.find((c) => c.instance_id === selectedInstanceId);
    if (!card) return;
    const entry = cardLibraryMap.get(card.card_id);
    if (entry?.card_type === 'Spell') showTooltip('spell_select');
  }, [isTutorial, selectedInstanceId, cards, cardLibraryMap, showTooltip]);

  // ---- Phase B: hand-to-lane flight tracking ----
  // useBoardObserver supplies hand->lane transitions; the overlay hosts the
  // flying ghost cards. Each flight carries two flags — animDone (the ghost
  // flight finished) and confirmed (Firestore shows the card in the lane) —
  // and is finalized only once both are true. clearFlight doubles as the
  // failure/timeout abort path so a card can never stay suppressed forever.
  const overlay = useMatchOverlay();
  const observation = useBoardObserver(cards);

  // View-side derivation. Null-safe so the flight hooks below can use it
  // before the guards confirm the session has loaded.
  const viewerSide: Side =
    session && user && user.uid === session.player_b_id ? 'player_b' : 'player_a';
  const opponentSide: Side = viewerSide === 'player_a' ? 'player_b' : 'player_a';

  const flightsRef = useRef<Map<string, Flight>>(new Map());
  // Opponent instance_ids no longer suppressed via the transition union —
  // populated when a flight ends (or never starts). Read during render.
  const releasedRef = useRef<Set<string>>(new Set());
  // Transitions already handed to the flight effect (idempotency guard).
  const handledTransitionRef = useRef<Set<string>>(new Set());
  // Power-delta events already turned into floating numbers (idempotency).
  const handledDeltaRef = useRef<Set<number>>(new Set());
  // Latest powerDeltas seq per instance — fed to MatchCard so its power
  // number can pulse. Persists across snapshots; folded during render below.
  const powerSeqRef = useRef<Map<string, number>>(new Map());
  const [, setFlightTick] = useState(0);
  const rerenderFlights = () => setFlightTick((t) => t + 1);

  // Finalize or abort a flight: clears the timeout, drops the ghost, and
  // releases the card so HandFan/LaneRow render it normally again.
  function clearFlight(instanceId: string) {
    const f = flightsRef.current.get(instanceId);
    if (!f) return;
    if (f.timeoutId) clearTimeout(f.timeoutId);
    flightsRef.current.delete(instanceId);
    releasedRef.current.add(instanceId);
    overlay.removeGhost(instanceId);
    rerenderFlights();
  }

  function markAnimDone(instanceId: string) {
    const f = flightsRef.current.get(instanceId);
    if (!f) return;
    f.animDone = true;
    if (f.confirmed) clearFlight(instanceId);
  }

  function markConfirmed(instanceId: string) {
    const f = flightsRef.current.get(instanceId);
    if (!f) return;
    f.confirmed = true;
    if (f.animDone) clearFlight(instanceId);
  }

  function releaseTransition(instanceId: string) {
    releasedRef.current.add(instanceId);
    rerenderFlights();
  }

  // Own play: measure the hand card + target lane, spawn a ghost, open a
  // flight. Best-effort — silently no-ops for spells or missing measurements,
  // leaving the play to render without animation.
  async function beginOwnFlight(instanceId: string, lane: Lane) {
    if (flightsRef.current.has(instanceId)) return;
    const card = cards.find((c) => c.instance_id === instanceId);
    const entry = card ? cardLibraryMap.get(card.card_id) : undefined;
    if (!card || !entry || entry.card_type !== 'Unit') return;
    const from = await overlay.measureNode(`card:${instanceId}`);
    const rowRect = await overlay.measureNode(`lane:${viewerSide}:${lane}`);
    if (!from || !rowRect || flightsRef.current.has(instanceId)) return;
    const laneCount = cards.filter(
      (c) => c.owner === viewerSide && c.location_state === lane.toLowerCase(),
    ).length;
    const to = computeLaneTarget(rowRect, laneCount);
    const factionColor = factionColorMap.get(entry.faction) ?? FALLBACK_FACTION_COLOR;
    const timeoutId = setTimeout(() => clearFlight(instanceId), FLIGHT_TIMEOUT_MS);
    flightsRef.current.set(instanceId, {
      kind: 'own',
      animDone: false,
      confirmed: false,
      timeoutId,
    });
    rerenderFlights();
    overlay.flyCard({
      instanceId,
      card,
      entry,
      factionColor,
      from,
      to,
      onAnimComplete: () => markAnimDone(instanceId),
    });
  }

  // Opponent play: detected from a hand->lane transition, so already
  // Firestore-confirmed. The ghost flies in from the opponent's commander tile.
  async function startOpponentFlight(t: PlayTransitionEvent) {
    if (flightsRef.current.has(t.instanceId) || releasedRef.current.has(t.instanceId)) {
      return;
    }
    const card = cards.find((c) => c.instance_id === t.instanceId);
    const entry = card ? cardLibraryMap.get(card.card_id) : undefined;
    if (!card || !entry) {
      releaseTransition(t.instanceId);
      return;
    }
    const from = await overlay.measureNode(`commander:${t.owner}`);
    const rowRect = await overlay.measureNode(`lane:${t.owner}:${t.lane}`);
    if (!from || !rowRect) {
      releaseTransition(t.instanceId);
      return;
    }
    if (flightsRef.current.has(t.instanceId)) return;
    // The snapshot already includes the new card; it lands in the last slot.
    const laneCount = cards.filter(
      (c) => c.owner === t.owner && c.location_state === t.lane.toLowerCase(),
    ).length;
    const to = computeLaneTarget(rowRect, Math.max(0, laneCount - 1));
    const factionColor = factionColorMap.get(entry.faction) ?? FALLBACK_FACTION_COLOR;
    const timeoutId = setTimeout(() => clearFlight(t.instanceId), FLIGHT_TIMEOUT_MS);
    flightsRef.current.set(t.instanceId, {
      kind: 'opponent',
      animDone: false,
      confirmed: true,
      timeoutId,
    });
    rerenderFlights();
    overlay.flyCard({
      instanceId: t.instanceId,
      card,
      entry,
      factionColor,
      from,
      to,
      onAnimComplete: () => markAnimDone(t.instanceId),
    });
  }

  // Drain each board snapshot's hand->lane transitions exactly once: opponent
  // plays start a ghost; own plays mark their in-flight ghost confirmed.
  useEffect(() => {
    for (const t of observation.playTransitions) {
      if (handledTransitionRef.current.has(t.instanceId)) continue;
      handledTransitionRef.current.add(t.instanceId);
      if (t.owner === viewerSide) {
        markConfirmed(t.instanceId);
      } else {
        void startOpponentFlight(t);
      }
    }
    // `observation` identity changes once per board snapshot; viewerSide and
    // the card maps are read fresh from that snapshot's render closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observation]);

  // ---- Phase B: damage/heal floating numbers ----
  // Every lane-card power change from useBoardObserver becomes one floating
  // number. The overlay resolves the card's screen position and fans out
  // rapid multi-hits (combat resolution, chained burns) via a stacking offset.
  useEffect(() => {
    for (const d of observation.powerDeltas) {
      if (handledDeltaRef.current.has(d.seq)) continue;
      handledDeltaRef.current.add(d.seq);
      void overlay.spawnDamageNumber({ instanceId: d.instanceId, delta: d.delta });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observation]);

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
  // viewerSide / opponentSide are derived earlier — the flight hooks need them.

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
    // Kick off the hand-to-lane ghost in parallel with the callable. The
    // callable is the source of truth; the animation is purely additive.
    void beginOwnFlight(instanceId, lane);
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
      // Play rejected — abort the ghost; the card stays in hand.
      clearFlight(instanceId);
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

  // Cards represented by a flying ghost — HandFan/LaneRow skip their own
  // render of these so only the ghost shows. Opponent transitions are folded
  // in here, during render, so the real card never flickers in for a frame
  // before its ghost takes over.
  const suppressedIds = new Set<string>(flightsRef.current.keys());
  for (const t of observation.playTransitions) {
    if (t.owner === opponentSide && !releasedRef.current.has(t.instanceId)) {
      suppressedIds.add(t.instanceId);
    }
  }

  // Fold this snapshot's power deltas into the persistent per-instance seq
  // map (idempotent — the same observation always yields the same seqs).
  for (const d of observation.powerDeltas) {
    powerSeqRef.current.set(d.instanceId, d.seq);
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
            suppressedIds={suppressedIds}
            powerSeq={powerSeqRef.current}
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
            suppressedIds={suppressedIds}
            powerSeq={powerSeqRef.current}
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
          suppressedIds={suppressedIds}
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
  //
  // MatchOverlayProvider hosts the Phase B animation layer (flying ghost cards,
  // floating damage numbers) as a touch-transparent screen-root sibling.
  return (
    <TutorialTooltipProvider>
      <MatchOverlayProvider>
        <MatchScreenInner />
        <TutorialTooltipOverlay />
      </MatchOverlayProvider>
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
