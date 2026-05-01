// src/types/wallet.ts
// Shape of player_wallets/{uid} docs. Single doc per player. All mutations
// will move to Cloud Functions in Phase 6 — this type is read-only on the client.

import { Timestamp } from 'firebase/firestore';

export type PlayerWallet = {
  player_id: string;
  coins: number;
  shards: number;
  keys: number;
  created_at: Timestamp;
  updated_at: Timestamp;
};
