// src/lib/completeOnboarding.ts
// Final step of the new-player flow. Thin wrapper around the
// completeOnboardingFn Cloud Function, which atomically grants the wallet,
// starter inventory, and 15-slot active deck for the player's chosen
// faction and flips player_profiles/{uid}.onboarding_step from 3 → 4.
//
// Phase 5.75 hotfix: Cloud Function port complete.
//   Previously: client-side writeBatch with dual idempotency (D10.5 hotfix).
//   Now: server-side Cloud Function with Firestore transaction. True atomicity.
//   The client-side wrapper is preserved so home.tsx's useEffect doesn't
//   need to change shape.

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { FactionId } from './factions';

type CompleteOnboardingResult = {
  success: true;
  onboarding_step: 4;
};

// `uid` is intentionally unused: the Cloud Function reads it from
// request.auth. We keep it in the signature so home.tsx's call site doesn't
// have to change. Phase 6 may revisit if we add a server-side audit log
// that wants the client to echo the uid explicitly.
export async function completeOnboarding(
  uid: string,
  factionId: FactionId
): Promise<void> {
  console.log('completeOnboarding: invoking Cloud Function', { uid, factionId });

  try {
    const fn = httpsCallable<{ factionId: string }, CompleteOnboardingResult>(
      functions,
      'completeOnboardingFn'
    );
    const result = await fn({ factionId });
    console.log('completeOnboarding: Cloud Function returned', { uid, result: result.data });
  } catch (err: any) {
    console.error('completeOnboarding: Cloud Function failed', { uid, error: err.message });
    throw err;
  }
}
