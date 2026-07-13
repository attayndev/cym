# 13 — Manual & Device Tests (Required Before GO)

None of these were run in-session (no simulator/device/live backend). Each is a genuine gap, not a pass. Run on the matrix below; record pass/fail + build number.

## Device/OS matrix
**iOS:** current iOS (26.x) + minimum supported; one recent iPhone (e.g. 16/17) + one small (SE); iPad only if support is declared. **Android:** current (16) + minimum (API 24); one Pixel profile + one low-memory/small; 64-bit.

## iOS scenarios
1. Clean install → onboarding → account create → contact permission **allow / deny / limited** → import.
2. Permission revoked from Settings after grant → app detects and degrades gracefully.
3. Sign in with Apple (first-time captures name; returning reuses it); sign out; sign back in.
4. Google OAuth via in-app browser → returns to `callyourmom://auth`.
5. Gmail connect → confirm return deep link `status=connected`; **forge the `state` param → expect `400 bad state`** (validates F-01 in prod).
6. Log touchpoint → score→warm; background/kill/relaunch → interaction + score persist.
7. Card scan (camera) → fields prefill capture; daily cap behavior at 25.
8. QR create → open on 2nd device → reciprocal submit → accept in Exchange inbox.
9. Paywall: sandbox purchase (monthly+annual, 7-day trial), **restore**, and — critically — with the store made unreachable, confirm Plus is **NOT** granted (F-02).
10. Notifications: enable → birthday nudge appears → tap opens draft; lock-screen preview shows only first name.
11. Account deletion end-to-end → account gone, re-login fails, local data cleared.
12. Offline: airplane mode on Today/People/draft → graceful (templates, cached state), no crash.
13. Dynamic Type at largest accessibility size; VoiceOver through onboarding + a contact; light/dark.
14. Upgrade install: install a prior build, then the release build → data survives; OTA `runtimeVersion` note (F-10) understood.

## Android scenarios
1. Clean install → contacts **allow / deny / "Don't ask again"** → import; POST_NOTIFICATIONS runtime prompt.
2. Permission revoked → graceful.
3. Google OAuth; Gmail connect (+ forged-state check as above).
4. Interaction persistence across process death (force-stop) and battery optimization / background restriction.
5. Card scan, QR exchange, drafts, paywall sandbox purchase + restore (F-02 unreachable-store check).
6. Account deletion end-to-end; confirm push token + email creds removed.
7. Edge-to-edge (Android 15) — no clipped content under system bars.
8. Large font / display scaling; TalkBack through onboarding + a contact.
9. Offline behavior; poor-network sync.
10. Upgrade install from a prior AAB.

## Live backend / security (run against staging or prod-with-test-users)
11. **Two-user RLS probe** — user A cannot read/write user B's `contacts`, `interactions`, `share_tokens`, `exchange_submissions` (expect denied / 0 rows).
12. Unauthenticated calls to each `verify_jwt=false` function → 401/404, never data.
13. RevenueCat webhook with wrong/missing secret → 401; with correct secret flips `is_pro`.
14. Enrichment (Plus) sends only email to Hunter/NinjaPear (network capture).

## Cross-platform
15. Same account on iOS + Android simultaneously → graph converges, no interaction loss, version-conflict handled (unit-locked in `sync.test.ts`, confirm live).
