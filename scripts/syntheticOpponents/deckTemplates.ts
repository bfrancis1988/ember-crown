// scripts/syntheticOpponents/deckTemplates.ts
//
// Phase 9.4.5-extras: deck blueprints for the 36 synthetic Battle Mode
// opponents (6 factions × 3 power tiers × 2 variants).
//
// Templates are generated deterministically from FACTION_POOLS + TIER_SHAPES
// at module-load time. The seeder consumes SYNTHETIC_DECK_TEMPLATES; the
// cleanup script consumes the same list to know which uids to delete.
//
// Power scoring: rarity-only (commanders have base_power=0 in v1, so the
// commander multiplier contributes nothing — the deck's power_score is
// sum of rarity points). Targets:
//   Low  ≈ 15–30
//   Mid  ≈ 50–80
//   High ≈ 120–180
//
// Lane policy:
//   - Balanced variants spread cards across all 3 lanes.
//   - Focused variants concentrate on the faction's signature lane.

import { RARITY_POINTS } from '../../functions/src/lib/computeDeckPower';

export type Lane = 'Melee' | 'Ranged' | 'Siege' | 'Any';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type Tier = 'low' | 'mid' | 'high';
export type Variant = 'balanced' | 'focused';

export type SyntheticDeckTemplate = {
  faction: string;
  tier: Tier;
  variant: Variant;
  commander_id: string;
  card_ids: string[]; // length 15
  name: string;
  expected_power: number; // computed at template-generation time
};

type CardPoolEntry = {
  id: string;
  rarity: Rarity;
  lane: Lane; // 'Any' for cleanse spells (only Common rarity in v1)
};

type FactionPool = {
  faction: string; // canonical, no "The " prefix (matches card_library/commander_library)
  signature_lane: Exclude<Lane, 'Any'>;
  // Three commanders per faction, one per lane. We pick by deck "primary lane"
  // so the deck and commander feel thematically consistent.
  commander_by_lane: Record<Exclude<Lane, 'Any'>, string>;
  cards: CardPoolEntry[];
};

// ───────────────────────────────────────────────────────────
// Faction card pools
// ───────────────────────────────────────────────────────────

