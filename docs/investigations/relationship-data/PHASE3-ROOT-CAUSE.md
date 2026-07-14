# Relationship-Data Investigation — Phase 3: Root Cause & Correction Plan

2026-07-13. Builds on `PHASE1-ARCHITECTURE-MAP.md` and `PHASE2-EVIDENCE.md`.
No fix was implemented in this phase; no production data was modified; no
thresholds were changed; no contact-specific exceptions were added.

**Code-drift check:** repo at `0d6e59a` (Phase 2 commit) plus untracked store
assets only; `src/lib/nudges.ts`, `src/app/contact/[id].tsx`,
`src/components/contact-row.tsx` are byte-identical to what Phases 1–2 cited.
Reports remain accurate.

## Step 1 — Consolidated evidence chains

Both contacts, from Phase 2 (values verified against production, read-only):

```text
Alec Hartman (ctc_mrcbs2765945w0ea)          Sean Salaz (ctc_mrcbs2751eycvx61)
persisted: source=import, evaluated_at=null, │ identical except enrichment
  status=active, kind=person,                │ (role/company/linkedin filled
  created_at=2026-07-08, cadence_days=90     │  by Hunter sweep 07-10)
→ interaction query: 0 rows (all sources; FK-verified; true empty, not a failed/filtered read)
→ selected last-touch: lastContactAt() = created_at fallback (nudges.ts:41) — NO touch source
→ cadence: stored 90 (import default)
→ status inputs: {0 interactions, source=import, evaluated_at=null, createdAt 5d old}
→ status output: contactHealth → untouchedHealth → 'cold' (nudges.ts:63); ratio 0.06 never consulted
→ cached/denormalized: none exist (no cache layer; no stored status)
→ view model: computed inline at render
→ rendered: detail = "Gone quiet" + "last touch 5 days ago" + "every 90 days";
            History = "No interactions logged yet";
            list rows = "Gone quiet" + "no touch logged yet"  (no contradiction in rows)
```

Both chains are identical at every status-relevant step. Per the brief, the
contacts were still analyzed independently through Phase 2; they share one
root cause (proof below applies to both shapes).

Important negative finding, restated: "No interactions logged yet" is a
**truthful successful empty result**. There is no identity mismatch, failed
query, filter, stale cache, or merge defect hiding interactions. The defect is
on the other side: a last-touch date rendered **without any interaction
source**.

## Step 2 — Root cause, with provenance and controlled proof

### The regression timeline (git-proven)

| Date | Commit | What it did |
|---|---|---|
| 2026-07-09 | `2527fa1` | Introduced the "no touch yet" strings on **both** consumers — ContactRow and the contact-detail screen — each guarded by `health === 'new'`. At that time the guard was **correct**: `'new'` was, by construction, exactly the state of every zero-interaction contact. |
| 2026-07-10 | `5f40d7f` ("…six months of silence is cold") | Changed the semantics: `untouchedHealth` now returns `'cold'` for (a) unevaluated imports — unconditionally — and (b) any never-touched contact ≥180 days old. `health === 'new'` **stopped being equivalent to "never touched."** The same commit migrated `contact-row.tsx` to the correct new guard (`touched` = interaction exists; 5-line diff) and extended `nudges.test.ts` — **but did not touch `src/app/contact/[id].tsx`**, whose guard still tests the now-broken proxy. |

The commit's own diffstat is the proof of incomplete propagation:
`contact-row.tsx | 5 ±`, `nudges.ts | 28 ±`, `nudges.test.ts | 32 ±` — and no
detail-screen file.

### Answer to "what is the earliest point where values become incorrect?"

No persisted, queried, merged, cached, or engine-computed value is ever
incorrect. The **first false value in the entire flow is created inside the
contact-detail render**, at `src/app/contact/[id].tsx:391-394`, when
`lastContactAt`'s createdAt fallback is displayed as a touch because the
suppression guard tests `health === 'new'` instead of "no interactions exist."

### Why the divergence occurs

`health === 'new'` was used as a *proxy* for "never touched." Commit `5f40d7f`
split those concepts (never-touched contacts can now be `'cold'`) and updated
only one of the two consumers of the proxy. A contributing design weakness
makes the symptom possible at all: `lastContactAt` (nudges.ts:27-42)
deliberately returns `createdAt` when no interactions exist so the decay
engine has an anchor date — a single function serving **two masters** (engine
math and display), with no way for a caller to distinguish "real touch" from
"fallback anchor."

### Why different screens can show conflicting information

Phase 1's architecture finding: there is no shared view-model or selector
layer for presentation strings. Each screen re-derives display state from the
raw DB with hand-copied guards (duplicated-rule registry, Phase 1). ContactRow
and the detail screen implement the same concept twice; `5f40d7f` fixed one
copy. Nothing in the type system or tests coupled the two.

### One root cause or several?

**One primary code defect:**

> **RC-1 — stale guard:** `contact/[id].tsx:391` suppresses the last-touch
> line on `health === 'new'`, a proxy invalidated by `5f40d7f`. (Introduced
> correct in `2527fa1`; became a defect on 2026-07-10.)

**Two contributing (non-defect) factors, documented but not to be "fixed" here:**

