# Relationship-Data Investigation — Phase 7: Production Monitoring & Closeout

Day zero: 2026-07-13 (OTA + web live). Monitoring window: **through 2026-07-27**.

## Day-zero verification (all passed)

| Check | Result |
|---|---|
| Invariant detector, full graph, all accounts | 4,455 active contacts / 434 interactions; `never 4404, warm 51, cooling 0, at-risk 0, cold 0`; **ALL INVARIANTS HOLD** |
| EAS update server, preview channel, runtime 0.1.0 | serves exactly the new update (`019f5e60-f9cc-7431-…`); devices get it on next launch (`checkAutomatically: ON_LOAD`) |
| Deployed web bundle (app.getcym.app) | contains `Never touched`; zero references to the deleted `lastContactAt` |
| Alec Hartman / Sean Salaz recomputed on production data | `NEVER`, null last-touch — the original contradiction is gone |

**One manual check remains for Yan** (the only person with the real account on
a real device): open Alec Hartman's detail screen after the app relaunches —
it must read "Never touched" + "no touch logged yet", with no last-touch line.

## Invariants under watch

- **I1** zero interactions ⟺ status `never` ⟺ null last-touch (both directions)
- **I2** only `never | warm | cooling | at-risk | cold` exist
- **I3** no interaction dated >24 h in the future
- **I4** no unparseable interaction timestamps

## Detection cadence

- **Automated (best effort):** a daily 9:43 AM in-session job runs the
  detector and alerts on any violation. It is session-scoped — if the Claude
  session restarts, it must be re-created (or run manually).
- **Durable:** re-run manually at day 3, 7, and 14 (2026-07-16 / -20 / -27):

  ```bash
  SERVICE_KEY=… node scripts/health-invariants.mjs   # exits 1 on any violation
  ```

- **Signal sources beside the detector:** beta-tester reports (invite email
  asks for feedback), Supabase logs for function errors. No analytics SDK
  exists, deliberately — nothing new was added for this.

## What would reopen the investigation

Any invariant violation; any tester screenshot showing a status/History
contradiction; the `cooling/at-risk/cold` buckets failing to populate as real
touches age (they should appear naturally as time passes — all current touches
are <90 d old, so zeros today are expected, not suspicious).

## Closeout stance (honest recommendation)

**Keep the issue open until 2026-07-27.** Code, tests, and production data all
agree today, but the defect class was "screens drift apart over time" — the
180-day override and the cooling→cold transitions have not yet been crossed by
real data in production. The boundary harness proves them synthetically; the
monitoring window exists to see them proven organically. Closeout requires:
clean detector runs through day 14, no tester contradictions, and Yan's
on-device confirmation above.