export const FACTION_POOLS: FactionPool[] = [
  {
    faction: 'Vanguard Kingdoms',
    signature_lane: 'Melee',
    commander_by_lane: {
      Melee: 'CMD-VAN-01', // Vanguard General
      Ranged: 'CMD-VAN-02', // Domain Tactician
      Siege: 'CMD-VAN-03', // Royal Marshal
    },
    cards: [
      // Commons — units
      { id: 'UNT-VAN-02', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-VAN-03', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-VAN-04', rarity: 'Common', lane: 'Ranged' },
      { id: 'UNT-VAN-05', rarity: 'Common', lane: 'Ranged' },
      // Commons — spells (Curse + Cleanse)
      { id: 'SPL-VAN-01', rarity: 'Common', lane: 'Melee' },
      { id: 'SPL-VAN-02', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-VAN-03', rarity: 'Common', lane: 'Siege' },
      { id: 'SPL-VAN-CLN', rarity: 'Common', lane: 'Any' },
      // Uncommons
      { id: 'UNT-VAN-01', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'UNT-VAN-06', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'UNT-VAN-07', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-VAN-08', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-VAN-09', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'UNT-VAN-10', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'uncommon_vanguard_veteran_sergeant', rarity: 'Uncommon', lane: 'Melee' },
      // Rares
      { id: 'rare_vanguard_high_paladin', rarity: 'Rare', lane: 'Melee' },
      { id: 'rare_vanguard_banner_knight', rarity: 'Rare', lane: 'Melee' },
      { id: 'rare_vanguard_crossbow_sergeant', rarity: 'Rare', lane: 'Ranged' },
      { id: 'rare_vanguard_siege_engineer', rarity: 'Rare', lane: 'Siege' },
      // Epics
      { id: 'epic_vanguard_lord_commander', rarity: 'Epic', lane: 'Melee' },
      { id: 'epic_vanguard_trebuchet_master', rarity: 'Epic', lane: 'Siege' },
      { id: 'epic_vanguard_cathedral_guard', rarity: 'Epic', lane: 'Melee' },
      // Legendaries
      { id: 'legendary_vanguard_marshal_aldric_the_iron_saint', rarity: 'Legendary', lane: 'Melee' },
      { id: 'legendary_vanguard_the_crowned_lion', rarity: 'Legendary', lane: 'Melee' },
    ],
  },
  {
    faction: 'Iron Pact',
    signature_lane: 'Siege',
    commander_by_lane: {
      Melee: 'CMD-IRO-01', // Iron Lord
      Ranged: 'CMD-IRO-02', // Forge Master
      Siege: 'CMD-IRO-03', // High Engineer
    },
    cards: [
      { id: 'UNT-IRO-02', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-IRO-03', rarity: 'Common', lane: 'Siege' },
      { id: 'UNT-IRO-04', rarity: 'Common', lane: 'Ranged' },
      { id: 'UNT-IRO-05', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-IRO-01', rarity: 'Common', lane: 'Melee' },
      { id: 'SPL-IRO-02', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-IRO-03', rarity: 'Common', lane: 'Siege' },
      { id: 'SPL-IRO-CLN', rarity: 'Common', lane: 'Any' },
      { id: 'UNT-IRO-01', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'UNT-IRO-06', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'UNT-IRO-07', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-IRO-08', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-IRO-09', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'UNT-IRO-10', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'uncommon_iron_pact_forge_apprentice', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'rare_iron_pact_anvil_bearer', rarity: 'Rare', lane: 'Melee' },
      { id: 'rare_iron_pact_tunnel_sapper', rarity: 'Rare', lane: 'Siege' },
      { id: 'rare_iron_pact_drillmaster', rarity: 'Rare', lane: 'Melee' },
      { id: 'rare_iron_pact_hearth_spellbinder', rarity: 'Rare', lane: 'Ranged' },
      { id: 'epic_iron_pact_master_engineer', rarity: 'Epic', lane: 'Siege' },
      { id: 'epic_iron_pact_ember_brand', rarity: 'Epic', lane: 'Melee' },
      { id: 'epic_iron_pact_iron_golem', rarity: 'Epic', lane: 'Siege' },
      { id: 'legendary_iron_pact_forgemaster_brunhild', rarity: 'Legendary', lane: 'Siege' },
      { id: 'legendary_iron_pact_the_mountain_king', rarity: 'Legendary', lane: 'Melee' },
    ],
  },
  {
    faction: 'Arborea Kingdom',
    signature_lane: 'Ranged',
    commander_by_lane: {
      Melee: 'CMD-ARB-01', // Sylvian Ranger
      Ranged: 'CMD-ARB-02', // Elder Druid
      Siege: 'CMD-ARB-03', // Thicket Warden
    },
    cards: [
      { id: 'UNT-ARB-02', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-ARB-03', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-ARB-04', rarity: 'Common', lane: 'Ranged' },
      { id: 'UNT-ARB-05', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-ARB-01', rarity: 'Common', lane: 'Melee' },
      { id: 'SPL-ARB-02', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-ARB-03', rarity: 'Common', lane: 'Siege' },
      { id: 'SPL-ARB-CLN', rarity: 'Common', lane: 'Any' },
      { id: 'UNT-ARB-01', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'UNT-ARB-06', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'UNT-ARB-07', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-ARB-08', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-ARB-09', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-ARB-10', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'uncommon_arborea_briar_sprite', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'rare_arborean_spellweaver', rarity: 'Rare', lane: 'Ranged' },
      { id: 'rare_arborea_wolfshaper', rarity: 'Rare', lane: 'Ranged' },
      { id: 'rare_arborea_thorn_warden', rarity: 'Rare', lane: 'Melee' },
      { id: 'rare_arborea_glade_singer', rarity: 'Rare', lane: 'Ranged' },
      { id: 'epic_arborea_verdant_druid', rarity: 'Epic', lane: 'Ranged' },
      { id: 'epic_arborea_thornroot_beast', rarity: 'Epic', lane: 'Melee' },
      { id: 'epic_arborea_moonweaver', rarity: 'Epic', lane: 'Ranged' },
      { id: 'legendary_arborea_queen_sylvara_the_greenmother', rarity: 'Legendary', lane: 'Ranged' },
      { id: 'legendary_arborea_the_worldroot', rarity: 'Legendary', lane: 'Siege' },
    ],
  },
  {
    faction: 'Ashen Swarm',
    signature_lane: 'Melee',
    commander_by_lane: {
      Melee: 'CMD-ASH-01', // Crypt Lord
      Ranged: 'CMD-ASH-02', // High Necromancer
      Siege: 'CMD-ASH-03', // Dread Knight
    },
    cards: [
      { id: 'UNT-ASH-02', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-ASH-03', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-ASH-04', rarity: 'Common', lane: 'Ranged' },
      { id: 'UNT-ASH-05', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-ASH-01', rarity: 'Common', lane: 'Melee' },
      { id: 'SPL-ASH-02', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-ASH-03', rarity: 'Common', lane: 'Siege' },
      { id: 'SPL-ASH-CLN', rarity: 'Common', lane: 'Any' },
      { id: 'UNT-ASH-01', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'UNT-ASH-06', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'UNT-ASH-07', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-ASH-08', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-ASH-09', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-ASH-10', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'uncommon_ashen_swarm_hive_drone', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'rare_ashen_swarm_carrion_crawler', rarity: 'Rare', lane: 'Siege' },
      { id: 'rare_ashen_swarm_spore_drone', rarity: 'Rare', lane: 'Melee' },
      { id: 'rare_ashen_swarm_husk_stalker', rarity: 'Rare', lane: 'Siege' },
      { id: 'rare_ashen_swarm_wretchcaller', rarity: 'Rare', lane: 'Ranged' },
      { id: 'epic_ashen_swarm_brood_mother', rarity: 'Epic', lane: 'Melee' },
      { id: 'epic_ashen_swarm_plague_walker', rarity: 'Epic', lane: 'Melee' },
      { id: 'epic_ashen_swarm_locust_storm', rarity: 'Epic', lane: 'Ranged' },
      { id: 'legendary_ashen_swarm_khazgoth_the_hive_king', rarity: 'Legendary', lane: 'Melee' },
      { id: 'legendary_ashen_swarm_the_devouring_tide', rarity: 'Legendary', lane: 'Siege' },
    ],
  },
  {
    faction: 'Obsidian Empire',
    signature_lane: 'Ranged',
    commander_by_lane: {
      Melee: 'CMD-OBS-01', // Dragonborn Warlord
      Ranged: 'CMD-OBS-02', // Flame Seer
      Siege: 'CMD-OBS-03', // Sky Tyrant
    },
    cards: [
      { id: 'UNT-OBS-02', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-OBS-03', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-OBS-04', rarity: 'Common', lane: 'Ranged' },
      { id: 'UNT-OBS-05', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-OBS-01', rarity: 'Common', lane: 'Melee' },
      { id: 'SPL-OBS-02', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-OBS-03', rarity: 'Common', lane: 'Siege' },
      { id: 'SPL-OBS-CLN', rarity: 'Common', lane: 'Any' },
      { id: 'UNT-OBS-01', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'UNT-OBS-06', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'UNT-OBS-07', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-OBS-08', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-OBS-09', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-OBS-10', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'uncommon_obsidian_empire_cultist_acolyte', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'rare_obsidian_dreadknight', rarity: 'Rare', lane: 'Melee' },
      { id: 'rare_obsidian_empire_wraithbinder', rarity: 'Rare', lane: 'Ranged' },
      { id: 'rare_obsidian_empire_bonewright', rarity: 'Rare', lane: 'Ranged' },
      { id: 'rare_obsidian_empire_shadow_whisperer', rarity: 'Rare', lane: 'Siege' },
      { id: 'epic_obsidian_empire_voidcaller', rarity: 'Epic', lane: 'Ranged' },
      { id: 'epic_obsidian_empire_dread_knight', rarity: 'Epic', lane: 'Melee' },
      { id: 'epic_obsidian_empire_hellfire_drake', rarity: 'Epic', lane: 'Melee' },
      { id: 'legendary_obsidian_empire_vexarion_the_black_tyrant', rarity: 'Legendary', lane: 'Siege' },
      { id: 'legendary_obsidian_empire_the_unmade', rarity: 'Legendary', lane: 'Ranged' },
    ],
  },
  {
    faction: 'Feral Hollow',
    signature_lane: 'Siege',
    commander_by_lane: {
      Melee: 'CMD-FER-01', // Alpha Werewolf
      Ranged: 'CMD-FER-02', // Swamp Hag
      Siege: 'CMD-FER-03', // Beast Lord
    },
    cards: [
      { id: 'UNT-FER-02', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-FER-03', rarity: 'Common', lane: 'Melee' },
      { id: 'UNT-FER-04', rarity: 'Common', lane: 'Ranged' },
      { id: 'UNT-FER-05', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-FER-01', rarity: 'Common', lane: 'Melee' },
      { id: 'SPL-FER-02', rarity: 'Common', lane: 'Ranged' },
      { id: 'SPL-FER-03', rarity: 'Common', lane: 'Siege' },
      { id: 'SPL-FER-CLN', rarity: 'Common', lane: 'Any' },
      { id: 'UNT-FER-01', rarity: 'Uncommon', lane: 'Melee' },
      { id: 'UNT-FER-06', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'UNT-FER-07', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-FER-08', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-FER-09', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'UNT-FER-10', rarity: 'Uncommon', lane: 'Siege' },
      { id: 'uncommon_feral_hollow_bone_fetishist', rarity: 'Uncommon', lane: 'Ranged' },
      { id: 'rare_feral_blood_shaman', rarity: 'Rare', lane: 'Siege' },
      { id: 'rare_feral_hollow_marshhag', rarity: 'Rare', lane: 'Ranged' },
      { id: 'rare_feral_hollow_the_hooded_one', rarity: 'Rare', lane: 'Siege' },
      { id: 'rare_feral_hollow_pyre_tender', rarity: 'Rare', lane: 'Ranged' },
      { id: 'epic_feral_hollow_blood_witch', rarity: 'Epic', lane: 'Ranged' },
      { id: 'epic_feral_hollow_antler_shaman', rarity: 'Epic', lane: 'Ranged' },
      { id: 'epic_feral_hollow_wretchspawn', rarity: 'Epic', lane: 'Melee' },
      { id: 'legendary_feral_hollow_mother_vasha_the_crone_of_ten_names', rarity: 'Legendary', lane: 'Ranged' },
      { id: 'legendary_feral_hollow_the_hungering_hollow', rarity: 'Legendary', lane: 'Siege' },
    ],
  },
];

// ───────────────────────────────────────────────────────────
// Tier × Variant rarity composition (15 cards total each)
// ───────────────────────────────────────────────────────────
//
// Note: the planning doc's strict rarity caps for mid/high don't reach the
// stated power targets given this card library (max rarity = Legendary @ 15).
// Compositions below are tuned to land in-range, matching the planner's
// caveat: "tune by swapping cards if a deck lands too high or too low."
//
// All rows sum to 15 cards. Power assumes commander.base_power = 0.

type RarityCounts = Record<Rarity, number>;

const SHAPES: Record<Tier, Record<Variant, RarityCounts>> = {
  // Low ≈ 15–30
  low: {
    balanced: { Common: 12, Uncommon: 3, Rare: 0, Epic: 0, Legendary: 0 }, // 18
    focused: { Common: 13, Uncommon: 2, Rare: 0, Epic: 0, Legendary: 0 }, //  17
  },
  // Mid ≈ 50–80
  mid: {
    balanced: { Common: 4, Uncommon: 5, Rare: 3, Epic: 3, Legendary: 0 }, // 50
    focused: { Common: 4, Uncommon: 4, Rare: 4, Epic: 3, Legendary: 0 }, //  52
  },
  // High ≈ 120–180
  high: {
    balanced: { Common: 0, Uncommon: 2, Rare: 4, Epic: 4, Legendary: 5 }, // 127
    focused: { Common: 0, Uncommon: 1, Rare: 4, Epic: 5, Legendary: 5 }, //  133
  },
};

// ───────────────────────────────────────────────────────────
// Lane preferences per (tier, variant)
// ───────────────────────────────────────────────────────────
//
// Balanced variants pull from all lanes roughly evenly. Focused variants
// bias 60–70% toward the signature lane. The picker tries to satisfy the
// rarity counts first (correctness), then ranks candidates by lane fit
// within each rarity bucket.

type LaneBias = (lane: Lane, signatureLane: Lane) => number;

function balancedBias(): LaneBias {
  // No lane preference — equal weight to all lanes.
  return () => 1;
}

function focusedBias(): LaneBias {
  // Signature lane: weight 3. Other lanes (and 'Any'): weight 1.
  return (lane, signatureLane) => (lane === signatureLane ? 3 : 1);
}

// ───────────────────────────────────────────────────────────
// Picker
// ───────────────────────────────────────────────────────────

/**
 * Select `count` card_ids of the given rarity from the pool, biased by lane.
 * Respects the 4-copy max by rotating through distinct cards as much as
 * possible. If the rarity bucket has fewer distinct cards than `count`, it
 * loops — but Firestore enforces 4 copies max, so we cap per-card at 4.
 */
function pickCards(
  pool: FactionPool,
  rarity: Rarity,
  count: number,
  bias: LaneBias,
): string[] {
  if (count === 0) return [];

  const candidates = pool.cards.filter((c) => c.rarity === rarity);
  if (candidates.length === 0) {
    throw new Error(
      `No ${rarity} cards in pool for ${pool.faction}; cannot pick ${count}.`,
    );
  }

  // Sort by lane fit (descending), then by id for determinism.
  const ranked = [...candidates].sort((a, b) => {
    const wa = bias(a.lane, pool.signature_lane);
    const wb = bias(b.lane, pool.signature_lane);
    if (wa !== wb) return wb - wa;
    return a.id.localeCompare(b.id);
  });

  const picked: string[] = [];
  const perCardCount = new Map<string, number>();
  let cursor = 0;

  // Distribute as evenly as possible across the top-ranked cards, then fall
  // back to lower-ranked ones once we hit the 4-copy cap on a top pick.
  while (picked.length < count) {
    const card = ranked[cursor % ranked.length];
    const used = perCardCount.get(card.id) ?? 0;
    if (used < 4) {
      picked.push(card.id);
      perCardCount.set(card.id, used + 1);
    } else {
      // This card is maxed out. Move on. If everything is maxed, throw.
      if ([...perCardCount.values()].reduce((a, b) => a + b, 0) >=
          ranked.length * 4) {
        throw new Error(
          `Cannot pick ${count} ${rarity} cards from ${pool.faction}: only ${ranked.length} distinct, max 4 copies each.`,
        );
      }
    }
    cursor++;
  }
  return picked;
}

function buildTemplate(
  pool: FactionPool,
  tier: Tier,
  variant: Variant,
): SyntheticDeckTemplate {
  const shape = SHAPES[tier][variant];
  const bias = variant === 'balanced' ? balancedBias() : focusedBias();

  const cardIds: string[] = [
    ...pickCards(pool, 'Common', shape.Common, bias),
    ...pickCards(pool, 'Uncommon', shape.Uncommon, bias),
    ...pickCards(pool, 'Rare', shape.Rare, bias),
    ...pickCards(pool, 'Epic', shape.Epic, bias),
    ...pickCards(pool, 'Legendary', shape.Legendary, bias),
  ];

  if (cardIds.length !== 15) {
    throw new Error(
      `Built ${pool.faction}/${tier}/${variant} with ${cardIds.length} cards, expected 15`,
    );
  }

  // Validate 4-copy cap.
  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if (n > 4) {
      throw new Error(
        `Built ${pool.faction}/${tier}/${variant} with ${n} copies of ${id} (max 4)`,
      );
    }
  }

  // Compute expected power.
  let power = 0;
  for (const id of cardIds) {
    const card = pool.cards.find((c) => c.id === id);
    if (!card) throw new Error(`Picked unknown card ${id}`);
    power += RARITY_POINTS[card.rarity] ?? 0;
  }

  // Commander: focused → signature-lane commander; balanced → signature lane
  // for high tier, otherwise alternate across lanes for variety.
  const commanderLane = pickCommanderLane(pool, tier, variant);
  const commanderId = pool.commander_by_lane[commanderLane];

  // Human-readable name. Avoid using "Vanguard" as a tier label since it
  // collides with the Vanguard faction.
  const tierLabel = tier === 'low' ? 'Skirmish' : tier === 'mid' ? 'Veteran' : 'Champion';
  const variantLabel = variant === 'balanced' ? 'Balanced' : `${pool.signature_lane}-Heavy`;
  const factionShort = pool.faction.replace(/ Kingdoms?| Empire| Pact| Hollow| Swarm/, '');
  const name = `${factionShort} ${tierLabel} — ${variantLabel}`;

  return {
    faction: pool.faction,
    tier,
    variant,
    commander_id: commanderId,
    card_ids: cardIds,
    name,
    expected_power: power,
  };
}

function pickCommanderLane(
  pool: FactionPool,
  tier: Tier,
  variant: Variant,
): Exclude<Lane, 'Any'> {
  if (variant === 'focused') return pool.signature_lane;
  // Balanced: rotate so balanced decks don't all share the same commander.
  // Use a stable hash of (faction, tier) to pick deterministically.
  const lanes: Exclude<Lane, 'Any'>[] = ['Melee', 'Ranged', 'Siege'];
  const idx = (pool.faction.length + tier.length) % 3;
  return lanes[idx];
}

// ───────────────────────────────────────────────────────────
// Final output
// ───────────────────────────────────────────────────────────

export const SYNTHETIC_DECK_TEMPLATES: SyntheticDeckTemplate[] = (() => {
  const tiers: Tier[] = ['low', 'mid', 'high'];
  const variants: Variant[] = ['balanced', 'focused'];
  const out: SyntheticDeckTemplate[] = [];
  for (const pool of FACTION_POOLS) {
    for (const tier of tiers) {
      for (const variant of variants) {
        out.push(buildTemplate(pool, tier, variant));
      }
    }
  }
  return out;
})();

/** Power range expected per tier (inclusive). Used for seeder validation. */
export const TIER_POWER_RANGES: Record<Tier, { min: number; max: number }> = {
  low: { min: 15, max: 30 },
  mid: { min: 50, max: 80 },
  high: { min: 120, max: 180 },
};

/**
 * Slugify a faction name into the synthetic uid component:
 *   "Vanguard Kingdoms" → "vanguard_kingdoms"
 *   "Iron Pact"         → "iron_pact"
 */
export function factionSlug(faction: string): string {
  return faction.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Generate the deterministic uid for a synthetic account. Format:
 *   synth_<faction-slug>_<tier>_<variant-num>
 * variant-num is 1 for balanced, 2 for focused.
 */
export function syntheticUidFor(
  faction: string,
  tier: Tier,
  variant: Variant,
): string {
  const variantNum = variant === 'balanced' ? 1 : 2;
  return `synth_${factionSlug(faction)}_${tier}_${variantNum}`;
}
