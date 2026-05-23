// SHARED TYPE — keep src/types/match.ts and functions/src/types/match.ts identical
// (only the Timestamp import path differs: 'firebase/firestore' vs 'firebase-admin/firestore').

import { Timestamp } from 'firebase/firestore';
import type { Lane } from '../lib/matchConstants';
import type { ScriptedAction } from '../lib/tutorialDecks';

export type { ScriptedAction };

export type MatchStatus = 'in_progress' | 'game_over' | 'cancelled';
export type Side = 'player_a' | 'player_b';
export type BotDifficulty = 'standard' | 'easy' | 'boss';
export type MatchMode = 'solo' | 'tutorial' | 'campaign' | 'battle_mode';

export type MatchSession = {
  match_id: string;
  player_a_id: string;
  player_b_id: string;
  status: MatchStatus;
  current_round: 1 | 2 | 3;
  active_turn: Side;

  player_a_wins: number;
  player_b_wins: number;

  player_a_passed: boolean;
  player_b_passed: boolean;

  player_a_commander_id: string;
  player_b_commander_id: string;

  player_a_commander_active_lane: Lane | null;
  player_b_commander_active_lane: Lane | null;

  player_a_commander_used: boolean;
  player_b_commander_used: boolean;

  player_a_melee_debuffed: boolean;
  player_a_ranged_debuffed: boolean;
  player_a_siege_debuffed: boolean;
  player_b_melee_debuffed: boolean;
  player_b_ranged_debuffed: boolean;
  player_b_siege_debuffed: boolean;

  player_a_claimed: boolean;
  player_b_claimed: boolean;

  // Phase 9.4: set true after a successful claimMatchRewardsWithAd call.
  // Optional for lazy migration of pre-9.4 sessions; treat undefined as false.
  ad_reward_claimed?: boolean;

  bot_difficulty: BotDifficulty;

  mode: MatchMode;
  bot_scripted_actions?: ScriptedAction[];
  bot_scripted_action_index?: number;

  stage_id?: string;
  bot_debuff_strength: number;
  bot_extra_round_draw: number;

  // Phase 9.4.5C: persisted only when mode === 'battle_mode'.
  battle_opponent_deck_id?: string;
  battle_opponent_card_ids?: string[];
  battle_opponent_commander_id?: string;
  battle_opponent_display_name?: string;
  battle_opponent_power_score?: number;
  battle_opponent_faction?: string;

  // Release 1.1.0 — quest tracking. See functions/src/types/match.ts.
  player_a_faction?: string;
  player_a_cards_played?: number;
  player_a_units_played?: number;
  player_a_spells_played?: number;
  player_a_melee_lane_played?: number;
  player_a_ranged_lane_played?: number;
  player_a_siege_lane_played?: number;
  player_a_commander_used_count?: number;
  player_a_rare_or_higher_played?: number;

  created_at: Timestamp;
  updated_at: Timestamp;
};

export type MatchSessionInit = Pick<MatchSession,
  'match_id' | 'player_a_id' | 'player_b_id' |
  'player_a_commander_id' | 'player_b_commander_id' |
  'active_turn' | 'bot_difficulty' | 'mode'
> & {
  bot_scripted_actions?: ScriptedAction[];
  stage_id?: string;
  bot_debuff_strength?: number;
  bot_extra_round_draw?: number;
  battle_opponent_deck_id?: string;
  battle_opponent_card_ids?: string[];
  battle_opponent_commander_id?: string;
  battle_opponent_display_name?: string;
  battle_opponent_power_score?: number;
  battle_opponent_faction?: string;
};

export function makeInitialMatchSession(init: MatchSessionInit, now: Timestamp): MatchSession {
  const {
    bot_scripted_actions,
    stage_id,
    bot_debuff_strength,
    bot_extra_round_draw,
    battle_opponent_deck_id,
    battle_opponent_card_ids,
    battle_opponent_commander_id,
    battle_opponent_display_name,
    battle_opponent_power_score,
    battle_opponent_faction,
    ...rest
  } = init;
  return {
    ...rest,
    status: 'in_progress',
    current_round: 1,
    player_a_wins: 0,
    player_b_wins: 0,
    player_a_passed: false,
    player_b_passed: false,
    player_a_commander_active_lane: null,
    player_b_commander_active_lane: null,
    player_a_commander_used: false,
    player_b_commander_used: false,
    player_a_melee_debuffed: false,
    player_a_ranged_debuffed: false,
    player_a_siege_debuffed: false,
    player_b_melee_debuffed: false,
    player_b_ranged_debuffed: false,
    player_b_siege_debuffed: false,
    player_a_claimed: false,
    player_b_claimed: false,
    ...(bot_scripted_actions !== undefined ? {
      bot_scripted_actions,
      bot_scripted_action_index: 0,
    } : {}),
    ...(stage_id !== undefined ? { stage_id } : {}),
    bot_debuff_strength: bot_debuff_strength ?? 2,
    bot_extra_round_draw: bot_extra_round_draw ?? 0,
    ...(battle_opponent_deck_id !== undefined
      ? { battle_opponent_deck_id }
      : {}),
    ...(battle_opponent_card_ids !== undefined
      ? { battle_opponent_card_ids }
      : {}),
    ...(battle_opponent_commander_id !== undefined
      ? { battle_opponent_commander_id }
      : {}),
    ...(battle_opponent_display_name !== undefined
      ? { battle_opponent_display_name }
      : {}),
    ...(battle_opponent_power_score !== undefined
      ? { battle_opponent_power_score }
      : {}),
    ...(battle_opponent_faction !== undefined
      ? { battle_opponent_faction }
      : {}),
    created_at: now,
    updated_at: now,
  };
}
