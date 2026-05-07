// scripts/cleanupSyntheticOpponents.ts
//
// Phase 9.4.5-extras: defensive escape hatch. Reads every player_profiles
// doc with is_synthetic_opponent == true and deletes:
//   - player_profiles/{uid}
//   - player_inventories/{uid}/cards/* (all)
//   - player_saved_decks/{uid}/decks/* (all)
//
// Real-player accounts never have is_synthetic_opponent set, so this is
// safe to run unattended. Use this if synthetic opponents need to be removed
// post-launch (e.g., once the real-player pool is large enough that they
// cause more clustering than variety).
//
// Run with: npx tsx scripts/cleanupSyntheticOpponents.ts

import * as path from 'path';
import * as fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

async function main() {
  console.log('→ Reading synthetic profiles...');
  const profilesSnap = await db
    .collection('player_profiles')
    .where('is_synthetic_opponent', '==', true)
    .get();

  if (profilesSnap.empty) {
    console.log('✓ No synthetic opponents found. Nothing to remove.');
    return;
  }

  console.log(`  ${profilesSnap.size} synthetic profiles found`);

  let removedProfiles = 0;
  let removedInventoryDocs = 0;
  let removedDeckDocs = 0;

  for (const profileDoc of profilesSnap.docs) {
    const uid = profileDoc.id;

    // Delete inventory cards subcollection.
    const invSnap = await db
      .collection('player_inventories')
      .doc(uid)
      .collection('cards')
      .get();
    for (const d of invSnap.docs) {
      await d.ref.delete();
      removedInventoryDocs++;
    }

    // Delete saved decks subcollection.
    const decksSnap = await db
      .collection('player_saved_decks')
      .doc(uid)
      .collection('decks')
      .get();
    for (const d of decksSnap.docs) {
      await d.ref.delete();
      removedDeckDocs++;
    }

    // Finally the profile itself.
    await profileDoc.ref.delete();
    removedProfiles++;
    console.log(`  ✓ Removed ${uid}`);
  }

  console.log('');
  console.log(`✓ Removed ${removedProfiles} synthetic opponents.`);
  console.log(`  ${removedInventoryDocs} inventory docs deleted.`);
  console.log(`  ${removedDeckDocs} saved-deck docs deleted.`);
}

main().catch((err) => {
  console.error('\n✗ Cleanup failed:', err.message);
  console.error(err);
  process.exit(1);
});
