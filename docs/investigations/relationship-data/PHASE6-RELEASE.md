# Relationship-Data Investigation — Phase 6: Production Release

2026-07-13. Releases commit `2efb489` (fix) / `806ff49`+ (record).

## What shipped, where

| Surface | Mechanism | Identifier | Status |
|---|---|---|---|
| iOS + Android apps (all distributed builds — TestFlight and Play alpha are `beta`-profile builds riding the **preview** channel) | EAS OTA, runtime 0.1.0 | update group `9463d260-0511-40f5-97ec-6723d1604c69` (iOS `019f5e60-…97c8e`, Android `019f5e60-…df5e8a`) | **Live**; devices pick it up on next launch |
| Web app | `app:deploy` → Cloudflare | app.getcym.app version `4186247a` | **Live**; deployed bundle verified to contain the `never` strings and zero references to the deleted `lastContactAt` |
| Store binaries | EAS production-profile builds (first ever; `autoIncrement` bumps build numbers; production channel) | Android `655a6599-4b46-4dd6-806c-eb0d82bd7577`, iOS `8157ac53-3c76-4e91-9ab8-b6814fdf7d49` | **Building** — build only; store submission stays gated on Yan's explicit go |
| Server | n/a | — | No server change needed: `daily-nudges` renders no last-touch; no schema or data migration (no stored value was wrong) |

## Repository cleanup sweep

- No temporary investigation code lives in the app; proof/boundary harnesses
  are session-scratchpad only, with outputs reproduced in the phase reports.
- `scripts/.nudges-bundle.js` remains gitignored (regenerable); the two
  committed scripts (`diagnose-contact.mjs`, `health-invariants.mjs`) are
  read-only diagnostics and print no PII.
- Repo-wide sweep: zero `'new'`-status references in code or i18n; both
  locales complete; store screenshot assets committed.

## Observability (existing systems only — no new vendor, by design)

The app has no analytics SDK (deliberate privacy stance), so detection is
server-side and pull-based:

- `scripts/health-invariants.mjs` — recomputes health for **every active
  contact across all accounts** with the app's own compiled module and checks:
  I1 untouched ⟺ `never` ⟺ null last-touch (both directions); I2 only the five
  statuses exist; I3 no interactions dated >24 h in the future; I4 no
  unparseable timestamps. Counts only — never names/emails/phones/content.
- Day-zero run: `contacts(active)=4455 interactions=434`, distribution
  `never 4404 / warm 51 / cooling 0 / at-risk 0 / cold 0`, **ALL INVARIANTS
  HOLD**. (Distribution is sane: the account's touches are all recent.)
- `scripts/diagnose-contact.mjs` — per-contact drill-down when a report comes in.

## Rollout / rollback plan

- **Rollout:** OTA is immediate-on-launch for all beta devices; no staged
  percentage exists at this fleet size (≈10 testers) and none is warranted.
- **Rollback (JS):** `eas update:republish` the previous update group on the
  preview channel — one command, no binary, minutes to take effect. Web:
  `wrangler rollback` to version `4186247a`'s predecessor (Cloudflare keeps
  prior versions).
- **Rollback (data):** nothing to roll back — the release contains no
  migration and writes nothing new.
- **Trigger:** any invariant violation from the detector, or a tester report
  of a contradiction between History and the status line.

## Cross-platform status

The implicated code is shared TypeScript; iOS/Android/web run identical
logic. Verified: jest (160), boundary harness, deployed-web bundle grep, and
production recomputation. Rendered-screen spot-checks on device happen in
Phase 7 day-zero (after devices pull the OTA).
