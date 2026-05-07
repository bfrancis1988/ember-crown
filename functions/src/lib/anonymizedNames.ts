// functions/src/lib/anonymizedNames.ts
// Phase 9.4.5C: static pool of opponent display names for Battle Mode v1.
// Picked deterministically from the opponent deck's deck_id so the same
// deck always appears under the same name (avoids the disorientation of
// "Marshal of the East" suddenly becoming "Crimson Sentinel" mid-session).
//
// v1.1+ may swap this for actual usernames once moderation is in place.
// Until then, anonymity protects opt-out semantics — even players who
// haven't toggled battle_mode_decks_shareable yet aren't outed by name.

const ANONYMIZED_NAMES: readonly string[] = [
  'Marshal of the East',
  'Voice of the Hollow',
  'Crimson Sentinel',
  'Whisper of Ash',
  'Champion of the Vale',
  'Iron Wolf',
  'Cursebreaker',
  'Stormbinder',
  'Sable Captain',
  'Warden of Embers',
  'Bone Heretic',
  'Lantern of the Pact',
  'Greenmantle',
  'Hollowtongue',
  'Throne-Sworn',
  'Last of the Vigil',
  'Ashen Herald',
  'Oathkeeper',
  'Tidebreaker',
  'Sunless Crown',
] as const;

/**
 * Hash a string to a non-negative 32-bit integer (FNV-1a). Stable across
 * runs and platforms — important so the same deck_id maps to the same name
 * across all of a player's Battle Mode sessions.
 */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Math.imul keeps multiplication 32-bit; >>> 0 forces unsigned.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function anonymizedNameFor(deckId: string): string {
  if (!deckId) return ANONYMIZED_NAMES[0];
  const idx = fnv1a(deckId) % ANONYMIZED_NAMES.length;
  return ANONYMIZED_NAMES[idx];
}
