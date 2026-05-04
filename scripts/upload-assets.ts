// scripts/upload-assets.ts
//
// Phase 8 asset upload pipeline. Walks `assets/cards/<faction>/<name>.png` and
// `assets/commanders/<faction>/<name>.png`, converts each PNG to WebP via
// sharp, uploads to Firebase Storage at `cards/{card_id}.webp` /
// `commanders/{commander_id}.webp`, then writes the public download URL to
// the corresponding card_library / commander_library doc's image_url field.
//
// Idempotent: if the Storage object already exists with the same byte count,
// the upload is skipped. The Firestore image_url update still runs.
//
// Run with: npx tsx scripts/upload-assets.ts
//
// Prereqs:
//   - .secrets/service-account.json must exist (gitignored)
//   - assets/ folder populated with PNGs (gitignored)

import * as path from 'path';
import * as fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { glob } from 'glob';

// ---------- Setup ----------

const SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  '.secrets/service-account.json'
);

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`✗ Service account key not found at ${SERVICE_ACCOUNT_PATH}`);
  console.error('  Download from Firebase Console → Settings → Service accounts');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'ember-crown.firebasestorage.app',
});

const db = getFirestore();
const bucket = getStorage().bucket();

// ---------- Types ----------

type AssetType = 'card' | 'commander';

type AssetEntry = {
  type: AssetType;
  faction: string;
  displayName: string;
  sourcePath: string;
};

type IdMap = Map<string, string>; // `${faction}|${displayName}` -> id

type ProcessResult =
  | { success: true; id: string; storagePath: string; uploaded: boolean }
  | { success: false; reason: string };

// ---------- Lookup map construction ----------

async function buildLookupMaps(): Promise<{ cards: IdMap; commanders: IdMap }> {
  console.log('Loading card_library and commander_library for ID lookup...');

  const [cardSnap, commanderSnap] = await Promise.all([
    db.collection('card_library').get(),
    db.collection('commander_library').get(),
  ]);

  const cards = new Map<string, string>();
  cardSnap.docs.forEach((d) => {
    const data = d.data();
    // Card docs use `card_name` (not `name`).
    const key = `${data.faction}|${data.card_name}`;
    cards.set(key, data.card_id);
  });

  const commanders = new Map<string, string>();
  commanderSnap.docs.forEach((d) => {
    const data = d.data();
    // Commander docs use `name`.
    const key = `${data.faction}|${data.name}`;
    commanders.set(key, data.commander_id);
  });

  console.log(
    `  ✓ ${cards.size} card mappings, ${commanders.size} commander mappings`
  );
  return { cards, commanders };
}

// ---------- Asset folder walker ----------

async function findAssets(rootDir: string): Promise<AssetEntry[]> {
  const entries: AssetEntry[] = [];

  // glob returns POSIX-style paths even on Windows; split on '/'.
  const cardFiles = await glob('assets/cards/*/*.png', {
    cwd: rootDir,
    posix: true,
  });
  for (const relativePath of cardFiles) {
    const parts = relativePath.split('/');
    const faction = parts[parts.length - 2];
    const displayName = path.basename(parts[parts.length - 1], '.png');
    entries.push({
      type: 'card',
      faction,
      displayName,
      sourcePath: path.join(rootDir, ...parts),
    });
  }

  const commanderFiles = await glob('assets/commanders/*/*.png', {
    cwd: rootDir,
    posix: true,
  });
  for (const relativePath of commanderFiles) {
    const parts = relativePath.split('/');
    const faction = parts[parts.length - 2];
    const displayName = path.basename(parts[parts.length - 1], '.png');
    entries.push({
      type: 'commander',
      faction,
      displayName,
      sourcePath: path.join(rootDir, ...parts),
    });
  }

  return entries;
}

// ---------- Per-asset processor ----------

async function processAsset(
  asset: AssetEntry,
  cardMap: IdMap,
  commanderMap: IdMap
): Promise<ProcessResult> {
  const lookupMap = asset.type === 'card' ? cardMap : commanderMap;
  // Source-asset filenames may include a " (Commander)" suffix to disambiguate
  // from same-named units (e.g. Iron Pact's "Forge Master" commander vs the
  // "Forge Master" class theme). Strip it before lookup; commander_library
  // stores the bare name.
  const lookupName = asset.displayName.replace(/\s*\(Commander\)\s*$/, '');
  const key = `${asset.faction}|${lookupName}`;
  const id = lookupMap.get(key);

  if (!id) {
    return {
      success: false,
      reason: `No matching ${asset.type} found for "${asset.displayName}" in faction "${asset.faction}"`,
    };
  }

  const storagePath =
    asset.type === 'card' ? `cards/${id}.webp` : `commanders/${id}.webp`;

  // Convert PNG → WebP. Cards 400x600, commanders 500x500.
  const targetWidth = asset.type === 'card' ? 400 : 500;
  const targetHeight = asset.type === 'card' ? 600 : 500;
  const webpBuffer = await sharp(asset.sourcePath)
    .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toBuffer();

  // Idempotency: skip upload if same byte count already in Storage.
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  let needsUpload = true;
  if (exists) {
    const [metadata] = await file.getMetadata();
    const existingSize = parseInt(String(metadata.size ?? '0'), 10);
    if (existingSize === webpBuffer.length) {
      needsUpload = false;
    }
  }

  if (needsUpload) {
    await file.save(webpBuffer, {
      contentType: 'image/webp',
      metadata: {
        cacheControl: 'public, max-age=31536000', // 1 year
      },
    });
    await file.makePublic();
  }

  // Public URL pattern. Bucket is publicly readable for cards/ and commanders/
  // via storage.rules; makePublic() ensures the object ACL allows anonymous GET.
  const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  // Update Firestore doc's image_url. update() creates the field if missing
  // (commander_library docs don't have image_url at seed time).
  const collection = asset.type === 'card' ? 'card_library' : 'commander_library';
  await db.collection(collection).doc(id).update({ image_url: downloadUrl });

  return { success: true, id, storagePath, uploaded: needsUpload };
}

