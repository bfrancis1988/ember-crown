import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const ping = onCall((request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  logger.info('ping called by', request.auth.uid);
  return {
    message: 'pong',
    uid: request.auth.uid,
    timestamp: Date.now(),
  };
});

export { initializeNewMatch } from './match/initializeNewMatch';
export { onMatchTurnChange } from './match/onMatchTurnChange';
export { onBoardStateChange } from './match/onBoardStateChange';
export { onMatchDebuffChange } from './match/onMatchDebuffChange';
export { playCardToLane } from './match/playCardToLane';
export { passTurn } from './match/passTurn';
export { activateCommander } from './match/activateCommander';
