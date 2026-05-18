import * as admin from 'firebase-admin';

admin.initializeApp();

export { initializeNewMatch } from './match/initializeNewMatch';
export { onMatchTurnChange } from './match/onMatchTurnChange';
export { onBoardStateChange } from './match/onBoardStateChange';
export { onMatchDebuffChange } from './match/onMatchDebuffChange';
export { playCardToLane } from './match/playCardToLane';
export { passTurn } from './match/passTurn';
export { activateCommander } from './match/activateCommander';
export { onBothPlayersPassed } from './match/onBothPlayersPassed';
export { claimMatchRewards } from './match/claimMatchRewards';
export { claimMatchRewardsWithAd } from './match/claimMatchRewardsWithAd';
export { cleanupStaleMatches } from './match/cleanupStaleMatches';
export { recordCampaignWin } from './match/recordCampaignWin';
export { completeOnboardingFn } from './onboarding/completeOnboardingFn';
export { completeTutorial } from './onboarding/completeTutorial';
export { setActiveFaction } from './profile/setActiveFaction';
export { deleteUserAccount } from './profile/deleteUserAccount';
export { summonCard } from './economy/summonCard';
export { craftCard } from './economy/craftCard';
export { disenchantCard } from './economy/disenchantCard';
export { saveDeck } from './decks/saveDeck';
export { deleteSavedDeck } from './decks/deleteSavedDeck';
export { setActiveSavedDeck } from './decks/setActiveSavedDeck';
export { findBattleOpponent } from './match/findBattleOpponent';
export { updateBossRewards } from './migrations/updateBossRewards';
