// SHARED CONFIG — keep src/lib/banners.ts and functions/src/lib/banners.ts identical.

export type BannerId = 'common' | 'rare' | 'premium';
export type CurrencyType = 'coins' | 'shards' | 'keys' | 'dust';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type RarityWeights = Record<Rarity, number>;

export type Banner = {
  id: BannerId;
  name: string;
  cost: number;
  currency: CurrencyType;
  weights: RarityWeights;
  description: string;
};

export const BANNERS: Banner[] = [
  {
    id: 'common',
    name: 'Common Summon',
    cost: 300,
    currency: 'coins',
    weights: { Common: 78, Uncommon: 18, Rare: 4, Epic: 0, Legendary: 0 },
    description: 'A modest summon. Mostly common cards.',
  },
  {
    id: 'rare',
    name: 'Rare Summon',
    cost: 4,
    currency: 'shards',
    weights: { Common: 0, Uncommon: 60, Rare: 30, Epic: 9, Legendary: 1 },
    description: 'A focused summon. Higher-tier cards.',
  },
  {
    id: 'premium',
    name: 'Premium Summon',
    cost: 1,
    currency: 'keys',
    weights: { Common: 0, Uncommon: 0, Rare: 25, Epic: 55, Legendary: 20 },
    description: 'The finest summon. Epic and Legendary common.',
  },
];

export const MAX_COPIES_PER_CARD = 4;

export const DUPLICATE_DUST_VALUES: Record<Rarity, number> = {
  Common: 5,
  Uncommon: 20,
  Rare: 100,
  Epic: 400,
  Legendary: 1600,
};

export const CRAFT_DUST_COSTS: Record<Rarity, number> = {
  Common: 40,
  Uncommon: 100,
  Rare: 400,
  Epic: 1200,
  Legendary: 3200,
};