// ---------- Global background (Phase 9 Session 2) ----------

// The title-page image is a single PNG at assets root, uploaded to
// `app/title-page.webp` and rendered as the global background by the
// GlobalBackground component. No Firestore doc to update — the URL is
// hardcoded client-side. Hero-asset quality (q=85, 1080x1920) since this
// is the background for every screen.
async function uploadGlobalBackground(rootDir: string): Promise<void> {
  const sourcePath = path.join(rootDir, 'assets', 'title-page.png');

  if (!fs.existsSync(sourcePath)) {
    console.log('  ✗ No title-page.png found at assets/title-page.png; skipping');
    return;
  }

  console.log('  Processing title-page.png...');

  const webpBuffer = await sharp(sourcePath)
    .resize(1080, 1920, { fit: 'cover', position: 'center' })
    .webp({ quality: 85 })
    .toBuffer();

  const storagePath = 'app/title-page.webp';
  const file = bucket.file(storagePath);

  const [exists] = await file.exists();
  let needsUpload = true;
  if (exists) {
    const [metadata] = await file.getMetadata();
    const existingSize = parseInt(String(metadata.size ?? '0'), 10);
    if (existingSize === webpBuffer.length) {
      needsUpload = false;
    }
  }

  if (needsUpload) {
    await file.save(webpBuffer, {
      contentType: 'image/webp',
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });
    await file.makePublic();
    console.log(`  ✓ Uploaded ${storagePath}`);
  } else {
    console.log(`  ✓ ${storagePath} already current (${webpBuffer.length} bytes)`);
  }
}

// ---------- Main ----------

async function main() {
  const rootDir = process.cwd();

  console.log('=== Ember Crown Asset Upload ===\n');

  const { cards, commanders } = await buildLookupMaps();

  console.log('\nScanning assets folder...');
  const assets = await findAssets(rootDir);
  const cardCount = assets.filter((a) => a.type === 'card').length;
  const commanderCount = assets.filter((a) => a.type === 'commander').length;
  console.log(
    `  ✓ Found ${assets.length} assets (${cardCount} cards, ${commanderCount} commanders)`
  );

  if (assets.length === 0) {
    console.log('\nNo card/commander assets found. Expected paths:');
    console.log(`  ${rootDir}/assets/cards/<faction>/<name>.png`);
    console.log(`  ${rootDir}/assets/commanders/<faction>/<name>.png`);
    // Don't return — the title-page upload below is independent and may
    // still have work to do.
    console.log('\nGlobal background...');
    try {
      await uploadGlobalBackground(rootDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ Global background upload failed: ${msg}`);
    }
    return;
  }

  console.log('\nProcessing assets...');
  let succeeded = 0;
  let uploaded = 0;
  let skippedSameBytes = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const asset of assets) {
    try {
      const result = await processAsset(asset, cards, commanders);
      if (result.success) {
        succeeded++;
        if (result.uploaded) uploaded++;
        else skippedSameBytes++;
        const tag = result.uploaded ? 'uploaded' : 'unchanged';
        console.log(
          `  ✓ ${asset.type}: ${asset.displayName} → ${result.storagePath} (${tag})`
        );
      } else {
        failed++;
        failures.push(`${asset.faction}/${asset.displayName}: ${result.reason}`);
        console.log(`  ✗ ${asset.type}: ${asset.displayName} — ${result.reason}`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${asset.faction}/${asset.displayName}: ${msg}`);
      console.log(`  ✗ ${asset.type}: ${asset.displayName} — ${msg}`);
    }
  }

  console.log('\nGlobal background...');
  try {
    await uploadGlobalBackground(rootDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ Global background upload failed: ${msg}`);
    failures.push(`global-background: ${msg}`);
    failed++;
  }

  console.log('\n=== Summary ===');
  console.log(`Succeeded: ${succeeded} (uploaded ${uploaded}, unchanged ${skippedSameBytes})`);
  console.log(`Failed:    ${failed}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
  }
}

main().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
