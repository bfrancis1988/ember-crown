// SHARED TYPE — keep src/types/match.ts and functions/src/types/match.ts identical
// (only the Timestamp import path differs: 'firebase/firestore' vs 'firebase-admin/firestore').

import { Timestamp } from 'firebase-admin/firestore';
import type { Lane } from '../lib/matchConstants';
import type { ScriptedAction } from '../lib/tutorialDecks';

export type { ScriptedAction };

export type MatchStatus = 'in_progress' | 'game_over';
export type Side = 'player_a' | 'player_b';
export type BotDifficulty = 'standard' | 'easy' | 'boss';
export type MatchMode = 'solo' | 'tutorial' | 'campaign';

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

  bot_difficulty: BotDifficulty;

  mode: MatchMode;
  bot_scripted_actions?: ScriptedAction[];
  bot_scripted_action_index?: number;

  stage_id?: string;
  bot_debuff_strength: number;
  bot_extra_round_draw: number;

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
};

export function makeInitialMatchSession(init: MatchSessionInit, now: Timestamp): MatchSession {
  const {
    bot_scripted_actions,
    stage_id,
    bot_debuff_strength,
    bot_extra_round_draw,
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
    created_at: now,
    updated_at: now,
  };
}
