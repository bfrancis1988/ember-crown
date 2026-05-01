// src/types/inventory.ts
// Shape of player_inventories/{uid}/cards/{card_id} docs. One doc per owned
// card; doc id IS the card_id so duplicate ownership is collapsed into
// quantity_owned.

import { Timestamp } from 'firebase/firestore';

export type InventoryCard = {
  card_id: string;
  quantity_owned: number;
  acquired_at: Timestamp;
};
