# Relationship-Data Investigation — Phase 4: Implementation

2026-07-13. Implements the correction per the Phase 4 brief, which supersedes
the Phase 3 minimal plan with a product rule: **"Never touched" is the only
status for zero-interaction contacts; there is no "New" status.**
Commit: `2efb489`.

## 1. Semantics implemented

| Input state | Status before | Status now |
|---|---|---|
| 0 interactions, any age, any source, any verdict | `new` or `cold` (import rule / 180d rule) | **`never`** |
| ≥1 interaction, ratio ≤ 1 | warm | warm (unchanged) |
| ≥1 interaction, ratio ≤ 1.75 | cooling | cooling (unchanged) |
| ≥1 interaction, ratio ≤ 3 | at-risk | at-risk (unchanged) |
| ≥1 interaction, ratio > 3 **or** ≥180 d silence | cold | cold (unchanged) |

- `lastTouchAt(contact, interactions)` returns `string | null` — **no
  `createdAt` fallback exists anywhere**. `null` ⟺ never touched. (The old
  `lastContactAt` was deleted, not aliased, so stale callers fail to compile.)
- `healthFromTouch(touchedAt, cadenceDays, now)` is the single health core;
  `contactHealth` and `buildHealthIndex` are thin wrappers over it, so
  per-contact and batch paths cannot diverge (kills Phase 3's CF-2 for health).
- The 180-day cold override applies **only to touched** contacts.
- **Tracking gates visibility:** `healthEligibleContacts` (= `trackedContacts`)
  now sources the Health tab, so unevaluated imports/businesses leave Health
  counts entirely; the decay-nudge engine requires `isTracked(c)` **and** a
  real touch, so untouched/untracked contacts can never be reconnect
  recommendations.
- Thresholds untouched: warm ≤ 1, cooling ≤ 1.75, at-risk ≤ 3, cold > 3,
  `COLD_SILENCE_DAYS = 180`.

## 2. Files changed (14 files, +167/−78)

- `src/lib/nudges.ts` — core rewrite above; `untouchedHealth` deleted.
- `src/lib/tier.ts` — `healthEligibleContacts` added (eligibility owned here).
- `src/lib/types.ts` — `Health = 'never' | 'warm' | 'cooling' | 'at-risk' | 'cold'`.
- `src/app/contact/[id].tsx` — RC-1 fix: guard is now `last === null`, not the
  repealed `health === 'new'` proxy.
- `src/components/contact-row.tsx` — converged on `lastTouchAt(...) !== null`.
- `src/app/(tabs)/dashboard.tsx` — buckets `never|warm|cooling|at-risk|cold`;
  sources `healthEligibleContacts`.
- `src/components/health-badge.tsx`, `src/constants/theme.ts` — `never` color/key.
- `src/i18n/en.ts` / `es.ts` — `health.never` = "Never touched" / "Sin
  contacto aún"; `health.new` removed.
- Tests: new `src/lib/__tests__/relationship-status.test.ts` plus updates to
  nudges/scoring-regression/dedupe/sync suites (anonymized fixtures only).
- `scripts/diagnose-contact.mjs` — migrated to `lastTouchAt`; prints
  `last touch NONE (never touched)` for null.

## 3. Acceptance verification (run independently after review of every diff)

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `jest` | 18 suites, 160 tests, all pass |
| ESLint (changed files) | no new findings (3 pre-existing on untouched lines; 1 pre-existing warning removed) |
| `expo export` iOS + web | both bundle cleanly |
| Boundary harness (13 cases: exact threshold edges, 180 d edge ±1 d, DST span, tz-mixed offsets, future-dated touch, midnight edge) | all pass |
| Production re-check, Alec Hartman | `HEALTH: NEVER`, `last touch NONE (never touched)`, 0 interactions |
| Production re-check, Sean Salaz | identical |
| Production cross-check, touched contact | 1 interaction → `lastTouchAt` = real timestamp, health `warm` (touched path intact) |
| Repo-wide sweep for `'new'` health usage (code + i18n) | zero survivors |

No data migration performed or needed — no stored value was ever wrong
(Phase 2/3 finding); the fix is entirely in derivation code.

## 4. Not shipped in this phase

OTA/web deploy is intentionally held for Phase 6 (release prep) so it rides
the documented rollout/rollback plan.
