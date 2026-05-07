// scripts/backfillSoloUnlocks.ts
//
// Phase 9.4.4 backfill: walk every player_profiles doc, count their unique
// cards per faction, and write solo_unlocked_factions for every faction that
// has crossed the 12-unique-card threshold.
//
// Sticky semantics make this idempotent — re-running can only ever add
// factions to solo_unlocked_factions, never remove them. Safe to retry on
// partial failure.
//
// Run with: npx tsx scripts/backfillSoloUnlocks.ts
//
// Prereqs: .secrets/service-account.json must exist (gitignored).

import * as path from 'path';
import * as fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

const ALL_FACTIONS = [
  'Vanguard Kingdoms',
  'Iron Pact',
  'Arborea Kingdom',
  'Ashen Swarm',
  'Obsidian Empire',
  'Feral Hollow',
] as const;

const SOLO_UNLOCK_THRESHOLD = 12;

async function main() {
  console.log('→ Loading card_library...');
  const libSnap = await db.collection('card_library').get();
  const cardFactions = new Map<string, string>();
  for (const doc of libSnap.docs) {
    const faction = doc.data().faction;
    if (typeof faction === 'string') {
      cardFactions.set(doc.id, faction);
    }
  }
  console.log(`  ${cardFactions.size} card_library entries indexed`);

  console.log('→ Reading player_profiles...');
  const profilesSnap = await db.collection('player_profiles').get();
  console.log(`  ${profilesSnap.size} profiles found`);

  let processed = 0;
  let withNewUnlocks = 0;
  let unchanged = 0;

  for (const profileDoc of profilesSnap.docs) {
    processed++;
    const uid = profileDoc.id;
    const profile = profileDoc.data();
    const currentSolo = new Set<string>(
      Array.isArray(profile.solo_unlocked_factions)
        ? profile.solo_unlocked_factions
        : [],
    );

    const invSnap = await db
      .collection('player_inventories')
      .doc(uid)
      .collection('cards')
      .get();

    const factionCounts = new Map<string, number>();
    for (const cardDoc of invSnap.docs) {
      const qty = cardDoc.data().quantity_owned ?? 0;
      if (qty < 1) continue;
      const faction = cardFactions.get(cardDoc.id);
      if (!faction) continue;
      factionCounts.set(faction, (factionCounts.get(faction) ?? 0) + 1);
    }

    const newlyUnlocked: string[] = [];
    for (const faction of ALL_FACTIONS) {
      if (currentSolo.has(faction)) continue;
      const count = factionCounts.get(faction) ?? 0;
      if (count >= SOLO_UNLOCK_THRESHOLD) {
        newlyUnlocked.push(faction);
      }
    }

    if (newlyUnlocked.length === 0) {
      unchanged++;
      continue;
    }

    const next = [...currentSolo, ...newlyUnlocked];
    await profileDoc.ref.update({
      solo_unlocked_factions: next,
      updated_at: FieldValue.serverTimestamp(),
    });
    withNewUnlocks++;
    console.log(
      `  ✓ ${uid}: +[${newlyUnlocked.join(', ')}] (now [${next.join(', ')}])`,
    );
  }

  console.log('');
  console.log(`✓ ${processed} profiles processed.`);
  console.log(`  ${withNewUnlocks} had new solo unlocks computed.`);
  console.log(`  ${unchanged} unchanged.`);
}

main().catch((err) => {
  console.error('\n✗ Backfill failed:', err.message);
  console.error(err);
  process.exit(1);
});
