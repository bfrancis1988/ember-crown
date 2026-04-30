// src/lib/factions.ts
// Faction metadata + unlock logic. The faction id strings here MUST match the
// normalized `faction` field on card_library / commander_library docs (the seed
// script strips the leading "The " — see scripts/seed-firestore.ts).

import type { PlayerProfile } from '../types/player';

export type FactionId =
  | 'Vanguard Kingdoms'
  | 'Iron Pact'
  | 'Arborea Kingdom'
  | 'Ashen Swarm'
  | 'Obsidian Empire'
  | 'Feral Hollow';

export type UnlockTier = 'starter' | 'tier_1' | 'tier_2' | 'tier_3';

export type FactionMeta = {
  id: FactionId;
  name: string;
  color: string;
  description: string;
  long_description: string;
  unlock_tier: UnlockTier;
  unlock_hint: string;
};

export const FACTIONS: FactionMeta[] = [
  {
    id: 'Vanguard Kingdoms',
    name: 'Vanguard Kingdoms',
    color: '#d4a04a',
    description: 'Knights and holy warriors.',
    long_description:
      'A disciplined order of knights, archers, and battlemages. The Vanguard hold the line through faith, steel, and unbroken formation.',
    unlock_tier: 'starter',
    unlock_hint: '',
  },
  {
    id: 'Iron Pact',
    name: 'Iron Pact',
    color: '#a0522d',
    description: 'Dwarves and orcs of the forge.',
    long_description:
      'A grudging alliance of mountain dwarves and steppe orcs, bound by the oath of the forge. They favor heavy armor, siege engines, and the slow grind of attrition.',
    unlock_tier: 'tier_1',
    unlock_hint: 'Beat the Vanguard campaign to unlock',
  },
  {
    id: 'Arborea Kingdom',
    name: 'Arborea Kingdom',
    color: '#4a8a4a',
    description: 'Elves of the deep forest.',
    long_description:
      'Reclusive elves of the old forests. They strike from the canopy with bow and rune-magic, and their warriors move like shadows between the trees.',
    unlock_tier: 'tier_2',
    unlock_hint: 'Defeat the Iron Pact campaign to unlock',
  },
  {
    id: 'Ashen Swarm',
    name: 'Ashen Swarm',
    color: '#5a4a6a',
    description: 'The restless undead.',
    long_description:
      'A tide of bone, rot, and necromantic will. The Swarm wins through numbers, cursed ground, and the simple refusal of its dead to stay buried.',
    unlock_tier: 'tier_2',
    unlock_hint: 'Defeat the Iron Pact campaign to unlock',
  },
  {
    id: 'Obsidian Empire',
    name: 'Obsidian Empire',
    color: '#8a3a3a',
    description: 'Dragonkin and flame.',
    long_description:
      'Ancient dragonkin and their dragonborn legions. Their war is one of fire — magma, ash, and the breath of true dragons sweeping the field clean.',
    unlock_tier: 'tier_3',
    unlock_hint: 'Reach the final campaigns to unlock',
  },
  {
    id: 'Feral Hollow',
    name: 'Feral Hollow',
    color: '#3a5a4a',
    description: 'Beasts and primal magic.',
    long_description:
      'The wild things of the swamp and the deep wood: werewolves, swamp witches, beasts of the moon. Their power is primal, unpredictable, and rarely clean.',
    unlock_tier: 'tier_3',
    unlock_hint: 'Reach the final campaigns to unlock',
  },
];

export const STARTER_FACTION: FactionId = 'Vanguard Kingdoms';

// Phase 2: only the starter faction is unlocked.
// TODO: Phase 3 extends this with a Player_Profile.unlocked_factions inventory check.
// TODO: Phase 7 ties unlock progression to campaign completion.
export function isFactionUnlocked(
  factionId: FactionId,
  _profile: PlayerProfile | null
): boolean {
  return factionId === STARTER_FACTION;
}
