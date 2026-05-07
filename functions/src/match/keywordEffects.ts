// functions/src/match/keywordEffects.ts
// Phase 9.4.2A — keyword resolution helpers (Cleave / Veteran / Burn).
// Phase 9.4.2B — adds Swarm (token spawn on play) and Ritual (sacrifice
// allied unit on play, transfer base power).
// Pure functions where possible; play-time hooks stage writes onto the
// same batch the caller already owns.
//
// Rally is handled in calculatePower.ts because it's an aura recomputed on
// every power refresh, not a one-shot effect.

import type { WriteBatch, Firestore, Timestamp } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { LiveBoardState, TokenData } from '../types/board';
import { laneToLocationState } from '../types/board';
import { LANES, type Lane } from '../lib/matchConstants';
import type { Side } from '../types/match';

// ---------- Adjacency ----------

const ADJACENT_LANES: Record<Lane, Lane[]> = {
  Melee: ['Ranged'],
  Ranged: ['Melee', 'Siege'],
  Siege: ['Ranged'],
};

// Spec compromise: the Phase 9.4.2 spec says Siege is "adjacent to both Melee
// and Ranged for damage radius". We follow the row-adjacent model above
// (Siege ↔ Ranged ↔ Melee) so Cleave from Siege reaches into Ranged but not
// across the board into Melee. Keeps the math intuitive.

// ---------- Cleave ----------

type CleaveParams = {
  damage?: number;
  damage_split?: number[];
};

type CardLibForCleave = {
  card_id: string;
  card_type: 'Unit' | 'Spell';
  base_power: number;
  keywords?: string[];
  keyword_params?: Record<string, unknown>;
};

export type CleaveContext = {
  matchId: string;
  callerSide: Side;
  playedLane: Lane;
  playedCardLib: CardLibForCleave;
  db: Firestore;
  batch: WriteBatch;
};

/**
 * If the played card has the cleave keyword, deal damage to one (or split
 * across multiple) enemy unit(s) in adjacent lanes. Stages writes onto the
 * caller's batch — caller is responsible for committing.
 *
 * Selection rule: prefer the strongest live enemy in adjacent lanes. For
 * damage_split, pick top-N strongest distinct units.
 *
 * Returns metadata for logging.
 */
export async function applyCleaveOnPlay(
  ctx: CleaveContext,
): Promise<{ targets_hit: string[]; total_damage: number } | null> {
  const { playedCardLib } = ctx;
  if (!playedCardLib.keywords?.includes('cleave')) return null;

  const params = (playedCardLib.keyword_params?.cleave ?? {}) as CleaveParams;

  let damageHits: number[];
  if (Array.isArray(params.damage_split) && params.damage_split.length > 0) {
    damageHits = params.damage_split.filter((d) => d > 0);
  } else if (typeof params.damage === 'number' && params.damage > 0) {
    damageHits = [params.damage];
  } else {
    return null; // misconfigured cleave entry — silent no-op
  }

  const enemySide: Side = ctx.callerSide === 'player_a' ? 'player_b' : 'player_a';
  const adjacentLanes = ADJACENT_LANES[ctx.playedLane];
  const adjacentLocations = adjacentLanes.map((l) => laneToLocationState(l));

  // Load all live enemy units in adjacent lanes for this match.
  const snap = await ctx.db
    .collection('live_board_state')
    .where('match_id', '==', ctx.matchId)
    .where('owner', '==', enemySide)
    .where('location_state', 'in', adjacentLocations)
    .get();

  if (snap.empty) return { targets_hit: [], total_damage: 0 };

  // Sort by current_power DESC so first picks are the strongest.
  const enemies = snap.docs
    .map((d) => d.data() as LiveBoardState)
    .sort((a, b) => b.current_power - a.current_power);

  const targets_hit: string[] = [];
  let total_damage = 0;

  for (let i = 0; i < damageHits.length && i < enemies.length; i++) {
    const target = enemies[i];
    const damage = damageHits[i];
    const newPower = Math.max(0, target.current_power - damage);
    const ref = ctx.db.collection('live_board_state').doc(target.instance_id);

    if (newPower <= 0) {
      // Destroyed: send to discard, reset current_power.
      ctx.batch.update(ref, {
        location_state: 'discard',
        current_power: 0,
      });
    } else {
      ctx.batch.update(ref, { current_power: newPower });
    }

    targets_hit.push(target.instance_id);
    total_damage += damage;
  }

  logger.info('Cleave applied', {
    match_id: ctx.matchId,
    played_card: playedCardLib.card_id,
    played_lane: ctx.playedLane,
    targets_hit,
    total_damage,
  });

  return { targets_hit, total_damage };
}

