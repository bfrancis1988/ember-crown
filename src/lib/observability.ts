// src/lib/observability.ts
// Phase 9.5B: Crashlytics + Analytics initialization. Both are native modules
// that ship with the Phase 9.5B EAS rebuild — pre-rebuild dev clients will
// throw on require, so the module wraps every entry point in a safe no-op
// fallback that logs once and continues.

import crashlytics from '@react-native-firebase/crashlytics';

let crashlyticsAvailable: boolean | null = null;

function isCrashlyticsLoaded(): boolean {
  if (crashlyticsAvailable !== null) return crashlyticsAvailable;
  try {
    crashlytics();
    crashlyticsAvailable = true;
  } catch (err) {
    crashlyticsAvailable = false;
    console.warn(
      'Crashlytics native module unavailable — skipping. ' +
        '(Expected on dev clients built before Phase 9.5B.)',
      err,
    );
  }
  return crashlyticsAvailable;
}

export async function initObservability(): Promise<void> {
  if (!isCrashlyticsLoaded()) return;
  try {
    await crashlytics().setCrashlyticsCollectionEnabled(true);
  } catch (err) {
    console.warn('Crashlytics collection enable failed:', err);
  }
}

export function setObservabilityUser(uid: string | null): void {
  if (!isCrashlyticsLoaded()) return;
  try {
    // Crashlytics: empty string clears the user id.
    crashlytics().setUserId(uid ?? '');
  } catch (err) {
    console.warn('Crashlytics setUserId failed:', err);
  }
}

// Records a non-fatal error to Crashlytics (and always console.warns for dev
// visibility). `context` is logged as a breadcrumb and prefixes the console
// line, so otherwise-silent failures surface in production crash reports.
export function recordError(error: unknown, context?: string): void {
  console.warn(`recordError${context ? ` [${context}]` : ''}:`, error);
  if (!isCrashlyticsLoaded()) return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    if (context) crashlytics().log(context);
    crashlytics().recordError(err);
  } catch (e) {
    console.warn('Crashlytics recordError failed:', e);
  }
}
