// scripts/verify-starter-ids.ts
//
// One-shot Firestore verifier for Phase 3 Vanguard starter set. Reads each
// candidate card_id from card_library and reports presence + summary fields.
// Exits non-zero if any id is missing.
//
// Run with: npx tsx scripts/verify-starter-ids.ts

import * as path from 'path';
import * as fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  '.secrets/service-account.json'
);

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`✗ Service account key not found at ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

initializeApp({
  credential: cert(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))),
});

const db = getFirestore();

const STARTER_IDS = [
  'UNT-VAN-01',
  'UNT-VAN-02',
  'UNT-VAN-03',
  'UNT-VAN-04',
  'UNT-VAN-05',
  'SPL-VAN-CLN',
];

async function main() {
  let missing = 0;
  for (const id of STARTER_IDS) {
    const snap = await db.collection('card_library').doc(id).get();
    if (!snap.exists) {
      console.error(`  ✗ ${id} — MISSING`);
      missing++;
      continue;
    }
    const d = snap.data() as Record<string, unknown>;
    console.log(
      `  ✓ ${id} — ${d.card_name} (${d.card_type}, ${d.rarity}, faction=${d.faction})`
    );
  }
  if (missing > 0) {
    console.error(`\n✗ ${missing}/${STARTER_IDS.length} starter ids not in Firestore.`);
    process.exit(1);
  }
  console.log(`\n✓ All ${STARTER_IDS.length} starter ids present in card_library.`);
}

main().catch((err) => {
  console.error('\n✗ Verification failed:', err.message);
  process.exit(1);
});