// ---------- Veteran ----------

export type CardForVeteran = {
  instance_id: string;
  card_id: string;
  base_power_bonus?: number;
};

export type VeteranContext = {
  matchId: string;
  laneCards: CardForVeteran[];
  cardLibraryMap: Map<string, { keywords?: string[]; keyword_params?: Record<string, unknown>; base_power: number }>;
  batch: WriteBatch;
  db: Firestore;
};

/**
 * Round-start (called during the round transition in executeEndRound, BEFORE
 * the lane wipe) — for each lane unit with the veteran keyword, increment its
 * base_power_bonus by the configured boost. Stages writes onto the caller's
 * batch.
 *
 * Returns the new bonus per instance so the caller can fold it into the
 * post-wipe current_power reset.
 */
export function applyVeteranAtRoundEnd(ctx: VeteranContext): Map<string, number> {
  const newBonusByInstance = new Map<string, number>();

  for (const card of ctx.laneCards) {
    const lib = ctx.cardLibraryMap.get(card.card_id);
    if (!lib) continue;
    if (!lib.keywords?.includes('veteran')) continue;
    const params = (lib.keyword_params?.veteran ?? {}) as { boost?: number };
    const boost = params.boost ?? 0;
    if (boost === 0) continue;

    const next = (card.base_power_bonus ?? 0) + boost;
    newBonusByInstance.set(card.instance_id, next);

    const ref = ctx.db.collection('live_board_state').doc(card.instance_id);
    ctx.batch.update(ref, { base_power_bonus: next });
  }

  if (newBonusByInstance.size > 0) {
    logger.info('Veteran applied', {
      match_id: ctx.matchId,
      affected: newBonusByInstance.size,
    });
  }

  return newBonusByInstance;
}

// ---------- Burn ----------

type BurnParams = {
  target_scope?: 'lane' | 'global';
  target_filter?: 'random_enemy' | 'all_enemies' | 'random_enemy_in_lane';
  damage?: number;
};

export type CardForBurn = {
  instance_id: string;
  owner: Side;
  card_id: string;
  location_state: LiveBoardState['location_state'];
  current_power: number;
};

export type BurnContext = {
  matchId: string;
  laneCards: CardForBurn[];
  cardLibraryMap: Map<string, { keywords?: string[]; keyword_params?: Record<string, unknown>; base_power: number }>;
  batch: WriteBatch;
  db: Firestore;
};

/**
 * Round-end (called from executeEndRound BEFORE VP tally so destroyed units
 * don't score). For each lane unit with the burn keyword, pick targets per
 * its keyword_params and stage damage updates. Returns destroyed instance_ids
 * so the caller can exclude them from VP.
 */
