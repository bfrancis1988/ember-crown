// ACTION RESULT SHAPES — keep functions/src/types/actions.ts and src/types/matchActions.ts identical.

export type InitializeNewMatchResult = {
  match_id: string;
  first_turn: 'player_a' | 'player_b';
  player_a_commander_id: string;
  player_b_commander_id: string;
};

export type PlayCardResult = {
  success: true;
  action: 'unit_placed' | 'spell_debuff' | 'spell_cleanse';
  instance_id: string;
  target_lane?: 'Melee' | 'Ranged' | 'Siege';
  next_active_turn: 'player_a' | 'player_b';
};

export type PassTurnResult =
  | { success: true; action: 'turn_swapped'; next_active_turn: 'player_a' | 'player_b' }
  | { success: true; action: 'round_ended'; new_round: 1 | 2 | 3; new_active_turn: 'player_a' | 'player_b' }
  | { success: true; action: 'game_over'; final_score: { player_a: number; player_b: number } };

export type ActivateCommanderResult = {
  success: true;
  commander_id: string;
  active_lane: 'Melee' | 'Ranged' | 'Siege';
};

export type ClaimMatchRewardsResult = {
  success: true;
  coins_earned: number;
  shards_earned: number;
  is_victory: boolean;
};
