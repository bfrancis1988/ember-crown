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
export { cleanupStaleMatches } from './match/cleanupStaleMatches';
export { completeOnboardingFn } from './onboarding/completeOnboardingFn';