export function applyBurnAtRoundEnd(
  ctx: BurnContext,
): { destroyed: Set<string>; updatedPowers: Map<string, number> } {
  const destroyed = new Set<string>();
  const updatedPowers = new Map<string, number>(); // tracks pending damage so chained burns see it

  // Snapshot the starting power per instance so each burn computes against
  // the same baseline (deterministic for the round-end pass).
  const livePower = new Map<string, number>();
  for (const c of ctx.laneCards) livePower.set(c.instance_id, c.current_power);

  // Sort burns deterministically by instance_id so the order doesn't drift
  // between runs.
  const burnSources = ctx.laneCards
    .filter((c) => {
      const lib = ctx.cardLibraryMap.get(c.card_id);
      return lib?.keywords?.includes('burn');
    })
    .sort((a, b) => a.instance_id.localeCompare(b.instance_id));

  for (const source of burnSources) {
    const lib = ctx.cardLibraryMap.get(source.card_id)!;
    const params = (lib.keyword_params?.burn ?? {}) as BurnParams;
    const damage = params.damage ?? 0;
    if (damage <= 0) continue;

    const scope = params.target_scope ?? 'lane';
    const filter = params.target_filter ?? 'random_enemy';

    // Candidate enemies: opposite owner, still in a lane (not destroyed).
    let candidates = ctx.laneCards.filter(
      (c) => c.owner !== source.owner && !destroyed.has(c.instance_id),
    );
    if (scope === 'lane') {
      candidates = candidates.filter((c) => c.location_state === source.location_state);
    }
    if (candidates.length === 0) continue;

    let targets: CardForBurn[];
    if (filter === 'all_enemies') {
      targets = candidates;
    } else {
      // Both random_enemy and random_enemy_in_lane: pick one at random.
      // (lane scoping is already applied above.)
      targets = [candidates[Math.floor(Math.random() * candidates.length)]];
    }

    for (const target of targets) {
      const current = livePower.get(target.instance_id) ?? target.current_power;
      const next = Math.max(0, current - damage);
      livePower.set(target.instance_id, next);
      updatedPowers.set(target.instance_id, next);

      const ref = ctx.db.collection('live_board_state').doc(target.instance_id);
      if (next <= 0) {
        destroyed.add(target.instance_id);
        ctx.batch.update(ref, { location_state: 'discard', current_power: 0 });
      } else {
        ctx.batch.update(ref, { current_power: next });
      }
    }
  }

  if (burnSources.length > 0) {
    logger.info('Burn applied', {
      match_id: ctx.matchId,
      sources: burnSources.length,
      destroyed_count: destroyed.size,
      updated_power_count: updatedPowers.size,
    });
  }

  return { destroyed, updatedPowers };
}

// ---------- Swarm (Phase 9.4.2B) ----------

type SwarmParams = {
  token_type?: 'drone_token' | 'wretchling_token';
  token_power?: number;
  spawn_count?: number;
  spawn_pattern?: 'adjacent_lanes' | 'all_lanes' | 'this_lane';
};

type CardLibForSwarm = {
  card_id: string;
  faction?: string;
  keywords?: string[];
  keyword_params?: Record<string, unknown>;
};

export type SwarmContext = {
  matchId: string;
  callerSide: Side;
  playedLane: Lane;
  playedCardLib: CardLibForSwarm;
  batch: WriteBatch;
  db: Firestore;
  now: Timestamp | FieldValue;
};

const TOKEN_DISPLAY: Record<NonNullable<SwarmParams['token_type']>, { name: string; klass: string }> = {
  drone_token: { name: 'Drone', klass: 'Swarm' },
  wretchling_token: { name: 'Wretchling', klass: 'Brood' },
};

/**
 * Resolve the spawn lanes for a Swarm trigger, repeating to satisfy
 * spawn_count when the pattern provides fewer slots than tokens (e.g.
 * adjacent_lanes from Melee yields only [Ranged] but spawn_count = 2 → both
 * tokens land in Ranged).
 */
function resolveSpawnLanes(
  pattern: SwarmParams['spawn_pattern'],
  origin: Lane,
  spawnCount: number,
): Lane[] {
  let pool: Lane[];
  switch (pattern) {
    case 'all_lanes':
      pool = [...LANES];
      break;
    case 'this_lane':
      pool = [origin];
      break;
    case 'adjacent_lanes':
    default:
      pool = ADJACENT_LANES[origin];
      break;
  }
  if (pool.length === 0) pool = [origin];

  const out: Lane[] = [];
  for (let i = 0; i < spawnCount; i++) {
    out.push(pool[i % pool.length]);
  }
  return out;
}

/**
 * If the played card has the swarm keyword, spawn token units according to
 * its keyword_params. Tokens are LiveBoardState docs with is_token=true and
 * inline token_data — they have no card_library entry.
 */
