# Relationship-Data Investigation — Final Double-Check (measure twice, cut once)

2026-07-13. Two confirmation passes; Pass 2 was executed by a fresh-context
auditor given only the requirements and the repository — none of Pass 1's
conclusions.

## Pass 1 (in-context confirmation)

- `Health` type is exactly the five statuses (`src/lib/types.ts:29`); status
  literals in src count out to those five only; thresholds byte-verified
  (≤1 / ≤1.75 / ≤3 / `COLD_SILENCE_DAYS = 180`).
- No contact-specific logic: the only name reference outside docs is a test
  `describe` label pointing at the investigation record; fixtures are
  anonymous ids.
- tsc clean; 18 suites / 160 tests green (as of `806ff49`).

## Pass 2 (independent fresh-context audit)

Verdicts: **all eight requirements VERIFIED independently** (five-status
model, null last-touch with no fallback, tracked-only Health and decay,
thresholds, exhaustive consumers, no contact-specific logic, structural
cross-screen consistency, tsc/tests green).

Pass 2 earned its independence — it found **two real defects Pass 1 missed**,
both in the original bug's class (two derivations of one concept drifting):

| # | Defect | Fix (commit `c471b59`) |
|---|---|---|
| 1 | Decay-nudge candidate filter re-derived health from `healthOf(ratio)` alone, missing the 180-day cold override — a long-cadence contact (≥ ~103 d) silent 180+ d displayed **cold** on Health but never earned a decay nudge | Engine now reads the same `buildHealthIndex` the screens use; filter is on `health`, not raw ratio |
| 2 | `reconnect-anniversary` hooks skipped the tracking gate — an untracked import with one logged touch could get a reconnect nudge, contradicting "untracked contacts are excluded from reconnect recommendations" (the engine comment wrongly bundled it with the explicit-data hooks) | Hook now requires `isTracked(contact)`; comments corrected on both sides |

Both fixes carry regression tests **verified to fail on the pre-fix code**
(mutation-checked) and pass on the fix: 162/162 tests green, tsc clean, no
new lint findings.

Cleanup items from Pass 2, also applied: dead untranslated `label` strings
removed from `healthColors`; redundant `touched && last` guard collapsed in
`ContactRow`. Recorded observation (no change, by design): `es` locale is
`Partial<Dict>` with English fallback — parity is currently 466/466 keys but
not compiler-enforced.

## Divergence resolution

No conflicting findings between passes — Pass 2 was a strict superset.
Pass 1's "confirmed" on the reconnect-exclusion requirement was wrong in the
hook path; Pass 2's evidence was verified in code before fixing.

## Shipped

- OTA update group `0a5bcbe1-…` (preview channel — all distributed builds) and
  `1fe2c815-…` (production channel — pre-arms the first production binaries).
- Web redeploy `2825420e` on app.getcym.app.
- The Phase 7 monitoring window and invariants are unaffected (I1–I4 concern
  status/last-touch truth, which did not change).

**Verdict: cut confirmed.** Five statuses, one health core, one tracking
gate, engine and screens provably reading the same truth — with the
monitoring window still open through 2026-07-27 as the final arbiter.
