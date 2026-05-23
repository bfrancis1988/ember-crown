// Pure logic for drawing 3 dailies + 3 weeklies. No Firestore — the
// callers (assignQuests + the settlement path's rollover handler) feed
// in the player's faction eligibility and the assignment renders
// AssignedQuest objects ready to write.

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type {
  AssignedQuest,
  QuestDefinition,
  QuestPeriod,
} from './questTypes';
import { getAllDefinitionsForPeriod } from './questDefinitions';
import { factionSlug } from './questCycles';

const HIGH_RARITIES = ['Rare', 'Epic', 'Legendary'] as const;

export type EligibilityContext = {
  // Factions where the player owns >= min_cards_in_faction cards.
  // Eligible factions for faction-filtered quest assignment.
  eligibleFactions: string[];
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function renderTitle(template: string, n: number, filter_value?: string): string {
  let out = template.replace('{n}', String(n));
  if (filter_value) {
    out = out.replace('{faction}', filter_value).replace('{rarity}', filter_value);
  }
  return out;
}

function isAssignableForPlayer(
  def: QuestDefinition,
  ctx: EligibilityContext,
): boolean {
  if (def.filter === 'faction') {
    return ctx.eligibleFactions.length > 0;
  }
  return true;
}

function resolveAssignment(def: QuestDefinition, ctx: EligibilityContext): AssignedQuest {
  // For conditional_match: target_min..target_max is the THRESHOLD range
  // (the N). The goal count is always 1. For everything else, the range
  // is the goal count itself.
  let target: number;
  let threshold: number | undefined;
  if (def.tracker_kind === 'conditional_match') {
    target = 1;
    threshold = randInt(def.target_min, def.target_max);
  } else {
    target = randInt(def.target_min, def.target_max);
    threshold = undefined;
  }

  // Pick a filter value if applicable.
  let filter_value: string | undefined;
  if (def.filter === 'faction') {
    filter_value = pickRandom(ctx.eligibleFactions);
  } else if (def.filter === 'rarity') {
    const rarities = def.filter_options?.rarities ?? [...HIGH_RARITIES];
    filter_value = pickRandom([...rarities]);
  }

  // Title uses the displayed N: for conditional_match that's the threshold;
  // for streak it's the goal count; for counter it's the goal count.
  const displayN = def.tracker_kind === 'conditional_match' ? (threshold ?? 0) : target;
  const title = renderTitle(def.title_template, displayN, filter_value);

  const q: AssignedQuest = {
    quest_id: def.quest_id,
    target,
    progress: 0,
    claimed: false,
    assigned_at: FieldValue.serverTimestamp() as unknown as Timestamp,
    title,
    reward: { ...def.reward },
  };
  if (threshold !== undefined) q.threshold = threshold;
  if (filter_value !== undefined) q.filter_value = filter_value;
  return q;
}

// Sample N quests from the pool without replacement. Honors weights and
// the "is_always_assigned" flag (those are pinned).
function sampleQuests(
  pool: QuestDefinition[],
  countNeeded: number,
  ctx: EligibilityContext,
): QuestDefinition[] {
  const pinned = pool.filter((d) => d.is_always_assigned);
  const optional = pool.filter((d) => !d.is_always_assigned && isAssignableForPlayer(d, ctx));

  const picked: QuestDefinition[] = [...pinned];
  const remaining = countNeeded - picked.length;
  const pickedIds = new Set(picked.map((d) => d.quest_id));

  // Weighted sampling without replacement.
  const available = [...optional];
  for (let i = 0; i < remaining && available.length > 0; i++) {
    const totalWeight = available.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * totalWeight;
    let chosenIdx = 0;
    for (let j = 0; j < available.length; j++) {
      r -= available[j].weight;
      if (r <= 0) { chosenIdx = j; break; }
    }
    const chosen = available[chosenIdx];
    if (!pickedIds.has(chosen.quest_id)) {
      picked.push(chosen);
      pickedIds.add(chosen.quest_id);
    }
    available.splice(chosenIdx, 1);
  }
  return picked;
}

export function assignNewQuests(
  period: QuestPeriod,
  ctx: EligibilityContext,
): AssignedQuest[] {
  const pool = getAllDefinitionsForPeriod(period);
  const picks = sampleQuests(pool, 3, ctx);
  return picks.map((def) => resolveAssignment(def, ctx));
}

// Used by settlement and the claim hook to translate (counter_key, filter_value)
// into the actual storage key. For unfiltered quests, it's just counter_key.
// For faction-filtered, the value is suffixed: "matches_won_with_vanguard_kingdoms".
export function effectiveCounterKey(counter_key: string, filter_value?: string): string {
  if (!filter_value) return counter_key;
  if (counter_key.endsWith('_with')) {
    return `${counter_key}_${factionSlug(filter_value)}`;
  }
  // Rarity-filtered counters: counter_key already encodes the rarity scope.
  // (In v1.1 we only have "cards_played_rare_or_higher" which is unfiltered.)
  return counter_key;
}