export function applySwarmOnPlay(
  ctx: SwarmContext,
): { spawned: string[]; spawn_lanes: Lane[] } | null {
  const lib = ctx.playedCardLib;
  if (!lib.keywords?.includes('swarm')) return null;
  const params = (lib.keyword_params?.swarm ?? {}) as SwarmParams;

  const tokenType = params.token_type ?? 'drone_token';
  const tokenPower = params.token_power ?? 1;
  const spawnCount = params.spawn_count ?? 0;
  if (spawnCount <= 0) return null;

  const display = TOKEN_DISPLAY[tokenType];
  const tokenFaction = lib.faction ?? '';
  const lanes = resolveSpawnLanes(params.spawn_pattern, ctx.playedLane, spawnCount);

  const spawned: string[] = [];
  for (const lane of lanes) {
    const instance_id = `tok_${crypto.randomUUID()}`;
    const tokenData: TokenData = {
      card_name: display.name,
      faction: tokenFaction,
      base_power: tokenPower,
      klass: display.klass,
    };
    const doc: LiveBoardState = {
      instance_id,
      match_id: ctx.matchId,
      owner: ctx.callerSide,
      // Synthetic card_id so the existing Firestore lookups don't crash;
      // applyPowerUpdates and the client both branch on is_token first.
      card_id: `${tokenType}_${tokenPower}`,
      current_power: tokenPower,
      location_state: laneToLocationState(lane),
      status_effect: null,
      created_at: ctx.now as Timestamp,
      is_token: true,
      token_data: tokenData,
    };
    ctx.batch.set(ctx.db.collection('live_board_state').doc(instance_id), doc);
    spawned.push(instance_id);
  }

  logger.info('Swarm spawned', {
    match_id: ctx.matchId,
    token_type: tokenType,
    token_power: tokenPower,
    spawn_count: spawned.length,
    lanes,
  });

  return { spawned, spawn_lanes: lanes };
}

// ---------- Ritual (Phase 9.4.2B) ----------

type RitualParams = {
  mode?: 'optional_single' | 'all_in_lane';
  power_per_sacrifice?: number;
};

type CardLibForRitual = {
  card_id: string;
  base_power: number;
  keywords?: string[];
  keyword_params?: Record<string, unknown>;
};

export type RitualContext = {
  matchId: string;
  callerSide: Side;
  playedLane: Lane;
  playedInstanceId: string;
  playedCardLib: CardLibForRitual;
  // Client-supplied for mode='optional_single'. Ignored for all_in_lane.
  sacrificeTargetInstanceId: string | null;
  batch: WriteBatch;
  db: Firestore;
};

/**
 * Resolve a Ritual on play. Stages writes onto the batch.
 *
 * For `optional_single`:
 *   - If sacrificeTargetInstanceId is null/undefined, no-op (player skipped).
 *   - Otherwise sacrifice that one allied unit (must be in a lane, allied,
 *     not the played card itself); add its `base_power + base_power_bonus`
 *     to the played card's current_power.
 *
 * For `all_in_lane`:
 *   - Sacrifice all OTHER allied units in the played card's lane.
 *   - Add (count × power_per_sacrifice) to the played card's current_power.
 *
 * Returns metadata for logging. Throws HttpsError on validation failure.
 */
