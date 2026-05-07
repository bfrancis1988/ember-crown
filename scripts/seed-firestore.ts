// scripts/seed-firestore.ts
//
// One-time seed script: reads Card_Library.csv and Commander_Library.csv
// from scripts/seed-data/, applies schema rewrites, and writes to Firestore
// collections card_library and commander_library. Also seeds the 54
// campaign_stages docs (Phase 5.5) from scripts/seed-data/campaign_stages.ts.
//
// Run with: npx tsx scripts/seed-firestore.ts
//
// Prereqs: .secrets/service-account.json must exist (gitignored).

import * as path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';
import { CAMPAIGN_STAGES } from './seed-data/campaign_stages';
import { EXPANSION_CARDS, type ExpansionCard } from './seed-data/expansion_cards';

// ---------- Setup ----------

const SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  '.secrets/service-account.json'
);

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`✗ Service account key not found at ${SERVICE_ACCOUNT_PATH}`);
  console.error('  Download from Firebase Console → Settings → Service accounts');
  console.error('  → Generate new private key, save as .secrets/service-account.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// ---------- Lane mapping ----------

const LANE_MAP: Record<string, string> = {
  Lane_1: 'Melee',
  Lane_2: 'Ranged',
  Lane_3: 'Siege',
};

function rewriteLane(raw: string): string {
  const trimmed = raw?.trim() ?? '';
  // Already in the new format? Pass through.
  if (['Melee', 'Ranged', 'Siege'].includes(trimmed)) return trimmed;
  if (LANE_MAP[trimmed]) return LANE_MAP[trimmed];
  throw new Error(`Unrecognized Optimal_Lane value: "${raw}"`);
}

function normalizeFaction(raw: string): string {
  const trimmed = raw?.trim() ?? '';
  return trimmed.startsWith('The ') ? trimmed.slice(4) : trimmed;
}

// ---------- Race resolution ----------

function resolveRace(
  faction: string,
  klass: string,
  existingRace: string | undefined
): string {
  const trimmedExisting = existingRace?.trim();
  if (trimmedExisting) return trimmedExisting;

  switch (faction) {
    case 'Vanguard Kingdoms':
      return 'Human';
    case 'Iron Pact':
      return klass === 'Warrior' || klass === 'Behemoth' ? 'Dwarf' : 'Orc';
    case 'Arborea Kingdom':
      return 'Elf';
    case 'Ashen Swarm':
      return 'Undead';
    case 'Obsidian Empire':
      return klass === 'Behemoth' ? 'Dragon' : 'Dragonborn';
    case 'Feral Hollow':
      if (klass === 'Rogue') return 'Werewolf';
      if (klass === 'Mage' || klass === 'Healer') return 'Swampkin';
      return 'Beast';
    default:
      throw new Error(`Unknown faction "${faction}" — cannot resolve race`);
  }
}

// ---------- Commander templates ----------

function passiveForLane(lane: string) {
  switch (lane) {
    case 'Melee':
      return {
        type: 'ignore_debuffs',
        description: 'Cards in your Melee lane ignore debuffs.',
        params: { lane: 'Melee' },
      };
    case 'Ranged':
      return {
        type: 'foresight',
        description: 'At the start of each round, draw 1 extra card.',
        params: { extra_cards: 1 },
      };
    case 'Siege':
      return {
        type: 'apex_predator',
        description: 'Your highest-power card in the Siege lane gets +2.',
        params: { lane: 'Siege', amount: 2 },
      };
    default:
      throw new Error(`No passive template for lane "${lane}"`);
  }
}

function activeForLane(lane: string) {
  switch (lane) {
    case 'Melee':
      return {
        type: 'rally',
        description: 'All cards in your Melee lane gain +2 power this round.',
        params: { lane: 'Melee', amount: 2 },
      };
    case 'Ranged':
      return {
        type: 'redeploy',
        description: 'Move one of your own units from any lane to any other lane.',
        params: {},
      };
    case 'Siege':
      return {
        type: 'crushing_blow',
        description: 'Destroy the lowest-power enemy unit in target lane.',
        params: {},
      };
    default:
      throw new Error(`No active template for lane "${lane}"`);
  }
}

// ---------- CSV reading ----------

function readCsv(filename: string): Record<string, string>[] {
  const fullPath = path.resolve(process.cwd(), 'scripts/seed-data', filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`CSV not found: ${fullPath}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf-8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true, // strip BOM if present
  });
}

// ---------- Card transformation ----------

function buildCardDoc(row: Record<string, string>) {
  const cardId = row.Card_ID;
  const cardType = row.Card_Type;
  const faction = normalizeFaction(row.Faction);
  const klass = row.Class;
  const basePower = row.Base_Power ? parseInt(row.Base_Power, 10) : 0;

  // Phase 9.4.2A: every card_library doc gets keywords/keyword_params/
  // optimal_lane_bonus fields. Existing CSV rows have no keyword data, so
  // they default to empty arrays/objects and the standard +2 lane bonus.
  const base = {
    card_id: cardId,
    card_name: row.Card_Name,
    card_type: cardType,
    faction,
    rarity: row.Rarity,
    base_power: basePower,
    klass,
    image_url: '',
    keywords: [] as string[],
    keyword_params: {} as Record<string, unknown>,
    optimal_lane_bonus: 2,
    ability_text: '',
    flavor_text: '',
  };

  if (cardType === 'Unit') {
    return {
      ...base,
      optimal_lane: rewriteLane(row.Optimal_Lane),
      race: resolveRace(faction, klass, row.Race),
    };
  }

  if (cardType === 'Spell') {
    // Normalize spell class. CSV is now Curse/Cleanse, but accept legacy
    // 'Debuff' too in case an older CSV gets merged in later.
    let spellKlass: 'Curse' | 'Cleanse';
    if (klass === 'Debuff' || klass === 'Curse') spellKlass = 'Curse';
    else if (klass === 'Cleanse') spellKlass = 'Cleanse';
    else throw new Error(`Unknown spell Class "${klass}" for ${cardId}`);

    if (spellKlass === 'Curse') {
      return {
        ...base,
        klass: spellKlass,
        target_side: 'enemy',
        lane_affinity: rewriteLane(row.Optimal_Lane),
      };
    }

    // Cleanse: no card-level lane affinity. Accept Optimal_Lane='Any' without
    // calling rewriteLane (this was the bug that dropped 12 cleanses in Phase 1).
    return {
      ...base,
      klass: spellKlass,
      target_side: 'self',
    };
  }

  throw new Error(`Unknown Card_Type "${cardType}" for ${cardId}`);
}

function buildExpansionCardDoc(card: ExpansionCard) {
  const faction = normalizeFaction(card.faction);
  return {
    card_id: card.card_id,
    card_name: card.card_name,
    card_type: card.card_type,
    faction,
    rarity: card.rarity,
    base_power: card.base_power,
    klass: card.klass,
    image_url: '',
    optimal_lane: card.optimal_lane,
    race: resolveRace(faction, card.klass, card.race),
    keywords: card.keywords,
    keyword_params: card.keyword_params,
    optimal_lane_bonus: card.optimal_lane_bonus ?? 2,
    ability_text: card.ability_text,
    flavor_text: card.flavor_text,
  };
}

// ---------- Commander transformation ----------

function buildCommanderDoc(row: Record<string, string>) {
  const lane = rewriteLane(row.Optimal_Lane);
  return {
    commander_id: row.Commander_ID,
    name: row.Commander_Name,
    faction: normalizeFaction(row.Faction),
    lane,
    passive: passiveForLane(lane),
    active: activeForLane(lane),
  };
}

// ---------- Write helpers ----------

async function writeBatch(
  collection: string,
  docs: { id: string; data: Record<string, unknown> }[]
) {
  // Firestore batches max out at 500 ops. Our datasets are well under that
  // (88 + 18 = 106), so a single batch is fine.
  const batch = db.batch();
  for (const { id, data } of docs) {
    batch.set(db.collection(collection).doc(id), data);
  }
  await batch.commit();
}

// ---------- Campaign stages ----------

async function seedCampaignStages(db: Firestore): Promise<void> {
  console.log('→ Seeding/updating campaign stages...');
  const stagesCol = db.collection('campaign_stages');

  // Two paths:
  //   - Fresh seed (< 54 docs): full create with computed opponent decks.
  //   - Full set exists (>= 54): upsert rewards only, preserving deck tuning
  //     and any other manual edits. Lets future reward tuning be a one-line
  //     edit + re-seed.
  const existing = await stagesCol.count().get();
  const fullSetExists = existing.data().count >= CAMPAIGN_STAGES.length;

  let cardsByFaction: Map<string, string[]> | null = null;
  if (!fullSetExists) {
    // Only need to load card_library when creating fresh.
    const cardLibrarySnap = await db.collection('card_library').get();
    cardsByFaction = new Map<string, string[]>();
    cardLibrarySnap.docs.forEach((d) => {
      const data = d.data();
      if (data.card_type !== 'Unit') return;
      const list = cardsByFaction!.get(data.faction) ?? [];
      list.push(data.card_id);
      cardsByFaction!.set(data.faction, list);
    });
  }

  function buildDeck(factionId: string): string[] {
    const available = cardsByFaction!.get(factionId) ?? [];
    if (available.length === 0) {
      console.warn(`  ⚠ No unit cards found for faction ${factionId}!`);
      return [];
    }
    const deck: string[] = [];
    for (let i = 0; i < 15; i++) {
      // Cycle through the faction's units. Phase 7 will hand-tune per stage.
      deck.push(available[i % available.length]);
    }
    return deck;
  }

  let batch = db.batch();
  let writeCount = 0;
  let totalWritten = 0;
  for (const seed of CAMPAIGN_STAGES) {
    const ref = stagesCol.doc(seed.stage_id);
    if (fullSetExists) {
      // Upsert rewards only; preserve all other fields (including any
      // hand-tuned opponent_deck_card_ids).
      batch.update(ref, { rewards: seed.rewards });
    } else {
      const stage = {
        ...seed,
        opponent_deck_card_ids: buildDeck(seed.faction),
        created_at: FieldValue.serverTimestamp(),
      };
      batch.set(ref, stage);
    }
    writeCount++;
    totalWritten++;
    // Firestore batch limit is 500 ops. 54 fits in one, but guard anyway.
    if (writeCount >= 450) {
      await batch.commit();
      batch = db.batch();
      writeCount = 0;
    }
  }
  if (writeCount > 0) await batch.commit();

  console.log(
    `  ✓ ${fullSetExists ? 'Updated rewards on' : 'Seeded'} ${totalWritten} campaign stages.`
  );
}

// ---------- Main ----------

async function main() {
  console.log('→ Reading CSVs...');
  const cardRows = readCsv('Card_Library.csv');
  const commanderRows = readCsv('Commander_Library.csv');
  console.log(`  ${cardRows.length} card rows, ${commanderRows.length} commander rows`);

  console.log('→ Transforming card data...');
  const csvCardDocs = cardRows.map((row) => ({
    id: row.Card_ID,
    data: buildCardDoc(row),
  }));
  const expansionCardDocs = EXPANSION_CARDS.map((card) => ({
    id: card.card_id,
    data: buildExpansionCardDoc(card),
  }));
  console.log(
    `  ${csvCardDocs.length} CSV cards + ${expansionCardDocs.length} expansion cards = ${csvCardDocs.length + expansionCardDocs.length} total`
  );

  // Detect duplicate IDs across the two sources to fail loud, not silently overwrite.
  const csvIds = new Set(csvCardDocs.map((d) => d.id));
  const expansionDupes = expansionCardDocs.filter((d) => csvIds.has(d.id));
  if (expansionDupes.length > 0) {
    throw new Error(
      `Expansion cards collide with CSV card_ids: ${expansionDupes.map((d) => d.id).join(', ')}`
    );
  }
  const cardDocs = [...csvCardDocs, ...expansionCardDocs];

  console.log('→ Transforming commander data...');
  const commanderDocs = commanderRows.map((row) => ({
    id: row.Commander_ID,
    data: buildCommanderDoc(row),
  }));

  console.log(`→ Writing ${cardDocs.length} cards to card_library...`);
  await writeBatch('card_library', cardDocs);
  console.log('  ✓ Cards written');

  console.log(`→ Writing ${commanderDocs.length} commanders to commander_library...`);
  await writeBatch('commander_library', commanderDocs);
  console.log('  ✓ Commanders written');

  await seedCampaignStages(db);

  console.log('\n✓ Seed complete.');
}

main().catch((err) => {
  console.error('\n✗ Seed failed:', err.message);
  console.error(err);
  process.exit(1);
});