// src/types/card.ts
// Shape of card_library/{card_id} docs as written by scripts/seed-firestore.ts.
// Units and Spells share a common base; the discriminator is `card_type`.

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type Lane = 'Melee' | 'Ranged' | 'Siege';
export type UnitKlass = 'Warrior' | 'Archer' | 'Mage' | 'Healer' | 'Rogue' | 'Behemoth';
export type SpellKlass = 'Curse' | 'Cleanse';

type CardBase = {
  card_id: string;
  card_name: string;
  faction: string;
  rarity: Rarity;
  base_power: number;
  image_url: string;
  // Phase 9.4.2A — present on every card_library doc after migration. The
  // empty defaults are emitted by scripts/seed-firestore.ts for legacy rows.
  keywords: string[];
  keyword_params: Record<string, unknown>;
  // Defaults to 2 (existing behavior). Legendaries set 3.
  optimal_lane_bonus?: number;
  ability_text?: string;
  flavor_text?: string;
};

export type UnitCard = CardBase & {
  card_type: 'Unit';
  klass: UnitKlass;
  optimal_lane: Lane;
  race: string;
};

export type SpellCard = CardBase & {
  card_type: 'Spell';
  klass: SpellKlass;
  target_side: 'self' | 'enemy';
  // Curses carry a lane_affinity; cleanses do not.
  lane_affinity?: Lane;
};

export type CardLibraryEntry = UnitCard | SpellCard;