export async function applyRitualOnPlay(
  ctx: RitualContext,
): Promise<{ sacrificed: string[]; power_gain: number } | null> {
  const lib = ctx.playedCardLib;
  if (!lib.keywords?.includes('ritual')) return null;
  const params = (lib.keyword_params?.ritual ?? {}) as RitualParams;
  const mode = params.mode ?? 'optional_single';

  const playedRef = ctx.db.collection('live_board_state').doc(ctx.playedInstanceId);

  if (mode === 'all_in_lane') {
    const lanePerSac = params.power_per_sacrifice ?? 0;
    const targetLoc = laneToLocationState(ctx.playedLane);

    const snap = await ctx.db
      .collection('live_board_state')
      .where('match_id', '==', ctx.matchId)
      .where('owner', '==', ctx.callerSide)
      .where('location_state', '==', targetLoc)
      .get();

    const sacrificed: string[] = [];
    for (const d of snap.docs) {
      const data = d.data() as LiveBoardState;
      // Skip the just-placed Ritual card itself (it was set to this lane on
      // the same batch — but the read above is pre-commit, so it shouldn't
      // appear; defensive skip in case of trigger reorder).
      if (data.instance_id === ctx.playedInstanceId) continue;
      ctx.batch.update(d.ref, { location_state: 'discard', current_power: 0 });
      sacrificed.push(data.instance_id);
    }

    const power_gain = sacrificed.length * lanePerSac;
    if (power_gain > 0) {
      ctx.batch.update(playedRef, {
        current_power: lib.base_power + power_gain,
      });
    }

    logger.info('Ritual (all_in_lane) applied', {
      match_id: ctx.matchId,
      played: ctx.playedInstanceId,
      sacrificed_count: sacrificed.length,
      power_gain,
    });
    return { sacrificed, power_gain };
  }

  // optional_single
  if (!ctx.sacrificeTargetInstanceId) {
    return { sacrificed: [], power_gain: 0 };
  }
  if (ctx.sacrificeTargetInstanceId === ctx.playedInstanceId) {
    // Defensive: client UI prevents this, server-side reject silently rather
    // than throwing — fall back to "no sacrifice."
    logger.warn('Ritual: sacrifice target equals played card — skipping', {
      match_id: ctx.matchId,
      played: ctx.playedInstanceId,
    });
    return { sacrificed: [], power_gain: 0 };
  }

  const targetRef = ctx.db.collection('live_board_state').doc(ctx.sacrificeTargetInstanceId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    logger.warn('Ritual: target not found', {
      match_id: ctx.matchId,
      target: ctx.sacrificeTargetInstanceId,
    });
    return { sacrificed: [], power_gain: 0 };
  }
  const target = targetSnap.data() as LiveBoardState;
  if (target.match_id !== ctx.matchId) {
    logger.warn('Ritual: target belongs to another match — skipping', {
      match_id: ctx.matchId,
      target: ctx.sacrificeTargetInstanceId,
    });
    return { sacrificed: [], power_gain: 0 };
  }
  if (target.owner !== ctx.callerSide) {
    logger.warn('Ritual: target is not allied — skipping', {
      match_id: ctx.matchId,
      target: ctx.sacrificeTargetInstanceId,
      target_owner: target.owner,
    });
    return { sacrificed: [], power_gain: 0 };
  }
  // Target must be on the board (in a lane). Hand/discard/deck are not valid.
  if (!['melee', 'ranged', 'siege'].includes(target.location_state)) {
    logger.warn('Ritual: target not in a lane — skipping', {
      match_id: ctx.matchId,
      target: ctx.sacrificeTargetInstanceId,
      target_location: target.location_state,
    });
    return { sacrificed: [], power_gain: 0 };
  }

  // Resolve target's effective base power. Tokens use their inline base_power;
  // real cards use card_library.base_power + base_power_bonus. We don't have
  // the target's card_library entry here without an extra read, but tokens
  // self-describe via token_data and real units are dominated by
  // base_power_bonus + their own current_power baseline. Use current_power
  // as a robust proxy (post-buffs/debuffs) — that's the unit's "live worth"
  // at the moment of sacrifice, which matches player expectation better than
  // a stale base_power.
  const power_gain = target.current_power;

  ctx.batch.update(targetRef, {
    location_state: 'discard',
    current_power: 0,
  });
  ctx.batch.update(playedRef, {
    current_power: lib.base_power + power_gain,
  });

  logger.info('Ritual (optional_single) applied', {
    match_id: ctx.matchId,
    played: ctx.playedInstanceId,
    target: ctx.sacrificeTargetInstanceId,
    power_gain,
  });
  return { sacrificed: [ctx.sacrificeTargetInstanceId], power_gain };
}
