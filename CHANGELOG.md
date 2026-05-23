# Changelog

## v1.1.0 — 2026-05-23

### New features

- Daily and weekly quest system. Complete quests to earn coins,
  shards, and keys.
- Brand new summon animation with rarity-themed crystal effects.

### Animation polish

- Cards now fly from your hand to the lane when played.
- Damage and healing numbers float above affected cards.
- Card power numbers smoothly transition color when buffed or
  debuffed.
- Lane debuffs now pulse to draw attention.

### Bug fixes (from 1.0.7)

- Cleave now properly damages enemy units.
- Ritual now properly grants the played card a power bonus.

### Match record fix

Your Record screen now correctly tracks lifetime match totals.
Previously, completed matches were being archived from our servers
after 12 hours, which caused your win count to slowly shrink over
time. Now every match is permanently recorded the moment it ends.

Note: counts shown are matches played from 1.1.0 forward. Earlier
matches couldn't be recovered.

## v1.0.7 — 2026-05-21

### Bug fixes

- Cleave now properly damages enemy units (previously, non-lethal
  Cleave damage was being reverted).
- Ritual now properly grants the played card a power bonus from
  sacrificed allies (previously, the bonus was being lost).
- Removed unused visual code from card rendering.

## v1.0.6 — 2026-05-19

### Polish

- Splash screen now displays correctly across all devices.
- Card status effects (buffs, debuffs, curses) now fade in with a
  subtle pulse to draw attention.
- Lane debuff indicators now have a gentle pulse animation while
  active.

## v1.0.5 — 2026-05-18

### Balance update

- Adjusted match and campaign rewards for better long-term progression.
- Win streaks now grant bonus shards, rewarding consistent play.
- Summon prices and rare banner odds retuned for a more balanced pull experience.
- Ad reward values rebalanced.
- Behind-the-scenes migration ensures existing campaign progress carries over fairly.

### Internal

- Added test coverage for economy systems.

## v1.0.4 — 2026-05-17

- Added Card Library button to the home screen for quick deck reference.

## v1.0.3 — 2026-05-15

### Tutorial improvements

- Tutorial tooltips now appear at the right moments — when you need
  to know, not after you've already done it.
- New "It's your turn" prompt explains tap-to-select.
- New optimal lane hint points out the green-glowing lane when you
  select a unit.
- The Pass button is now explained when the enemy passes (instead
  of after you accidentally tap it).
- The Commander tooltip now appears once your commander is buffing
  your lanes, with clear "tap your Commander" direction.
- Spell card hint explains that effects vary and to read each card.
- Several wording fixes: tutorial no longer says "drag" when the UI
  is tap-based.

### AI difficulty fixes

- Solo and campaign AI opponents now cap their deck rarity at the
  highest rarity in your active deck, not your inventory. Pulling a
  Legendary in a faction you don't play no longer makes your starter
  matches unwinnable.

### Internal

- Removed dead tutorial_complete tooltip code.

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
