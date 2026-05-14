# Ember Crown — Project Context

This file is the design contract and orientation guide for any AI agent
or developer working on the Ember Crown codebase. Read this first
before making changes.

## What this is

Ember Crown is a dark fantasy collectible card game for mobile (iOS + 
Android). Three-lane combat across multiple rounds. Six factions, 144 
cards, 18 commanders. Free to play with optional rewarded ads.

**Status:** Shipped to Google Play closed beta (May 2026). App Store
submission in progress (anonymous auth update underway after Apple
rejection for Guideline 5.1.1).

## Stack

- **Mobile:** Expo SDK 54 + React Native 0.81 + TypeScript
- **Routing:** Expo Router (file-based, `app/` directory)
- **Backend:** Firebase Auth + Firestore + Cloud Functions (Node.js 22, 
  2nd gen)
- **Ads:** Google Mobile Ads (AdMob), rewarded video format, 
  non-personalized only (CCPA Path B)
- **Crash/Analytics:** Firebase Crashlytics + Analytics
- **Dev environment:** Windows + PowerShell + VS Code
- **Build/Distribution:** EAS Build, EAS-managed keystore for Android, 
  Apple-managed signing for iOS

## Repo structure
ember-crown/
├── app/                      Expo Router screens (file-based routing)
│   ├── (auth)/              Sign-in, sign-up, forgot password
│   ├── (app)/               Main app screens (home, match, guild hall, etc.)
│   ├── onboarding/          Faction picker, tutorial flow
│   └── _layout.tsx          Root layout, splash gating, auth routing
├── src/
│   ├── components/          Reusable UI (match/, library/, auth/, etc.)
│   ├── contexts/            React contexts (AuthContext, etc.)
│   ├── data/                Card data (cards.json, commanders.json)
│   ├── game/                Game engine (state, combat, lane logic)
│   ├── lib/                 Utilities (firebase, observability, admob, analytics)
│   ├── types/               TypeScript types (card, match, player, board)
│   └── hooks/               Custom hooks (usePlayerProfile, etc.)
├── functions/               Firebase Cloud Functions
│   └── src/
│       ├── match/           Match lifecycle (initialize, play card, claim rewards)
│       ├── onboarding/      Onboarding flow, tutorial completion
│       ├── profile/         Account management, delete user
│       ├── economy/         Wallet, craft, disenchant
│       ├── decks/           Save/delete/activate decks
│       └── types/           Shared types (mirrors src/types)
├── assets/                  Icons, splash, adaptive icon
├── store-assets/            Screenshots, store descriptions
├── scripts/                 Build helpers, seed scripts
├── app.json                 Expo config (package names, plugins, ios/android)
├── eas.json                 EAS Build profiles (development, preview, production)
├── firestore.rules          Firestore security rules
├── CHANGELOG.md             Version history
└── CLAUDE.md                This file

## Key product decisions

### Six factions

- **Vanguard Kingdoms** — Disciplined infantry, holy crusaders, order/light
- **Iron Pact** — Dwarven kings, smithing, heavy armor
- **Arborea Kingdom** — Elven and earthen, nature magic
- **Ashen Swarm** — Undead, necromancers, witches — they want to end life
- **Obsidian Empire** — Dark wizards, dragons, humans, brute force
- **Feral Hollow** — Blood witches, monsters, dark magic, corruption

(Note: Vanguard is the starter faction. All players unlock it on signup. 
Other factions unlock via campaign progression.)

### Game architecture

- **Three lanes** per side. Players place Unit cards into lanes.
- **Multiple rounds.** Both players pass to end a round. Winner is 
  determined by total VP across lanes.
- **Card types:** Unit (placed in a lane), Spell (Curse, Cleanse, etc.), 
  Commander (special faction leader with active ability).
- **Damage types:** factional, but no rock-paper-scissors wheel
- **No PvP in real-time.** Battle Mode is async — your opponent is an 
  AI playing a real player's deck.
- **Card rarities:** Common, Uncommon, Rare, Epic, Legendary
- **Economy:** Coins (currency), Shards (crafting), Keys (pack opens). 
  No premium currency in v1 (IAP planned for v1.1+).

### Monetization stance

- **Free to play, no pay-to-win.** Earn all cards through play.
- **Optional rewarded ads** to double match rewards (~30-50% of match 
  rewards baseline).
- **NO premium currency, NO Battle Pass, NO stamina in v1.**
- **IAP planned for v1.1.** Will not be pay-to-win — likely cosmetic 
  card backs, faction banners, etc.

**IMPORTANT:** Do NOT use "no pay-to-win" or "no paywall" claims in 
store descriptions or marketing copy. IAP is planned and these claims 
would create bait-and-switch risk later. Use "free to play, earn cards 
through gameplay" instead.

## Known architectural debt

These are documented as accepted-risk-for-v1 in the codebase:

1. **Active-deck slots have no server-side ownership validation.** 
   firestore.rules:138-144 allows the owner to write any card_id. 
   initializeNewMatch trusts the slot data. A malicious client could 
   stuff slots with cards they don't own. Acknowledged in rules header 
   as v1 risk. Should be hardened before scaling.

2. **live_board_state is readable by any signed-in user.** 
   firestore.rules:184-196. Match IDs are crypto.randomUUID(), so brute 
   force is infeasible, but a tighter cross-doc participant check is 
   the v2 fix.

3. **No automated tests.** Zero .test.ts files. No jest setup. 
   playCardHelper, executeEndRoundInternal, claimMatchRewards are the 
   highest-value targets for emulator-backed tests when this is 
   addressed.

