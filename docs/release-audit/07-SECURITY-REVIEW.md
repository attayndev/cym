# 07 — Security Review (OWASP MASVS / MASTG baseline + API/web)

Reviewed 2026-07-12 against MASVS v2 categories (Storage, Crypto, Auth, Network, Platform, Code, Resilience, Privacy) plus OWASP API Top-10 for the backend.

## Summary

| # | Finding | Sev | Status |
|---|---|---|---|
| S-01 | Unsigned Gmail OAuth state (uid injection + open redirect) | HIGH | **FIXED** (F-01) |
| S-02 | RevenueCat webhook: static string-equality auth, no payload HMAC / constant-time | MEDIUM | OPEN (F-13) |
| S-03 | IMAP passwords plaintext at rest | MEDIUM | OPEN (F-12) |
| S-04 | `imap-sync` outbound TLS to user-supplied host/port | LOW-MED | OPEN (F-14) |
| S-05 | `suggested_contacts` UPDATE policy column-unrestricted | LOW | OPEN (F-15) |
| S-06 | Internal detail in error responses | LOW | OPEN (F-16) |
| S-07 | Supabase session in AsyncStorage (not Keychain/Keystore-backed) | LOW | Accepted |
| S-08 | Contact first names in push copy (lock-screen preview) | LOW | Accepted/doc |
| S-09 | No security headers on marketing Worker | LOW | OPEN (F-21) |

**No Blocker/Critical, and the sole High is fixed.**

## MASVS-STORAGE

- Graph PII + Supabase session live in **AsyncStorage** (app-sandboxed). Not hardware-backed (S-07) — acceptable for this data class; documented. No PII in logs (dev-gated `diag()` logs ids/counts only; 5 raw `console.warn` log error messages, no PII — F-24).
- `clearDB()` wipes the graph **and every device-local sidecar** on logout/delete (`store.ts:24`) — prevents "already imported" ghosting and stale links. ✅
- Secret tables (`gmail_credentials`, `imap_credentials`, `hunter_cache`, usage counters) are RLS-enabled with `REVOKE ALL FROM anon, authenticated` — reachable only by service role. ✅ (IMAP password not encrypted beyond that — S-03.)

## MASVS-CRYPTO

- New OAuth state uses HMAC-SHA256 via Web Crypto with constant-time compare (`_shared/oauth-state.ts`). ✅
- Share tokens / exchange ids minted server-side via `pgcrypto` `gen_random_bytes` (128-bit / 64-bit). ✅
- Apple Wallet passes signed with PKCS#7 detached signature (`node-forge`), keys from env. ✅

## MASVS-AUTH / sessions

- Supabase Auth: email/password, Apple (native id token + `signInWithIdToken`), Google (browser OAuth). Apple provides name only on first authorization — persisted (`oauth.ts:87`). ✅
- Token refresh via SDK `autoRefreshToken`; logout calls `supabase.auth.signOut()`. ✅
- **Every edge function sets `verify_jwt=false` and authenticates manually.** Reviewed each: user-JWT functions call `admin.auth.getUser(jwt)`; `delete-account` additionally rejects the service key as a bearer. Capability endpoints (`share-card`, `card-refresh`, `wallet-pass`) are token-scoped and return card-safe fields only. ✅
- Account enumeration: sign-in/up errors surface Supabase's message; recommend confirming the project's "email confirmations" + generic-error settings in the dashboard (📋, can't read hosted auth config from repo).
- Rate limiting: `share-card`, `waitlist`, `attribution/apply` implement per-IP limiters. Supabase Auth endpoints rely on the platform's built-in limits (📋 confirm in dashboard).

## MASVS-NETWORK

- All backend traffic is HTTPS (Supabase, Anthropic, Hunter, Google, Expo, RevenueCat). No cleartext endpoints in code; the one `http://localhost:9999` in the bundle is the Supabase SDK's internal default constant, not a runtime endpoint. ✅
- `ITSAppUsesNonExemptEncryption: false` set (standard HTTPS only) → export-compliance simple. ✅
- **ATS:** no `NSAppTransportSecurity` exceptions in `app.json`. ✅ (Confirm no plugin injects one in the built `Info.plist` — 📋.)
- **Android cleartext:** no `usesCleartextTraffic`/network-security-config in config. Managed RN default disallows cleartext on API 28+. ✅ (Confirm merged manifest — 📋.)
- Certificate pinning: **not implemented.** Assessed — for a Supabase/CDN-fronted backend, pinning adds operational fragility (cert rotation) for marginal benefit; **recommend NOT adding** for launch. Documented tradeoff.

## MASVS-PLATFORM / API security (OWASP API)

- **BOLA/IDOR:** all graph tables enforce `auth.uid() = user_id` RLS for SELECT/INSERT/UPDATE/DELETE (symmetric USING/WITH CHECK). Ids are UUIDs / random tokens (not enumerable). Client filters by `user_id` but **authorization is server-side via RLS**, not client-only. ✅ (Recommend one live two-user probe pre-launch — 📋, S-live.)
- **Injection:** all DB access via Supabase client (parameterized); no string-built SQL. AI prompts have server-owned system prompts + length caps (drafts 6000, classify 120/field ×200). ✅
- **Mass assignment:** `share-card` POST maps only whitelisted fields; `suggested_contacts` UPDATE is column-unrestricted on own rows (S-05, low).
- **File upload:** `card-scan` enforces media-type allowlist + 7.5 MB cap. ✅
- **Webhook forgery:** `revenuecat-webhook` checks a shared secret but not a payload signature and not constant-time (S-02). Recommend RC signed payloads.
- **SSRF:** `imap-sync` connects to a user-supplied host/port over TLS (authenticated). Bounded to IMAP protocol but is an outbound-connection surface (S-04).
- One `SECURITY DEFINER` function (`handle_new_user`) — fixed `search_path`, no dynamic SQL, `on conflict do nothing`. Safe. ✅
- Service role key **never** reaches the client (bundle scan clean). ✅

## MASVS-RESILIENCE / PRIVACY

- No jailbreak/root detection (not required for this data class).
- Analytics: **none** — no PII flows to any analytics/ad SDK because none exist. Strong privacy posture. ✅
- Push copy includes contact **first names** (birthday/nudge) → visible on lock screen (S-08). Acceptable; note in privacy docs.

## Live tests to run before launch (📋 blocked in-session)

1. Two-user RLS probe: authenticate user A and user B, attempt cross-`user_id` SELECT/UPDATE on `contacts`, `interactions`, `share_tokens`, `exchange_submissions` — expect 0 rows / denied.
2. Unauthenticated hits to every `verify_jwt=false` function → expect 401/404, never data.
3. Forged Gmail `state` against the live callback → expect `400 bad state` (validates F-01 in prod).
4. RevenueCat webhook with wrong/absent secret → expect 401.
