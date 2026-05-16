// functions/src/match/initializeNewMatch.ts
// Callable: starts a new solo match against the AI bot.
//
// Reads:  player_profiles/{uid}, player_active_decks/{uid}/slots/*,
//         card_library/{card_id} (bot pool + base_power lookup),
//         commander_library/{commander_id} (bot pick).
// Writes: match_sessions/{matchId} + 30 live_board_state/{instance_id} docs
//         in a single batch.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { makeInitialMatchSession } from '../types/match';
import { AI_BOT_UID, DECK_SIZE, type Lane } from '../lib/matchConstants';
import {
  buildBotDeckCardIds,
  pickBotCommander,
  buildBoardStateDocs,
  pickFirstTurn,
  getPlayerBestOwnedRarity,
  getPlayerActiveDeckMaxRarity,
} from './buildMatch';
import { executeAITurnInternal } from './executeAITurn';
import { resolveBattleOpponent } from './findBattleOpponent';
import {
  TUTORIAL_PLAYER_DECK_CARD_IDS,
  TUTORIAL_BOT_DECK_CARD_IDS,
  TUTORIAL_BOT_COMMANDER_ID,
  TUTORIAL_BOT_SCRIPTED_ACTIONS,
} from '../lib/tutorialDecks';
import type { InitializeNewMatchResult } from '../types/actions';
import type { CampaignStage } from '../types/campaign';
import type { SavedDeck } from '../types/savedDeck';

type InitializeNewMatchInput = {
  mode?: 'solo' | 'tutorial' | 'campaign' | 'battle_mode';
  stage_id?: string;
  // Battle Mode: deck_id of the player's saved deck. Required when
  // mode === 'battle_mode'.
  player_deck_id?: string;
};