4. **Auth typed as `any`.** src/lib/firebase.ts:24-31 has a @ts-ignore 
   for getReactNativePersistence that cascades into 7 TS strict errors 
   across AuthContext.tsx and forgot-password.tsx. Pre-existing, not a 
   runtime issue.

5. **Several files over 500 lines.** MatchCompleteOverlay.tsx (1010), 
   [matchId].tsx (818), settings.tsx (599), home.tsx (579), 
   guild-hall.tsx (564), keywordEffects.ts (506). Refactor opportunity, 
   not a bug.

## Cloud Functions (23 total)

- **Match lifecycle:** initializeNewMatch, onMatchTurnChange, 
  onBoardStateChange, onMatchDebuffChange, playCardToLane, passTurn, 
  activateCommander, onBothPlayersPassed, claimMatchRewards, 
  claimMatchRewardsWithAd, cleanupStaleMatches
- **Onboarding:** completeOnboardingFn, completeTutorial
- **Profile:** setActiveFaction, deleteUserAccount
- **Economy:** summonCard, craftCard, disenchantCard
- **Decks:** saveDeck, deleteSavedDeck, setActiveSavedDeck
- **Battle Mode:** findBattleOpponent
- **Campaign:** recordCampaignWin

## Development conventions

### Code style

- TypeScript strict mode enabled
- Prefer `catch (err: unknown)` with `err instanceof Error` narrow over 
  `catch (err: any)` (legacy code uses `any` — gradually migrating)
- Use `runTransaction` for any read-then-write Firestore operation 
  that affects atomic state (wallet updates, claim flags, etc.)
- Use `FieldValue.increment` for numeric counters instead of read-then-write
- All Cloud Functions use `firebase-functions/v2` (not v1)

### Component conventions

- Match-related components live in `src/components/match/`
- Library-related components in `src/components/library/`
- Auth-related components in `src/components/auth/`
- Use `Pressable` for tappable UI (built-in long-press support, no 
  react-native-gesture-handler)
- Prefer composition over prop drilling, but accept some drilling for 
  match state to avoid context overhead

### Firestore conventions

- All user data scoped under their UID
- `player_profiles/{uid}`, `player_wallets/{uid}`, 
  `player_inventories/{uid}/cards`, `player_active_decks/{uid}/slots`, 
  `player_saved_decks/{uid}/decks`
- Match documents at `match_sessions/{matchId}` with subcollection 
  `live_board_state/{instanceId}` for each card on the board
- Cards reference `card_library/{cardId}` (global, read-only)

## Critical things to remember

1. **The keystore on EAS is the source of truth for Android signing.** 
   Local copy exists at `@bfracis1988__ember-crown.jks` (gitignored). 
   SHA-256: `09:7A:B3:7F:D5:3A:24:56:EF:35:46:71:B9:3F:37:12:0B:7C:0E:8A:27:87:60:F3:9C:B1:E1:66:8E:A4:DE:25`
   
2. **Bundle ID is locked: `com.embercrown.app`** on both platforms. 
   Permanent.

3. **iOS production builds need these in app.json:**
   - `ios.useFrameworks: "static"` (in expo-build-properties)
   - `ios.forceStaticLinking: ["RNFBApp", "RNFBAnalytics", "RNFBCrashlytics"]`
   - `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`
   - `ios.supportsTablet: false` (deferred to v1.1)

4. **The 100c + 1s + 1k tutorial reward is in `completeTutorial.ts`** — 
   constant values, idempotent (can't fire twice for same UID).

5. **Termly URLs (privacy + terms):**
   - Privacy: `https://app.termly.io/policy-viewer/policy.html?policyUUID=ed4990b7-7970-4b17-992d-ad4514360130`
   - Terms: `https://app.termly.io/policy-viewer/policy.html?policyUUID=aecff60c-1477-4f2a-bae6-a32949054fae`

6. **AdMob is __DEV__-gated.** Production builds use real AdMob IDs; 
   dev builds use Google's test IDs. The gate is in `src/lib/admob.ts`.

## Backlog (v1.1+)

- **Anonymous Auth** (Apple 5.1.1 requirement — in progress, Update 1.0.2)
- **Battle Mode card visibility improvements** (shipped in Update 1.0.1)
- **Daily quests** (planned for Update 2 or 3)
- **iPad support**
- **Real Google Sign-In + Sign in with Apple**
- **IAP (cosmetic-only, no pay-to-win)**
- **ToS version check + acceptance modal on app update**
- **Daily ad cap** (currently per-match only)
- **Server-side ad verification (SSV) for AdMob**
- **Crashlytics modular API migration**
- **Splash screen polish** (splash-icon.png not appearing on cold launch)
- **Match abandonment UX** ("Resume Match" button on home/battle screens)
- **Active-deck slot ownership hardening**
- **Test infrastructure** (jest + @testing-library/react-native, 
  emulator-backed Cloud Function tests)

## Working with this codebase

- **Don't push to main from feature branches.** Brad merges manually 
  after review.
- **No automated tests yet.** Manual smoke testing on dev client APK 
  is the verification step.
- **Cloud Functions deploy independently of mobile builds.** Server 
  fixes can ship without rebuilding AABs/IPAs.
- **EAS Build wait times are 20-30 min per platform.** Plan accordingly.
- **The /home and /battle screens are the highest-traffic entry points.** 
  Be careful changing them.