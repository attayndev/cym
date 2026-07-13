# 06 — Test Matrix

Legend: ✅ automated-passed · 🖥️ web-export-verified · 📋 manual-required (see `13`) · 🔒 blocked (needs credentials/hardware/live backend).

## Automated (executed this audit)

| Suite | Result |
|---|---|
| `tsc --noEmit` (strict) | ✅ clean |
| `npm test` (Jest) | ✅ **124 passed / 124**, 15 suites |
| `expo export --platform web` | ✅ exit 0, 24 routes, 3.2 MB `_expo` |
| Bundle secret scan (`dist/`) | ✅ no service-role/Anthropic/Hunter/Google secret; no personal email; only public keys |
| `oauth-state` crypto (Node-transpiled) | ✅ 14/14 |

### Unit/logic coverage by module

✅ Covered: `classify`, `dates`, `deck`, `dedupe`, `enrich`, `living-cards`, `merge`, `nudges`, `personas`, `persistence`, `rhythm`, `tier`, `vcard`, **`sync` (new)**, **scoring-regression (new)**.
Untested I/O wrappers (acceptable — thin adapters, no branching logic): `account`, `alert`, `contacts`*, `drafts`*, `email`, `gmail`, `ids`, `notifications`, `oauth`, `purchases`, `push`, `scan`, `share`, `store`, `supabase`.
\* `contacts.ts` (device two-way sync) and `drafts.ts` (prompt build) retain untested branches — see `14` residual risk.

## Feature journeys (P0/P1) — method & status

| Journey | Method | Status | Note |
|---|---|---|---|
| First launch → onboarding gate | 🖥️ + 📋 | web route renders; device flow manual | gate logic unit-adjacent |
| Sign-up / sign-in (email) | 📋 | needs live Supabase + device | error paths coded, not run |
| Sign in with Apple (iOS native) | 🔒 | needs signed iOS build + Apple | code reviewed (`oauth.ts`) |
| Google OAuth | 📋 | needs device browser session | redirect allowlist now enforced |
| Sign-out / session expiry | 📋 | | `onAuthStateChange` wired |
| Contact permission grant/deny/limited | 📋 | denial is non-fatal by code | must test iOS limited-access |
| Contact import idempotency | ✅(logic) + 📋 | dedupe/tombstone unit-tested; device run manual | |
| Incremental device sync (add/edit/delete/merge) | 📋 | `contacts.ts` untested branch | high-value manual (`13`) |
| Cloud graph pull/push/merge/conflict | ✅ | 20 new tests | interaction-loss regression locked |
| Relationship scoring / warm-cold | ✅ | 9 new tests incl. named regression | UI/API/DB agree by construction (single source) |
| Enrichment (Hunter, additive, conflicts) | ✅(logic) + 🔒 | `enrich.test.ts`; live Hunter blocked | Plus-gated |
| QR create / scan / exchange inbox | 🖥️(web `/c/`) + 📋 | share-card validated statically | invalid/expired token → 404 path coded |
| Card scan (camera→AI) | 🔒 | needs device camera + Anthropic | daily cap 25, media allowlist verified |
| Drafts (AI/template/limit) | 📋 | 402 limit path coded | proxy JWT-authed |
| Paywall purchase / restore | 🔒 | needs sandbox store | **F-02 fixed**; dev flip gated |
| Birthday / role-change / commitment nudges | ✅(engine) + 📋 | notification delivery manual | |
| Push notification + deep link | 🔒 | needs device + APNs/FCM | |
| Settings: language, notifications, subscription | 🖥️ + 📋 | | i18n parity ✅ |
| **Account deletion** | 📋 | `delete-account` reviewed; CASCADE verified in schema | must run end-to-end on device |
| Data export / load sample / reset | 🖥️ + 📋 | | |
| Offline / API-error / empty states | 📋 | code returns graceful fallbacks | drafts→template, purchases→listener catch-up |
| Upgrade-from-previous-build | 🔒 | needs two builds | `runtimeVersion` OTA note (`08`) |

## What must NOT be counted as passed

No physical-device or simulator run was executed in-session. Every 📋/🔒 row above is a genuine gap with exact manual steps in `13`, not a pass.
