# 00 — Audit Scope

**Product:** Call Your Mom (cym) — a mobile-first relationship-memory app.
**Audit date:** 2026-07-12
**Auditor role:** principal mobile eng / security / QA / release / privacy / store-compliance (single pass).
**Repo:** `/Users/yan/projects/callyourmom` @ `main` (commit `468af6e` at start).
**Objective:** final GO / NO-GO gate before first submission to the Apple App Store and Google Play.

## Systems in scope

| Surface | Stack | Location |
|---|---|---|
| Mobile app | Expo SDK 56, React Native 0.85.3, React 19.2.3, expo-router, managed/CNG workflow | `src/` |
| Backend | Supabase (Postgres + 16 Deno edge functions), project ref `jvuvuukvgunhpemrhqxl` | `supabase/` |
| Marketing site | Cloudflare Worker + static assets (`getcym.app`, `getcym.com` redirect) | `site/`, `workers/` |
| Web app | RN-web export served from Cloudflare (`app.getcym.app`) | `dist/` (built), `wrangler.app.jsonc` |

## Method

1. Parallel discovery agents produced inventories of: mobile features/screens, Supabase schema+functions, prototype-artifact sweep, and build/store config.
2. The main session verified every release-blocking finding directly against source, applied fixes, and added regression coverage.
3. Clean-tree typecheck (`tsc --noEmit`), Jest suite (`npm test`), and web export (`expo export`) were run and recorded.
4. Store compliance checked against current (July 2026) Apple App Store Review Guidelines and Google Play policies.

## Explicitly OUT of scope / could not be executed in this environment

- **Native iOS archive + Android AAB builds** — require EAS cloud build / Xcode + signing credentials not available in-session. Documented as human-required steps with exact commands (`12`, `13`).
- **Live device / simulator runs** — no booted simulator or device in-session; screen-level behavior assessed by code inspection and the web export. All such items are marked "manual required," never "passed."
- **Live RLS probing against the hosted DB** — would need two provisioned auth users and the live anon endpoint; RLS was reviewed statically against all 23 migrations. Documented as a recommended pre-launch live test.
- **Deno test execution** — `deno` is not installed here; the new `_shared/oauth-state.test.ts` was additionally transpiled and run under Node as evidence (14/14 assertions pass).

## Severity scale

Blocker > Critical > High > Medium > Low > Informational. A **GO** requires zero open Blocker/Critical/High.
