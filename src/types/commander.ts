// src/types/commander.ts
// Shape of commander_library/{commander_id} docs as written by
// scripts/seed-firestore.ts.

import type { Lane } from './card';

export type CommanderAbility = {
  type: string;
  description: string;
  params: Record<string, unknown>;
};

export type CommanderEntry = {
  commander_id: string;
  name: string;
  faction: string;
  lane: Lane;
  passive: CommanderAbility;
  active: CommanderAbility;
};
