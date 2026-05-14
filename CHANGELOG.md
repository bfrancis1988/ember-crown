# Changelog

## v1.0.2 — 2026-05-14

### New: Play as Guest

- Added a "Try as Guest" option on the sign-in screen
- Guests can access the full single-player experience: tutorial, solo
  matches, campaign, deck building, and the card library
- Battle Mode (async multiplayer) still requires an account
- Guests are reminded at key moments that creating an account preserves
  their progress
- A "Save Progress" button on the home screen lets guests upgrade
  anytime, keeping all their progress

### Internal

- Firebase Anonymous Auth support
- linkWithCredential flow for guest-to-account upgrades

## v1.0.1 (Update 1) — 2026-05-13

### Battle Mode improvements
- Card thumbnails now show base power alongside current power
- Long-press a card in your hand to see full art and details mid-match
- Lane indicator highlights the optimal lane when a card is selected

### Bug fixes (Cloud Functions)
- Fixed potential double-credit exploit in match reward claiming
- Fixed cleanup of completed solo/campaign/battle-mode matches (Firestore growth)
- Fixed cleanup of cancelled matches from account deletion
- Made commander activation transactional to prevent rare double-fire

### Internal
- MatchStatus type now includes 'cancelled' state
