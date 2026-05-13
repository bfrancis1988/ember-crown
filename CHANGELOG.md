# Changelog

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
