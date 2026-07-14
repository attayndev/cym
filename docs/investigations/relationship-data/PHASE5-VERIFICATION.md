# Relationship-Data Investigation — Phase 5: Independent Verification & Hardening

2026-07-13, against commit `2efb489`. Verification was designed from the
briefs and the Phase 1–3 record, not from the Phase 4 implementation notes.

## What was exercised

1. **Boundary harness** (compiled app module, pinned clocks — not mocks of the
   logic): 13 cases, all pass.
   - `never` for zero interactions regardless of source/verdict/age.
   - Exact threshold edges: ratio 1.00 → warm; 91/90 d → cooling; ratio 1.75
     exact → cooling; just past → at-risk.
   - 180-day override: 179 d (cadence 365) → warm; exactly 180 d → cold; the
     override fires even at ratio 0.49 — and **never** fires for untouched
     contacts (they are `never`, not `cold`).
   - Time edges: 89 d 23 h 59 m → warm (floor math); DST spring-forward span;
     mixed-offset timestamps of the same instant; future-dated touch clamps to
     0 days (warm, no error).
2. **Production, both defect classes** (read-only, service-role, PII redacted):
   Alec/Sean shape → `NEVER` + null last-touch; a really-touched contact →
   real timestamp + `warm`. Rendered-string parity holds because detail
   screen, rows, and Health buckets now share one predicate/core.
3. **Sweeps:** zero `'new'`-status survivors in code or i18n; both locales
   carry `health.never`; full jest (160) + tsc + iOS/web export re-run clean.

## Defects found

**None reproducible.** No code was modified in Phase 5.

## Documented behaviors (not defects; no writer path can produce them)

- **Invalid `occurredAt` timestamp** → NaN day-math → health degrades to
  `cold`, no crash. All app writers stamp `new Date().toISOString()`; the
  server schema is `timestamptz`. Accepted as defensive degradation.
- **Future-dated `occurredAt`** → clamped to 0 days → warm. Matches intent
  (a scheduled/just-logged touch is fresh).

## Deferred to Phase 7 (correctly, not skipped)

On-device/web rendered-screen spot-check must happen **after** the Phase 6
OTA/web deploy — the deployed bundles still run pre-fix code until then, so a
day-zero check now would verify the wrong build.
