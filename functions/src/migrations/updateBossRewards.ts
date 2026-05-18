// functions/src/migrations/updateBossRewards.ts
//
// Update 1.0.5 migration. Brings the 6 production boss stage documents
// (campaign_stages/{faction}_09) in line with the rebalanced rewards in
// scripts/seed-data/campaign_stages.ts. Seed data only takes effect for new
// installs; existing Firestore docs need an explicit update.
//
// Trigger: HTTPS GET/POST.
//
// Auth: Firebase ID-token verification.
//   - Caller must send `Authorization: Bearer <id_token>`.
//   - Token is verified server-side with admin.auth().verifyIdToken().
//   - 401 — header missing, malformed, or token rejected by verifyIdToken.
//   - 403 — token verifies but decoded.uid !== ADMIN_UID.
//   - Header spoofing is not possible because the token is a Firebase-signed
//     JWT, not a value the client picks.
//
// Calling it: this is a one-shot deploy migration, not a routine endpoint.
// The practical workflow:
//   1. Sign in as the admin user (UID OC1tZd0jtvX7Sahm4LqMp8aBC0J2) in the
//      Ember Crown app, the Firebase emulator UI, or via the Firebase Console
//      custom-token flow.
//   2. Grab a fresh ID token: `firebase.auth().currentUser.getIdToken()`.
//      Tokens expire after 1 hour — refresh if the call fails with 401.
//   3. curl -H "Authorization: Bearer <token>" \
//        https://us-central1-<project-id>.cloudfunctions.net/updateBossRewards
//
// Idempotent: re-running after the values already match is a no-op for the
// stage doc and logs a skip per stage.

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const ADMIN_UID = 'OC1tZd0jtvX7Sahm4LqMp8aBC0J2';

const BOSS_STAGE_IDS = [
  'vanguard_kingdoms_09',
  'iron_pact_09',
  'arborea_kingdom_09',
  'ashen_swarm_09',
  'obsidian_empire_09',
  'feral_hollow_09',
] as const;

const NEW_REWARDS = { coins: 300, shards: 4, keys: 1 } as const;

type StageResult =
  | { stage_id: string; status: 'updated'; before: unknown; after: typeof NEW_REWARDS }
  | { stage_id: string; status: 'skipped_already_current' }
  | { stage_id: string; status: 'skipped_missing' };

export const updateBossRewards = onRequest(
  { region: 'us-central1' },
  async (req, res) => {
    // ── Auth: Bearer ID token ────────────────────────────────────────────
    const authHeader = req.get('authorization') ?? req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('updateBossRewards rejected — missing or malformed Authorization header');
      res.status(401).json({ success: false, error: 'unauthorized' });
      return;
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) {
      logger.warn('updateBossRewards rejected — empty bearer token');
      res.status(401).json({ success: false, error: 'unauthorized' });
      return;
    }

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      logger.warn('updateBossRewards rejected — verifyIdToken failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(401).json({ success: false, error: 'unauthorized' });
      return;
    }

    if (decoded.uid !== ADMIN_UID) {
      logger.warn('updateBossRewards rejected — non-admin uid', {
        uid: decoded.uid,
      });
      res.status(403).json({ success: false, error: 'forbidden' });
      return;
    }

    // ── Migration body ───────────────────────────────────────────────────
    const db = admin.firestore();
    const results: StageResult[] = [];

    for (const stageId of BOSS_STAGE_IDS) {
      const ref = db.collection('campaign_stages').doc(stageId);
      const snap = await ref.get();
      if (!snap.exists) {
        logger.warn('Boss stage missing during migration', { stage_id: stageId });
        results.push({ stage_id: stageId, status: 'skipped_missing' });
        continue;
      }
      const data = snap.data();
      const current = data?.rewards as
        | { coins?: number; shards?: number; keys?: number }
        | undefined;

      if (
        current &&
        current.coins === NEW_REWARDS.coins &&
        current.shards === NEW_REWARDS.shards &&
        current.keys === NEW_REWARDS.keys
      ) {
        logger.info('Boss stage already at target rewards — skipping', {
          stage_id: stageId,
        });
        results.push({ stage_id: stageId, status: 'skipped_already_current' });
        continue;
      }

      await ref.update({
        rewards: NEW_REWARDS,
        updated_at: FieldValue.serverTimestamp(),
      });

      logger.info('Boss stage rewards updated', {
        stage_id: stageId,
        before: current ?? null,
        after: NEW_REWARDS,
      });

      results.push({
        stage_id: stageId,
        status: 'updated',
        before: current ?? null,
        after: NEW_REWARDS,
      });
    }

    const updated = results.filter((r) => r.status === 'updated').length;
    const skippedCurrent = results.filter((r) => r.status === 'skipped_already_current').length;
    const missing = results.filter((r) => r.status === 'skipped_missing').length;

    logger.info('updateBossRewards migration complete', {
      caller_uid: decoded.uid,
      updated,
      skipped_already_current: skippedCurrent,
      missing,
    });

    res.status(200).json({
      success: true,
      summary: { updated, skipped_already_current: skippedCurrent, missing },
      results,
    });
  },
);
