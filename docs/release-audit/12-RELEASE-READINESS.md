# 12 — Release Readiness

## Executive decision

# CONDITIONAL GO

The **code, backend, and configuration are release-quality**: strict typecheck and the full 124-test suite pass, the web bundle is free of secrets and dev endpoints, and the two release-blocking security/monetization defects found during the audit were fixed and verified. **No open Blocker, Critical, or High finding remains.**

It is **not a clean GO** only because the final gate criteria that *cannot be executed in this environment* — building and validating the signed iOS archive and Android AAB, running the P0/P1 journeys on real devices, a sandbox purchase, and a handful of console/content actions — remain outstanding. These are enumerated below as a finite, mostly-human checklist. It is **not a NO-GO**: no defect blocks release; the outstanding items are verification and store-console work, not bugs.

## Platform status

- **iOS:** ⚠️ code/config ready; archive build + validation, privacy-manifest verification, SiWA + sandbox-purchase device tests outstanding.
- **Android:** ⚠️ code/config ready (targets API 35); AAB build, web deletion URL, Data Safety form, write-back disclosure confirmation outstanding.
- **Backend:** ✅ reviewed; RLS enabled on every table; OAuth state now signed; one live two-user RLS probe recommended.
- **Database:** ✅ 23 migrations reviewed; CASCADE deletion verified in schema; live migration apply not run in-session.
- **Privacy:** ✅ policy matches code and names all subprocessors; App Privacy / Data Safety drafted (`10`); two content gaps (deletion URL, pricing).
- **Security:** ✅ sole High fixed; no open High/Critical; mediums documented.
- **User experience:** ⚠️ web export renders all routes; device-level UX/a11y is manual (`13`).

## Release blockers (must close before submit)

1. **Build + validate the iOS release archive** (`eas build -p ios --profile production`; validate via Transporter/ASC).
2. **Build + validate the Android AAB** (`eas build -p android --profile production`).
3. **Add a web account-deletion URL** (F-18) and enter it in Play Data Safety.
4. **Reconcile Plus pricing** across terms/site/store product (F-20).
5. **Verify the iOS privacy manifest / required-reason APIs** in the archive Privacy Report (F-26).
6. **Restrict the committed Firebase API key** in Google Cloud (F-11).
7. **Wire production submit credentials** (ASC API key + Play service account) into `eas.json`/CI (F-25).
8. **Run the P0/P1 device journeys** in `13`, including the sandbox purchase (confirming F-02) and account-deletion end-to-end.
9. **Set `OAUTH_STATE_SECRET`** on the two Gmail functions (or accept the service-key fallback) and redeploy them.

None of the above is a code defect; all are build/console/verification actions.

## Security summary

| Severity | Count | Status |
|---|---|---|
| Blocker | 0 | — |
| Critical | 0 | — |
| High | 1 | **Fixed** (F-01 OAuth state) |
| Medium | 6 | Documented (F-11,12,13,18,20,25,26) — mostly human/console |
| Low | 8 | Documented |
| Informational | 8 | Documented / fixed |

Plus a High-severity monetization bug (F-02, Plus granted without purchase) — **fixed**.

## Functional coverage

- **Discovered features:** ~28 (screens + backend flows) — `02`.
- **Test scenarios enumerated:** ~55 (automated + manual matrix) — `06`/`13`.
- **Passed (automated/web-verified):** typecheck, 124 unit/logic tests, web export, bundle secret-scan, oauth-state crypto (14).
- **Failed:** 0.
- **Blocked (need device/store/live backend):** ~30 device & live-security scenarios (`13`).
- **Not run:** native archive builds.
- **Automated vs manual:** core engine logic (sync, scoring, enrichment, tiering, dedupe) is automated; all UI/device/purchase/permission flows are manual.

## Store compliance summary

| Area | Apple | Google |
|---|---|---|
| App completeness | Needs device confirm | Needs device confirm |
| Privacy policy accessible & accurate | Pass | Pass |
| App Privacy / Data Safety | Needs console entry (draft ready) | Needs console entry (draft ready) |
| Account deletion (in-app) | Pass | Pass |
| Account deletion (web URL) | N/A | **Fail → add (F-18)** |
| Sign in with Apple | Pass (device-verify) | N/A |
| Payments (IAP/Play Billing) | Pass (F-02 fixed; sandbox-verify) | Pass |
| Permissions justified & in-context | Pass | Pass (confirm write-back disclosure) |
| Privacy manifest / required-reason | Needs archive verify (F-26) | N/A |
| Target API level | N/A | Pass (API 35; API 36 after 2026-08-31) |
| Pricing accuracy | Needs reconcile (F-20) | Needs reconcile (F-20) |

## Changes made during the audit

- **F-01** Signed + expiry-bounded + redirect-allowlisted Gmail OAuth state (`_shared/oauth-state.ts` + both gmail functions); 14 crypto assertions.
- **F-02** Production paywall no longer grants Plus without a store transaction; added `paywall.storeUnavailable` (en+es).
- **F-03** Direct-Anthropic draft path gated to `__DEV__` (no client key can ship).
- **F-04/05** Removed personal + real-looking emails from seed data.
- **F-06** Fixed `ConnectedAccount.provider` type and stale settings filter.
- **F-07/09** Removed dead Gmail functions and unused Expo template assets.
- **F-08** Untracked the pre-rebrand backup; gitignored `backups/`.
- **F-10** Reconciled `package.json` version to `0.1.0`.
- **F-19** Added 29 regression tests (`sync.test.ts`, `scoring-regression.test.ts`); suite now 124 green.

## Remaining risks

See `14` — stated plainly. Highest residual: RevenueCat webhook auth strength (F-13), plaintext IMAP passwords (F-12), and the untested device two-way contact-sync path (manual coverage required).

## Exact release commands

```bash
# Preconditions: set function secrets (incl. OAUTH_STATE_SECRET), reconcile pricing,
# publish the deletion page, restrict the Firebase key.

# Deploy backend
supabase functions deploy            # all edge functions (config.toml)
# (apply any pending migrations via your migration workflow)

# iOS release
eas build --platform ios --profile production
eas submit --platform ios --profile production        # after ASC creds in eas.json (F-25)

# Android release
eas build --platform android --profile production
eas submit --platform android --profile production    # after Play service account wired

# Web app (already verified building)
npm run app:deploy

# Marketing site
npm run site:deploy
```

## Human actions still required

1. Build + validate iOS archive and Android AAB (credentials/hardware).
2. Run the `13` device matrix; record results (do not mark passed until executed).
3. Publish `getcym.app/delete-account`; enter URL in Play Data Safety (F-18).
4. Reconcile Plus pricing everywhere (F-20).
5. Verify iOS Privacy Report vs App Privacy answers (F-26).
6. Restrict the Firebase Android API key (F-11).
7. Wire production ASC + Play submit credentials (F-25).
8. Set `OAUTH_STATE_SECRET` and redeploy Gmail functions.
9. Fill demo credentials + URLs in `11`.
10. Decide launch version number (0.1.0 vs 1.0.0, F-10) and GA gating for Health (F-27).
11. Run a live two-user RLS probe (S-live) and unauthenticated-endpoint sweep.