- **CF-1 — dual-purpose fallback:** `lastContactAt` conflates engine anchor
  with displayable touch; callers cannot see which they got.
- **CF-2 — duplicated presentation rules:** no shared derivation for
  "touched"/last-touch strings, so consumers can drift (this is the general
  class; RC-1 is its instance).

**Not defects:** the `'cold'` status itself for unevaluated imports is the
deliberate July-10 product rule ("importing is not meeting") — "Gone quiet" on
Alec is *intended semantics*, and the list screens display it coherently
("Gone quiet · no touch logged yet"). Whether that copy should read "never in
touch" for the untouched-cold class is a **product wording decision**, flagged
for the owner, outside this defect.

### Controlled proof (deterministic, real code, pinned clock)

Harness: the app's compiled `nudges` module + the two guards extracted
verbatim; `now` pinned to the screenshot timestamp. Output:

```text
A. AS-REPRODUCED (import, no verdict, 0 interactions, created 5d ago)
   health=cold  ratio=0.06  → detail: "last touch 5 days ago" ← CONTRADICTION   rows: "no touch logged yet"
B. COUNTERFACTUAL (only change: Track verdict given)
   health=new             → detail: "no touch yet"            no contradiction
C. COUNTERFACTUAL (one real touch 5d ago)
   health=warm            → detail = rows = "last touch 5 days ago"  coherent
D. NON-IMPORT (captured contact, 0 interactions, 200d old)
   health=cold  ratio=2.22 → detail: "last touch 200 days ago" ← CONTRADICTION  rows honest
```

Causation, not correlation: flipping the **single input** that routes
`untouchedHealth` away from `'cold'` (B) removes the contradiction with data
otherwise identical to A; adding a real touch (C) produces coherent output
through the *same* code paths. D proves the guard, not the import rule, is the
defect — the contradiction reproduces in a class the import rule never touches.

## Step 3 — Affected records and features

- **This account (measured):** 3,708 active person contacts in class A
  (unevaluated imports, zero interactions) — every one shows the fabricated
  last-touch line when its detail screen is opened. Class D
  (decided-but-never-touched, ≥180 d old) is currently **0 rows** on this
  account but will grow with time and affects any user who captures contacts
  and never logs a touch.
- **All users:** any account with imported contacts (the dominant onboarding
  path) is affected identically.
- **Features:** contact-detail header only. Verified unaffected: ContactRow
  (People/Health/search lists), Health-tab counts, Today engine (decay
  candidates are pre-filtered to touched contacts), server `daily-nudges`
  (renders no last-touch), wallet passes/share cards (no status fields).
- **Data repair required:** none — no stored value is wrong.

## Step 4 — Smallest maintainable correction (implementation-ready; NOT implemented)

Principle: restore one coherent source of truth for "has this contact ever
been touched," inside the existing architecture (pure functions in
`src/lib/nudges.ts` consumed inline — no new layer needed, so none proposed).

1. **Add the shared predicate (single source of truth), `src/lib/nudges.ts`:**
   ```ts
   export function hasTouch(contactId: string, interactions: Interaction[]): boolean {
     return interactions.some((i) => i.contactId === contactId);
   }
   ```
2. **Fix RC-1, `src/app/contact/[id].tsx:391-394`:** the screen already holds
   the contact-scoped `interactions` array (line 139). Replace the guard:
   ```tsx
   {interactions.length === 0            // or hasTouch(contact.id, db.interactions)
     ? t('common.noTouchYet')
     : t('common.lastTouch', { when: relativeTime(last, now) })}
   ```
   Copy reuses the existing `common.noTouchYet` key (en+es already present).
3. **Converge the row on the same predicate, `src/components/contact-row.tsx:37-59`:**
   replace its inline `touched` computation with `hasTouch(...)` so the two
   consumers cannot drift again (mechanical, no behavior change).
4. **Regression tests (jest, `src/lib/__tests__/nudges.test.ts`):**
   - `untouchedHealth` semantics: unevaluated import → `'cold'`; evaluated
     untouched fresh → `'new'`; untouched ≥180 d → `'cold'` (documents the
     intended product rule so the next guard author sees it).
   - `hasTouch` truth table, incl. the Alec shape: `hasTouch === false` while
     `contactHealth === 'cold'` — the exact pair the old guard conflated.
   - Guard-parity note: with the predicate shared, a UI-level test is not
     required for parity; if desired later, extract the ternary into a pure
     `lastTouchLabel(contact, interactions, now)` helper and test it directly.
5. **Explicitly out of scope (per brief):** no threshold changes, no data
   repair, no UI redesign, no changes to the import-cold product rule, no
   contact-specific handling. Optional product decision for the owner,
   separate from the fix: wording of the cold badge for never-touched
   contacts ("Gone quiet" vs. e.g. "Never in touch").

Estimated diff: ~10 lines app code + ~25 lines tests. Risk: minimal — the
detail screen adopts semantics the list rows have shipped since `5f40d7f`.

**Cleanup statement:** the Phase 3 proof harness lives outside the repository
(session scratchpad) and its full output is reproduced above; no temporary
code was added to the application. Diagnostic bundle regeneration from Phase 2
remains the only tooling side-effect (gitignored).

— End of Phase 3. Ready for Phase 4 (implementation) on approval.
