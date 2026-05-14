# Update 1.0.2 — Smoke Test Checklist

Run these on a dev client APK / TestFlight build before submitting to
the App Store. Each step should be tested on a freshly installed app
(uninstall, reinstall) unless noted otherwise.

## Guest sign-in & first-time flow

1. **Cold launch the app on a freshly installed device.**
   - [ ] Sign-in screen renders with `Sign Up`, `Log In`, and the new
         `Try as Guest` button below them.
   - [ ] "Recommended: Create an account..." framing text is visible
         above the Try as Guest button.
   - [ ] "Play without an account. Progress saves to this device only."
         subtitle is visible below the button.

2. **Tap `Try as Guest`.**
   - [ ] Auth completes silently (no email/password prompt).
   - [ ] Lands on the onboarding faction picker.
   - [ ] Complete the faction picker → commander picker → provisioning →
         step-4 landing.
   - [ ] On the home landing screen, a small bordered **Save Progress**
         button is visible in the top-right corner, to the left of the
         Logout link.

## Modal trigger: tutorial completion

3. **As a guest, start and win the tutorial match** (or use Skip
   Tutorial — both paths should fire the modal).
   - [ ] After completing the tutorial (claim rewards from
         MatchCompleteOverlay, then Return Home), the **SaveProgressModal**
         pops up on the home screen.
   - [ ] Tap **Maybe Later** → modal dismisses.
   - [ ] Reload / cold launch the app → the modal does NOT pop up again
         (the `shown_save_modal_tutorial` flag is persisted).

## Modal trigger: first solo win

4. **As the same guest (modal already shown for tutorial), play a solo
   match and win it.**
   - [ ] After clicking Claim on the win, the SaveProgressModal pops
         up over the rewards summary.
   - [ ] Dismiss with Maybe Later.
   - [ ] Win a second solo match — the modal does NOT pop up again.

## Modal trigger: day-3 cold launch

5. **(Optional — long timeline test.)** Use a guest account created
   ≥ 3 days ago. Cold launch the app.
   - [ ] SaveProgressModal pops up on the home screen.
   - [ ] Dismiss.
   - [ ] Cold launch again → modal does NOT re-trigger.

   To simulate without waiting 3 days: temporarily roll back the
   `shown_save_modal_day_three` flag in Firestore, and edit the device
   clock forward 3 days (or run on an emulator with a synthetic profile
   that has a `created_at` ≥ 3 days in the past).

## Guest-to-account upgrade (linkWithCredential preserves UID)

6. **Tap the Save Progress button on the home screen.**
   - [ ] SaveProgressModal opens with the manual trigger.
   - [ ] Enter a NEW email + password (one that doesn't already exist).
   - [ ] Tap Create Account.

7. **After successful upgrade:**
   - [ ] The Save Progress button on home disappears.
   - [ ] Wallet (coins / shards / keys) is unchanged from pre-upgrade.
   - [ ] Active commander, active faction, and active deck slots are
         unchanged.
   - [ ] Card collection (Guild Hall) shows the same cards as before.
   - [ ] Campaign progress is unchanged.

8. **Sign out, then sign back in with the same email/password used in
   step 6.**
   - [ ] Lands on home screen (no re-onboarding).
   - [ ] All wallet / inventory / deck state matches what was there
         pre-sign-out.
   - [ ] Confirms `linkWithCredential` preserved the UID — a new account
         would have empty wallets/inventory.

## Email-already-in-use error path

9. **As a fresh guest, tap Save Progress and enter an email that's
   already registered to a different real account.**
   - [ ] Modal switches to the email_in_use error state with the
         "Sign Out & Sign In" button.
   - [ ] Tap Sign Out & Sign In.
   - [ ] Lands on the login screen.
   - [ ] (The guest's progress is gone — expected per the warning copy.)

## Battle Mode hard gate

10. **As a guest, on the Battle Hub (Battle tab), tap the Battle Mode
    card's Find Battle button.**
    - [ ] BattleModeGateModal opens with title "Battle Mode requires an
          account".
    - [ ] Two buttons: Create Account (green primary) and Back.
    - [ ] Tap Back → modal closes, still on Battle Hub.
    - [ ] Tap Battle Mode again → tap Create Account → modal closes →
          SaveProgressModal opens on top.
    - [ ] Cancel that modal — back at Battle Hub, can still play Solo /
          Campaign / Tutorial.

11. **Defensive deep-link gate:** attempt to navigate directly to
    `/battle-mode` (e.g., via expo-router debug menu or by typing the
    URL in dev tools).
    - [ ] BattleModeGateModal appears in place of the faction picker.
    - [ ] Tap Back → returns to /battle.

## Signed-up users see no Update 1.0.2 surfaces

12. **Sign in (or sign up) with email/password (any non-anonymous
    account).**
    - [ ] Home screen: no Save Progress button visible.
    - [ ] Login screen: Try as Guest is still visible (it's gated only by
          being unsigned-in, not by anonymous status of the current user).
    - [ ] Battle Mode entry: no gate modal; can enter and find battles
          as before.
    - [ ] None of the SaveProgressModal triggers (tutorial / first win /
          day-3) fire.

## Server-side defense (developer-only check)

13. **Verify the findBattleOpponent Cloud Function rejects anonymous
    callers.** (Optional — only worth running if you have a way to call
    the callable directly as an anonymous user, e.g., a debug build that
    bypasses the gate modal.)
    - [ ] Direct call returns a `permission-denied` HttpsError with the
          message "Battle Mode requires a permanent account."

## Sign-out edge cases

14. **As a guest, tap Logout from the home corner.**
    - [ ] Returns to the sign-in screen.
    - [ ] (The anonymous UID is now orphaned and unrecoverable. This is
          expected — sign out of a guest session permanently ends it.)
