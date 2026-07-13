# 05 — Findings Register

Severity: Blocker > Critical > High > Medium > Low > Informational.
Status: FIXED (this audit) · OPEN (documented) · HUMAN (needs credentials/console/hardware).

## Fixed during the audit

### F-01 — Unsigned Gmail OAuth `state` (HIGH · FIXED)
- **Platform/Feature:** backend / Gmail connect. **Files:** `supabase/functions/gmail-auth-start/index.ts:29`, `gmail-oauth-callback/index.ts:27`.
- **Root cause:** `state` was `base64(JSON{uid,redirect})` with no signature; the callback trusted `uid` and reflected `redirect` into a 302.
- **Impact:** an attacker could build their own Google consent URL (client id + redirect uri are fixed), set `state.uid` to a victim, consent with their *own* Gmail, and the callback would write the attacker's Gmail credentials under the victim's account — polluting the victim's interaction history. `redirect` was an unvalidated open redirect.
- **Fix:** new `_shared/oauth-state.ts` — HMAC-SHA256 signed state (`OAUTH_STATE_SECRET`, falls back to service key), 10-minute expiry, constant-time compare, and a strict redirect allowlist (`callyourmom://`, `*.getcym.app`, localhost dev) enforced on both start and callback.
- **Tests/evidence:** `_shared/oauth-state.test.ts` (Deno) + transpiled Node run — **14/14 assertions pass**, incl. forged-state, tampered-payload, lookalike-host, and `javascript:` rejection.
- **New env var required:** set `OAUTH_STATE_SECRET` (any high-entropy string) on the two gmail functions, or accept the service-key fallback. See `11`.

### F-02 — Production paywall could grant Plus with no purchase (HIGH · FIXED)
- **Platform/Feature:** iOS+Android / paywall. **File:** `src/app/paywall.tsx:52`.
- **Root cause:** when RevenueCat packages were unavailable, `subscribe()` called `setPro(true)` unconditionally — intended as a dev/web convenience, but it also fired in a **production** build whenever the store was momentarily unreachable, granting Plus free.
- **Fix:** the local flip is now `__DEV__`-only; production shows a new `paywall.storeUnavailable` message (en+es) and grants nothing without a real store transaction.
- **Evidence:** `tsc` + full suite green; new i18n keys parity-checked.

### F-03 — Latent client secret via direct Anthropic path (MEDIUM · FIXED)
- **File:** `src/lib/drafts.ts:135`. The direct Messages-API branch honored `EXPO_PUBLIC_ANTHROPIC_API_KEY` in *any* build; if ever set for production, a live key would ship in the bundle.
- **Fix:** `apiKey` is now read only under `__DEV__`; production always routes through the JWT-authed proxy. (Key is not set today — bundle scan clean — this is defense-in-depth.)

