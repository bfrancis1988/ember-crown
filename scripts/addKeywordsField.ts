// scripts/addKeywordsField.ts
//
// Phase 9.4.2A migration: backfill `keywords: []` and `keyword_params: {}`
// onto every existing card_library doc that doesn't already have them.
// Idempotent — safe to re-run.
//
// Run with: npx tsx scripts/addKeywordsField.ts
//
// Prereqs: .secrets/service-account.json must exist (gitignored).

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

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  console.log('→ Reading card_library...');
  const snap = await db.collection('card_library').get();
  console.log(`  ${snap.size} docs found`);

  const batch = db.batch();
  let needsUpdate = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const updates: Record<string, unknown> = {};
    if (!Array.isArray(data.keywords)) updates.keywords = [];
    if (data.keyword_params === undefined || data.keyword_params === null) {
      updates.keyword_params = {};
    }
    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      needsUpdate++;
    }
  }

  if (needsUpdate === 0) {
    console.log('✓ All cards already have keywords/keyword_params. Nothing to do.');
    return;
  }

  await batch.commit();
  console.log(`✓ Backfilled ${needsUpdate} card(s) with keywords/keyword_params defaults.`);
}

main().catch((err) => {
  console.error('\n✗ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
});
