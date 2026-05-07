// scripts/seedSyntheticOpponents.ts
//
// Phase 9.4.5-extras: seed 36 synthetic opponent decks (6 factions × 3 tiers
// × 2 variants) into Firestore for Battle Mode matchmaking variety. Synthetic
// accounts have no Firebase Auth user — they exist purely as data shells:
//   player_profiles/{uid}     — flagged is_synthetic_opponent: true
//   player_inventories/{uid}  — populated with the cards used by their deck
//   player_saved_decks/{uid}  — single slot-1 deck, battle_mode_eligible
//
// Idempotent: re-running skips any synthetic uid whose profile already
// exists. To force-overwrite, use `--force` (rebuilds profile/inventory/deck
// for all 36).
//
// Run with: npx tsx scripts/seedSyntheticOpponents.ts [--force]
//
// Prereqs: .secrets/service-account.json must exist (gitignored).

import * as path from 'path';
import * as fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { computeDeckPower } from '../functions/src/lib/computeDeckPower';
import { anonymizedNameFor } from '../functions/src/lib/anonymizedNames';
import {
  SYNTHETIC_DECK_TEMPLATES,
  TIER_POWER_RANGES,
  syntheticUidFor,
  type SyntheticDeckTemplate,
} from './syntheticOpponents/deckTemplates';

const SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  '.secrets/service-account.json',
);

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`✗ Service account key not found at ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const FORCE = process.argv.includes('--force');

async function main() {
  console.log(`→ Loading card_library...`);
  const libSnap = await db.collection('card_library').get();
  const cardLibrary = new Map<string, { rarity: string; faction: string }>();
  for (const d of libSnap.docs) {
    const data = d.data();
    cardLibrary.set(d.id, {
      rarity: data.rarity as string,
      faction: data.faction as string,
    });
  }
  console.log(`  ${cardLibrary.size} cards indexed`);

  console.log(`→ Loading commander_library...`);
  const cmdSnap = await db.collection('commander_library').get();
  const commanderById = new Map<string, { faction: string; base_power: number }>();
  for (const d of cmdSnap.docs) {
    const data = d.data();
    const id = (data.commander_id as string) ?? d.id;
    commanderById.set(id, {
      faction: data.faction as string,
      base_power: (data.base_power as number | undefined) ?? 0,
    });
  }
  console.log(`  ${commanderById.size} commanders indexed`);

  // Pre-validate every template against the live library before writing
  // anything, so we fail loud instead of leaving partial state.
  console.log(`→ Validating ${SYNTHETIC_DECK_TEMPLATES.length} templates...`);
  for (const t of SYNTHETIC_DECK_TEMPLATES) {
    validateTemplate(t, cardLibrary, commanderById);
  }
  console.log(`  ✓ All ${SYNTHETIC_DECK_TEMPLATES.length} templates valid against live library`);

  let created = 0;
  let skipped = 0;
  const factionTallies = new Map<string, Map<string, number>>();

  for (const template of SYNTHETIC_DECK_TEMPLATES) {
    const uid = syntheticUidFor(template.faction, template.tier, template.variant);
    const profileRef = db.collection('player_profiles').doc(uid);

    const existing = await profileRef.get();
    if (existing.exists && !FORCE) {
      skipped++;
      continue;
    }

    const username = anonymizedNameFor(uid);
    const commanderMeta = commanderById.get(template.commander_id)!;
    const powerScore = computeDeckPower(
      template.card_ids,
      cardLibrary,
      { base_power: commanderMeta.base_power },
    );

    // Sanity: actual power should match the template's expected_power and
    // also fall within the tier range. Fail loud if not.
    if (powerScore !== template.expected_power) {
      throw new Error(
        `Template ${uid}: expected_power=${template.expected_power}, computed=${powerScore}. Library may have shifted; regenerate templates.`,
      );
    }
    const range = TIER_POWER_RANGES[template.tier];
    if (powerScore < range.min || powerScore > range.max) {
      throw new Error(
        `Template ${uid}: power ${powerScore} outside tier range [${range.min}, ${range.max}]`,
      );
    }

    // Inventory: one doc per unique card_id, qty = number of copies in deck.
    const counts = new Map<string, number>();
    for (const id of template.card_ids) counts.set(id, (counts.get(id) ?? 0) + 1);

    // Saved deck doc id — deterministic so re-seeding (with --force) overwrites
    // the same doc rather than creating drift.
    const deckId = `slot1_${uid}`;
    const deckRef = db
      .collection('player_saved_decks')
      .doc(uid)
      .collection('decks')
      .doc(deckId);

    // Build a single batch per synthetic account (well under the 500 op cap:
    // 1 profile + ≤15 inventory + 1 deck = max 17 ops).
    const batch = db.batch();

    batch.set(profileRef, {
      player_id: uid,
      username,
      is_synthetic_opponent: true,
      active_faction: template.faction,
      unlocked_factions: [template.faction],
      solo_unlocked_factions: [],
      selected_commander: template.commander_id,
      onboarding_step: 999, // sentinel — skips onboarding entirely
      tutorial_completed: true,
      tutorial_reward_claimed: true,
      battle_mode_decks_shareable: true,
      active_saved_deck_id: deckId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    for (const [cardId, qty] of counts) {
      const invRef = db
        .collection('player_inventories')
        .doc(uid)
        .collection('cards')
        .doc(cardId);
      batch.set(invRef, {
        card_id: cardId,
        quantity_owned: qty,
        updated_at: FieldValue.serverTimestamp(),
      });
    }

    batch.set(deckRef, {
      deck_id: deckId,
      name: template.name,
      faction: template.faction,
      commander_id: template.commander_id,
      slot_number: 1,
      card_ids: template.card_ids,
      power_score: powerScore,
      battle_mode_eligible: true,
      source_player_uid: uid,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    created++;

    const tierMap = factionTallies.get(template.faction) ?? new Map<string, number>();
    tierMap.set(template.tier, (tierMap.get(template.tier) ?? 0) + 1);
    factionTallies.set(template.faction, tierMap);

    console.log(
      `  ✓ ${uid} (${template.tier}/${template.variant}) — ${template.name}, power ${powerScore}`,
    );
  }

  console.log('');
  console.log(`✓ Done. Created ${created}, skipped ${skipped} (already existed).`);
  if (created > 0) {
    console.log('');
    console.log('Distribution:');
    for (const [faction, tierMap] of factionTallies) {
      const summary = ['low', 'mid', 'high']
        .map((t) => `${t}=${tierMap.get(t) ?? 0}`)
        .join(' ');
      console.log(`  ${faction.padEnd(20)} ${summary}`);
    }
  }
}

function validateTemplate(
  template: SyntheticDeckTemplate,
  cardLibrary: Map<string, { rarity: string; faction: string }>,
  commanderById: Map<string, { faction: string; base_power: number }>,
): void {
  if (template.card_ids.length !== 15) {
    throw new Error(`${template.name}: deck has ${template.card_ids.length} cards (must be 15)`);
  }
  const counts = new Map<string, number>();
  for (const id of template.card_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if (n > 4) throw new Error(`${template.name}: ${n} copies of ${id} (max 4)`);
    const lib = cardLibrary.get(id);
    if (!lib) throw new Error(`${template.name}: unknown card_id ${id}`);
    if (lib.faction !== template.faction) {
      throw new Error(
        `${template.name}: card ${id} belongs to ${lib.faction}, not ${template.faction}`,
      );
    }
  }
  const cmd = commanderById.get(template.commander_id);
  if (!cmd) {
    throw new Error(`${template.name}: unknown commander ${template.commander_id}`);
  }
  if (cmd.faction !== template.faction) {
    throw new Error(
      `${template.name}: commander ${template.commander_id} belongs to ${cmd.faction}, not ${template.faction}`,
    );
  }
}

main().catch((err) => {
  console.error('\n✗ Seed failed:', err.message);
  console.error(err);
  process.exit(1);
});