### F-04 / F-05 — Personal & real-looking emails in shipped seed data (LOW · FIXED)
- `src/lib/seed.ts:236` hardcoded `ytsirklin@gmail.com` (owner's real address) in the sample profile; `:84` used `jokafor@gmail.com` (real-provider address) for a sample contact. Replaced with a neutral `Sample` profile (email removed) and `james@meridiancap.example`.

### F-06 — `ConnectedAccount.provider` type wrong (LOW · FIXED)
- `src/lib/types.ts:158` typed `'gmail'|'outlook'` though Outlook was dropped (migration 0019) and the code uses `imap`. Fixed to `'gmail'|'imap'`; removed stale `'outlook'` from the `settings.tsx:123` filter.

### F-07 — Dead code in `gmail.ts` (INFORMATIONAL · FIXED)
- `syncGmailNow` / `disconnectGmail` had zero callers (settings uses `email.ts`). Removed.

### F-08 — Tracked backup file (LOW · FIXED)
- `backups/index-pre-rebrand-2026-07-10.html` was committed and `backups/` was un-ignored. `git rm --cached` + added `backups/` to `.gitignore`.

### F-09 — Unused Expo starter assets (INFORMATIONAL · FIXED)
- Removed unreferenced `react-logo*.png`, `expo-logo.png`, `expo-badge*.png`, `tutorial-web.png` from `assets/images/`.

### F-10 — Version skew (LOW · FIXED, with launch decision flagged)
- `app.json` `0.1.0` vs `package.json` `1.0.0`. Reconciled `package.json` → `0.1.0`. **Decision for Yan:** whether to bump the store version to `1.0.0` for launch (safe pre-first-build; `runtimeVersion.policy=appVersion` will then track `1.0.0`). See `14`.

### F-19 — Highest-risk logic untested (HIGH-risk gap · FIXED via coverage)
- `sync.ts` (`mergeGraphs`/`pushGraph`/`pullGraph`) and the scoring engine had no tests. Added **29 regression tests** (`sync.test.ts`, `scoring-regression.test.ts`) covering interaction preservation, merge idempotency, email-sync server-ownership, archive one-way latch, nudge-state precedence, version-conflict, and the named "recent touch still shows cold" scenario (confirmed correct). Suite now **124 passing**.

## Open — documented (not release-blocking on code)

| ID | Sev | Area | Summary | Disposition |
|---|---|---|---|---|
| F-11 | MEDIUM | Android/keys | `google-services.json` Firebase API key committed | **HUMAN:** restrict key in Google Cloud (package + SHA-1, FCM API only) |
| F-12 | MEDIUM | backend | IMAP passwords stored plaintext at rest (`imap_credentials`) | Recommend app-level/KMS encryption (S-03) |
| F-13 | MEDIUM | backend | RevenueCat webhook uses static string-equality auth, not payload HMAC / constant-time | Recommend RC signed-payload verification (S-02) |
| F-14 | LOW-MED | backend | `imap-sync` opens TLS to user-supplied host/port (SSRF-ish, authenticated) | Recommend host allowlist / egress limits (S-04) |
| F-15 | LOW | backend | `suggested_contacts` UPDATE policy column-unrestricted | Restrict to `dismissed_at` (S-05) |
| F-16 | LOW | backend | Error responses leak internal detail (IMAP login error, RC DB error, enrich upstream status, gmail account email) | Genericize client-facing text (S-06) |
| F-17 | LOW | backend | `scan_usage`/`ref_clicks`/`signup_attributions`/`affiliate_applications` lack explicit `REVOKE` (safe by RLS default-deny) | Add revokes for consistency |
| F-18 | MEDIUM | store | No dedicated web account-deletion URL (in-app deletion exists) | **HUMAN:** add `/delete-account` page for Play Data Safety |
| F-20 | MEDIUM | content | Pricing mismatch: `terms.html` ($15/$120) vs `store-listing.md` ($14.99/$119.99 founding, $29.99 post) | **HUMAN:** reconcile before listing |
| F-21 | LOW | web | Marketing worker sets no security headers (CSP/HSTS/etc.) | Recommend safe header set (S-09) |
| F-22 | LOW | web | Beta-gate password inline literal `yourmamma` (`workers/router.ts`) | Move to a Worker secret binding (beta only) |
| F-23 | LOW | UX | GettingStarted "card" step reads profile fields; cards now live on personas → may never complete | Fix step to read active persona's card |
| F-24 | INFO | app | 5 raw `console.warn` bypass the dev-gated `diag()` wrapper (no PII) | Route through `diag()` |
| F-25 | MEDIUM | release | `eas.json` `submit.production` empty; beta ASC key is a machine-local `~/Downloads/*.p8` | **HUMAN:** wire production ASC + Play service account in CI |
| F-26 | MEDIUM | iOS | iOS privacy manifest not explicitly declared; relies on module-shipped manifests | **HUMAN:** verify Xcode Privacy Report against App Privacy answers in the archive |
| F-27 | INFO | app | Health Pro-gate disabled for beta (intentional) | Decide gating for GA |
| F-28 | INFO | backend | `config.toml` stale copy-paste comments mislabel `attribution`/`card-scan` auth | Cosmetic; correct the comments |
| F-29 | LOW | backend | `daily-nudges` `CRON_SECRET` optional (falls back to service-key-only cron) | Set `CRON_SECRET` or accept service-key path |
| F-30 | LOW | iOS/Android | No associated domains / universal links; only custom scheme (`/c/` links open the web page, not the app) | Product choice; add applinks if in-app open is wanted |
| F-31 | INFO | assets | `android-icon-background.png` present but unreferenced (adaptiveIcon uses flat color) | Remove or wire up |
| F-32 | INFO | tooling | No eslint config was committed; `expo lint` (default expo/React-Compiler ruleset, installed this audit) reports 12 errors — all idiomatic-but-discouraged patterns (mirror-ref write during render `app-context.tsx:241`, self-recursive `schedulePush` `:268`, setState-in-effect for initial sync). **None are runtime defects** (tsc clean, 124 tests green). Do NOT hastily rewrite load-bearing sync code to satisfy them mid-release. Recommend establishing a lint baseline (config + targeted fixes) as a post-audit task | OPEN |