export const initializeNewMatch = onCall<InitializeNewMatchInput, Promise<InitializeNewMatchResult>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in to start a match.');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    const mode = request.data?.mode ?? 'solo';
    const requestedStageId = request.data?.stage_id;

    // 1. Profile
    const profileSnap = await db.collection('player_profiles').doc(uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError('failed-precondition', 'Player profile not found.');
    }
    const profile = profileSnap.data()!;
    if (!profile.active_faction || !profile.selected_commander) {
      throw new HttpsError('failed-precondition', 'Faction and commander must be set.');
    }
    if ((profile.onboarding_step ?? 0) < 4) {
      throw new HttpsError('failed-precondition', 'Onboarding not complete.');
    }

    let playerACardIds: string[];
    let playerBCardIds: string[];
    let playerACommanderId: string;
    let botCommanderId: string;
    let campaignStage: CampaignStage | null = null;
    // Phase 9.4.5C: opponent metadata persisted on the match session for
    // mode='battle_mode'. Lets the post-match UI show the deck the player
    // faced + the anonymized opponent name.
    let battleOpponentDeck: SavedDeck | null = null;
    let battleOpponentDisplayName: string | null = null;

    if (mode === 'tutorial') {
      if (profile.tutorial_completed) {
        throw new HttpsError('failed-precondition', 'Tutorial already completed.');
      }
      // Tutorial uses curated decks; player's active_deck is ignored.
      playerACardIds = [...TUTORIAL_PLAYER_DECK_CARD_IDS];
      playerBCardIds = [...TUTORIAL_BOT_DECK_CARD_IDS];
      // Both sides use the same Vanguard commander for a deterministic teach-flow.
      playerACommanderId = TUTORIAL_BOT_COMMANDER_ID;
      botCommanderId = TUTORIAL_BOT_COMMANDER_ID;
    } else if (mode === 'campaign') {
      if (!requestedStageId) {
        throw new HttpsError('invalid-argument', 'stage_id is required for campaign mode.');
      }

      // Load stage data
      const stageSnap = await db.collection('campaign_stages').doc(requestedStageId).get();
      if (!stageSnap.exists) {
        throw new HttpsError('not-found', `Campaign stage not found: ${requestedStageId}`);
      }
      campaignStage = stageSnap.data() as CampaignStage;

      // Verify faction unlock
      const unlockedFactions = (profile.unlocked_factions ?? []) as string[];
      if (!unlockedFactions.includes(campaignStage.faction)) {
        throw new HttpsError(
          'permission-denied',
          `Faction ${campaignStage.faction} not yet unlocked.`,
        );
      }

      // Verify stage progression: previous stage must be completed
      if (campaignStage.stage_number > 1) {
        const progressSnap = await db
          .collection('player_campaign_progress')
          .doc(uid)
          .get();
        const progressData = progressSnap.exists ? progressSnap.data() : null;
        const factionProgress =
          (progressData?.progress?.[campaignStage.faction] as number | undefined) ?? 0;
        if (factionProgress < campaignStage.stage_number - 1) {
          throw new HttpsError(
            'failed-precondition',
            `Stage ${campaignStage.stage_number} not yet unlocked. ` +
              `Complete stage ${campaignStage.stage_number - 1} first.`,
          );
        }
      }

      // Player A uses their active deck (same as solo)
      const deckSnap = await db
        .collection('player_active_decks').doc(uid)
        .collection('slots').get();
      if (deckSnap.size !== DECK_SIZE) {
        throw new HttpsError(
          'failed-precondition',
          `Active deck must have exactly ${DECK_SIZE} cards (has ${deckSnap.size}).`,
        );
      }
      playerACardIds = deckSnap.docs.map((d) => d.data().card_id as string);
      playerACommanderId = profile.selected_commander as string;

      // Player B: Update 1.0.3 — same active-deck rarity cap as solo. The
      // pre-seeded opponent_deck_card_ids cycled through all faction Units
      // without a rarity filter, so a fresh player on stage 1 could face
      // Epics/Legendaries. Now we generate a capped deck from the stage's
      // faction. Boss special rules (debuff strength, extra round draw,
      // starting_lane_buff preplacement) still apply below.
      const campaignMaxRarity = await getPlayerActiveDeckMaxRarity(uid, db);
      playerBCardIds = await buildBotDeckCardIds(
        campaignStage.faction,
        db,
        campaignMaxRarity,
      );
      botCommanderId = campaignStage.opponent_commander_id;
      logger.info('Campaign bot deck capped by active deck rarity', {
        uid,
        stage_id: campaignStage.stage_id,
        bot_faction: campaignStage.faction,
        max_rarity: campaignMaxRarity,
      });
    } else if (mode === 'battle_mode') {
      // Update 1.0.2: Battle Mode requires a permanent account. Mirrors
      // the check in findBattleOpponent — closes the bypass where a
      // modified client could call initializeNewMatch directly with
      // mode='battle_mode' to skip the public findBattleOpponent gate.
      if (request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
        throw new HttpsError(
          'permission-denied',
          'Battle Mode requires a permanent account.',
        );
      }
      const playerDeckId = request.data?.player_deck_id;
      if (!playerDeckId) {
        throw new HttpsError(
          'invalid-argument',
          'player_deck_id is required for battle_mode.',
        );
      }
      // Player side: load the saved deck the player chose for this match.
      const playerDeckSnap = await db
        .collection('player_saved_decks')
        .doc(uid)
        .collection('decks')
        .doc(playerDeckId)
        .get();
      if (!playerDeckSnap.exists) {
        throw new HttpsError('not-found', `Saved deck ${playerDeckId} not found.`);
      }
      const playerDeck = playerDeckSnap.data() as SavedDeck;
      if (playerDeck.card_ids.length !== DECK_SIZE) {
        throw new HttpsError(
          'failed-precondition',
          `Saved deck must have exactly ${DECK_SIZE} cards.`,
        );
      }
      playerACardIds = [...playerDeck.card_ids];
      playerACommanderId = playerDeck.commander_id;

      // Opponent: matchmaking. Falls through to a fresh AI deck for the
      // active faction if the saved-deck pool is empty (cold launch).
      const resolved = await resolveBattleOpponent(uid, playerDeck, db);
      if (resolved) {
        battleOpponentDeck = resolved.opponentDeck;
        battleOpponentDisplayName = resolved.opponentDisplayName;
        playerBCardIds = [...resolved.opponentDeck.card_ids];
        botCommanderId = resolved.opponentDeck.commander_id;
      } else {
        // Empty-pool fallback: behave like a solo match for the same
        // faction. The match still has mode='battle_mode' so the post-
        // match UI can route correctly; opponent_display_name is set to
        // a generic placeholder.
        const maxRarity = await getPlayerBestOwnedRarity(uid, db);
        playerBCardIds = await buildBotDeckCardIds(playerDeck.faction, db, maxRarity);
        botCommanderId = await pickBotCommander(playerDeck.faction, db);
        battleOpponentDisplayName = 'Unknown Commander';
        logger.info('Battle Mode pool empty; falling back to fresh AI', {
          uid,
          faction: playerDeck.faction,
        });
      }
    } else {
      // 2. Active deck (15 slots)
      const deckSnap = await db
        .collection('player_active_decks').doc(uid)
        .collection('slots').get();
      if (deckSnap.size !== DECK_SIZE) {
        throw new HttpsError(
          'failed-precondition',
          `Active deck must have exactly ${DECK_SIZE} cards (has ${deckSnap.size}).`,
        );
      }
      playerACardIds = deckSnap.docs.map((d) => d.data().card_id as string);

      // 3. Bot side. Update 1.0.3 — cap bot deck rarity at the highest rarity
      // in the player's *active deck*, not their inventory. Stops a player who
      // pulled a Legendary from a non-active faction (Premium Summon) from
      // facing a bot scaled to that rarity.
      const botFaction = profile.active_faction as string;
      const maxRarity = await getPlayerActiveDeckMaxRarity(uid, db);
      playerBCardIds = await buildBotDeckCardIds(botFaction, db, maxRarity);
      playerACommanderId = profile.selected_commander as string;
      botCommanderId = await pickBotCommander(botFaction, db);
      logger.info('Bot deck capped by active deck rarity', {
        uid,
        bot_faction: botFaction,
        max_rarity: maxRarity,
      });
    }

    // Resolve boss rules (campaign-only). These shape match init: pre-activate
    // bot commander, override debuff strength, grant extra round draws, and/or
    // pre-place cards in a lane.
    let bossDebuffStrength: number | undefined;
    let bossExtraRoundDraw: number | undefined;
    let bossCommanderPreActivated = false;
    let bossCommanderActiveLane: Lane | null = null;
    const preplacedCardsForB: Array<{ card_id: string; lane: Lane }> = [];

    if (campaignStage?.boss_special_rules) {
      const rules = campaignStage.boss_special_rules;
      if (rules.commander_pre_activated) {
        const cmdSnap = await db
          .collection('commander_library')
          .doc(botCommanderId)
          .get();
        if (cmdSnap.exists) {
          const cmdData = cmdSnap.data()!;
          bossCommanderActiveLane = cmdData.lane as Lane;
          bossCommanderPreActivated = true;
        }
      }
      if (rules.debuff_strength_override !== undefined) {
        bossDebuffStrength = rules.debuff_strength_override;
      }
      if (rules.extra_round_draw !== undefined) {
        bossExtraRoundDraw = rules.extra_round_draw;
      }
      if (rules.starting_lane_buff) {
        const { lane, card_count } = rules.starting_lane_buff;
        for (let i = 0; i < Math.min(card_count, playerBCardIds.length); i++) {
          preplacedCardsForB.push({ card_id: playerBCardIds[i], lane });
        }
      }
    }

    // 4. base_power lookup for every distinct card_id used. card_library is
    // keyed by card_id, so getAll() is cleaner than an 'in' query (no 30-id
    // batching, no index needed).
    const allCardIds = [...new Set([...playerACardIds, ...playerBCardIds])];
    const refs = allCardIds.map((id) => db.collection('card_library').doc(id));
    const docs = await db.getAll(...refs);
    const cardLibraryMap = new Map<string, { base_power: number }>();
    for (const d of docs) {
      if (!d.exists) {
        throw new HttpsError(
          'internal',
          `card_library missing entry for ${d.id}. Reseed card_library.`,
        );
      }
      const data = d.data()!;
      cardLibraryMap.set(data.card_id as string, {
        base_power: data.base_power as number,
      });
    }

    // 5. Build docs
    const matchId = crypto.randomUUID();
    // serverTimestamp() returns FieldValue at write-time; Firestore resolves
    // it to a Timestamp on commit, and reads always come back as Timestamp.
    // The cast keeps the shared MatchSession/LiveBoardState types honest
    // for the read side.
    const now = FieldValue.serverTimestamp() as unknown as admin.firestore.Timestamp;
    // Player always goes first in tutorial; coin flip otherwise.
    const firstTurn = mode === 'tutorial' ? 'player_a' : pickFirstTurn();

    const matchSession = makeInitialMatchSession(
      {
        match_id: matchId,
        player_a_id: uid,
        player_b_id: AI_BOT_UID,
        player_a_commander_id: playerACommanderId,
        player_b_commander_id: botCommanderId,
        active_turn: firstTurn,
        bot_difficulty: 'standard',
        mode,
        ...(mode === 'tutorial'
          ? { bot_scripted_actions: [...TUTORIAL_BOT_SCRIPTED_ACTIONS] }
          : {}),
        ...(campaignStage ? { stage_id: campaignStage.stage_id } : {}),
        ...(bossDebuffStrength !== undefined
          ? { bot_debuff_strength: bossDebuffStrength }
          : {}),
        ...(bossExtraRoundDraw !== undefined
          ? { bot_extra_round_draw: bossExtraRoundDraw }
          : {}),
        ...(battleOpponentDeck
          ? {
              battle_opponent_deck_id: battleOpponentDeck.deck_id,
              battle_opponent_card_ids: [...battleOpponentDeck.card_ids],
              battle_opponent_commander_id: battleOpponentDeck.commander_id,
              battle_opponent_power_score: battleOpponentDeck.power_score,
              battle_opponent_faction: battleOpponentDeck.faction,
            }
          : {}),
        ...(battleOpponentDisplayName
          ? { battle_opponent_display_name: battleOpponentDisplayName }
          : {}),
      },
      now,
    );

    if (bossCommanderPreActivated) {
      matchSession.player_b_commander_used = true;
      matchSession.player_b_commander_active_lane = bossCommanderActiveLane;
    }

    const boardStateDocs = buildBoardStateDocs({
      matchId,
      playerACardIds,
      playerBCardIds,
      cardLibraryMap,
      now,
      ...(preplacedCardsForB.length > 0 ? { preplacedCardsForB } : {}),
    });

    // 6. Atomic write: 1 match_session + 30 live_board_state = 31 ops (well
    // under the 500 batch limit).
    const batch = db.batch();
    batch.set(db.collection('match_sessions').doc(matchId), matchSession);
    for (const board of boardStateDocs) {
      batch.set(db.collection('live_board_state').doc(board.instance_id), board);
    }
    await batch.commit();

    logger.info('Match initialized', {
      match_id: matchId,
      mode,
      player_a_id: uid,
      player_b_id: AI_BOT_UID,
      first_turn: firstTurn,
      player_a_commander: playerACommanderId,
      player_b_commander: botCommanderId,
    });

    // If the bot won the coin flip, kick off its turn now.
    // onMatchTurnChange does not fire on document creation, so we must
    // invoke executeAITurnInternal directly here. Fire-and-forget: the
    // client gets its match_id back immediately and observes the bot's
    // play via its onSnapshot subscription.
    if (firstTurn === 'player_b') {
      logger.info('Bot won coin flip; dispatching first AI turn', { match_id: matchId });
      executeAITurnInternal(matchId, db).catch((err) => {
        logger.error('executeAITurn from initializeNewMatch failed', {
          match_id: matchId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return {
      match_id: matchId,
      first_turn: firstTurn,
      player_a_commander_id: playerACommanderId,
      player_b_commander_id: botCommanderId,
    };
  },
);
