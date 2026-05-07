// scripts/migrateActiveDecksToSavedDecks.ts
//
// Phase 9.4.5A migration: convert each player's existing active deck into a
// slot-1 saved deck per faction. After this runs, the deck the player has
// "live" today is preserved and named "{Faction} Deck 1" with a computed
// power score.
//
// Idempotent: a re-run skips any (uid, faction) where slot 1 already exists.
// Does NOT delete player_active_decks/{uid}/slots — that data stays as a
// fallback while Phase 9.4.5B/C wires the saved decks into all read sites.
// A later phase can clean up.
//
// Edge cases handled:
//   - players whose active_deck spans multiple factions get one slot-1 per
//     faction (rare but possible if they edited across faction tabs)
//   - players whose active deck has < 15 cards get a slot-1 with whatever
//     they have — saveDeck UI will require 15 to overwrite, but the
//     migration preserves their work
//   - missing selected_commander: fall back to first commander in the
//     faction's commander_library; logged for visibility
//
// Run with: npx tsx scripts/migrateActiveDecksToSavedDecks.ts
//
// Prereqs: .secrets/service-account.json must exist (gitignored).

import * as path from 'path';
import * as fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { computeDeckPower } from '../functions/src/lib/computeDeckPower';

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

const DEFAULT_FACTION = 'Vanguard Kingdoms';

async function main() {
  console.log('→ Loading card_library...');
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

  console.log('→ Loading commander_library...');
  const cmdSnap = await db.collection('commander_library').get();
  const commanderById = new Map<string, { faction: string; base_power: number }>();
  const commandersByFaction = new Map<string, string[]>();
  for (const d of cmdSnap.docs) {
    const data = d.data();
    const faction = data.faction as string;
    const id = (data.commander_id as string) ?? d.id;
    const basePower = (data.base_power as number | undefined) ?? 0;
    commanderById.set(id, { faction, base_power: basePower });
    const list = commandersByFaction.get(faction) ?? [];
    list.push(id);
    commandersByFaction.set(faction, list);
  }
  console.log(`  ${commanderById.size} commanders indexed`);

  console.log('→ Reading player_profiles...');
  const profilesSnap = await db.collection('player_profiles').get();
  console.log(`  ${profilesSnap.size} profiles found`);

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let warnings = 0;

  for (const profileDoc of profilesSnap.docs) {
    processed++;
    const uid = profileDoc.id;
    const profile = profileDoc.data();

    const slotsSnap = await db
      .collection('player_active_decks')
      .doc(uid)
      .collection('slots')
      .get();

    if (slotsSnap.empty) continue;

    // Group by faction.
    const byFaction = new Map<string, string[]>();
    for (const s of slotsSnap.docs) {
      const data = s.data();
      const faction = (data.faction as string | undefined) ?? DEFAULT_FACTION;
      const cardId = data.card_id as string;
      if (!cardId) continue;
      const list = byFaction.get(faction) ?? [];
      list.push(cardId);
      byFaction.set(faction, list);
    }

    for (const [faction, cardIds] of byFaction) {
      // Idempotency: skip if any slot 1 already exists for this (uid, faction).
      const existing = await db
        .collection('player_saved_decks')
        .doc(uid)
        .collection('decks')
        .where('faction', '==', faction)
        .where('slot_number', '==', 1)
        .limit(1)
        .get();
      if (!existing.empty) {
        skipped++;
        continue;
      }

      // Resolve commander.
      let commanderId: string | null =
        (profile.selected_commander as string | undefined) ?? null;
      if (commanderId) {
        const cmdMeta = commanderById.get(commanderId);
        if (!cmdMeta || cmdMeta.faction !== faction) {
          // Selected commander doesn't match this faction; fall back.
          commanderId = null;
        }
      }
      if (!commanderId) {
        const factionCommanders = commandersByFaction.get(faction);
        if (factionCommanders && factionCommanders.length > 0) {
          commanderId = factionCommanders[0];
          warnings++;
          console.log(
            `  ! ${uid}/${faction}: no matching selected_commander; falling back to ${commanderId}`,
          );
        } else {
          console.log(
            `  ✗ ${uid}/${faction}: no commanders in library for this faction; skipping`,
          );
          continue;
        }
      }

      const cmdMeta = commanderById.get(commanderId)!;
      const powerScore = computeDeckPower(cardIds, cardLibrary, {
        base_power: cmdMeta.base_power,
      });

      const decksCol = db
        .collection('player_saved_decks')
        .doc(uid)
        .collection('decks');
      const newDeckRef = decksCol.doc();

      await newDeckRef.set({
        deck_id: newDeckRef.id,
        name: `${faction} Deck 1`,
        faction,
        commander_id: commanderId,
        slot_number: 1,
        card_ids: cardIds,
        power_score: powerScore,
        battle_mode_eligible: true,
        source_player_uid: uid,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      // Backfill the privacy field on the profile so it's queryable. Also
      // set active_saved_deck_id if the migrated faction matches the
      // player's currently-active faction (so existing matches still find
      // the same deck).
      const updates: Record<string, unknown> = {
        battle_mode_decks_shareable: true,
        updated_at: FieldValue.serverTimestamp(),
      };
      if (
        (profile.active_faction as string | undefined) === faction &&
        !profile.active_saved_deck_id
      ) {
        updates.active_saved_deck_id = newDeckRef.id;
      }
      await profileDoc.ref.update(updates);

      created++;
      console.log(
        `  ✓ ${uid}/${faction}: created slot 1 deck (${cardIds.length} cards, power ${powerScore})`,
      );
    }
  }

  console.log('');
  console.log(`✓ ${processed} players processed.`);
  console.log(`  ${created} slot-1 decks created.`);
  console.log(`  ${skipped} skipped (already migrated).`);
  if (warnings > 0) {
    console.log(`  ${warnings} commander-fallback warnings — review log above.`);
  }
}

main().catch((err) => {
  console.error('\n✗ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
});
