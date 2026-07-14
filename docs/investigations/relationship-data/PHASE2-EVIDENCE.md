# Relationship-Data Investigation — Phase 2: Reproduction & Evidence

2026-07-13. Builds on `PHASE1-ARCHITECTURE-MAP.md`. No production data was
modified; all database access was SELECT-only via the service role; email
addresses were redacted from all captured output; no thresholds, fixes, or
contact-specific exceptions were applied.

## Investigation checklist (from Phase 1, repo-specific)

- [x] Authoritative contact identifier → `contacts.id` (text, `ctc_…`); no separate relationship entity exists
- [x] Imported device-contact id → device-local only (`cym.deviceLinks.v1`), never persisted server-side; not needed here
- [x] Interaction model → `interactions` rows keyed `contact_id`; sources `manual|capture|email-sync`
- [x] Stored status fields → none derived is stored; inputs are `source`, `evaluated_at`, `status`, `kind`, `cadence_days`, `created_at`
- [x] Stored last-touch field → **does not exist**; always computed (`lastContactAt`)
- [x] Status calculations → `contactHealth` / `buildHealthIndex` (`src/lib/nudges.ts`)
- [x] History query → in-memory filter of the DB blob per contact
- [x] People / Detail / Health / Today flows → Phase 1 §"seven values"
- [x] Query-cache keys → none (no query library)
- [x] Hydration → AsyncStorage blob → context; server mirror equivalent after sync
- [x] Background jobs → email syncs write interactions; none wrote rows for these contacts
- [x] Duplicate calculations registry → Phase 1 §"Duplicated-rule registry"

## Step 1 — Environment

| Item | Value |
|---|---|
| Environment | **Read-only production inspection** (service-role SELECTs through the Supabase management API + the repo's committed diagnostic `scripts/diagnose-contact.mjs`). Chosen because the contradiction was captured on the production account and the server graph mirrors the device store after sync (Phase 1 §lifecycle). |
| App version / commit | repo `5f13b8b`; device runs the preview-channel binary with the latest OTA (same `nudges.ts` rules — verified rules landed July 10, before the July 13 screenshots) |
| Database | Supabase project `jvuvuukvgunhpemrhqxl` (production) |
| Account scope | Single user (owner account, email redacted); all queries `user_id`-scoped |
| Timezone | Device/user America/New_York; all stored timestamps UTC; day math is ms-elapsed (`daysBetween` floors), so a <9 h difference between screenshot time (15:06 local) and inspection time cannot change any value below |
| "Now" used | Inspection run 2026-07-13 (evening ET); screenshots taken 2026-07-13 15:06 ET |
| Platform | Rendered evidence from iOS (user screenshots); the implicated code is **shared TypeScript** (`src/lib`, `src/app`) identical across iOS/Android/web |
| Cold start / caches | Not applicable: no query cache exists; health/last-touch are recomputed per render from the context DB. Client-blob ≙ server-mirror equivalence is evidenced by the exact match between rendered strings and server-derived values (below) |
| Diagnostic tooling | Existing committed script `scripts/diagnose-contact.mjs`; its `scripts/.nudges-bundle.js` was rebuilt from current source before use (the checked-in bundle predated the July-10 rule changes — note: the script's *threshold caption text* is stale, but computation uses the fresh bundle). No temporary code was added to the app; nothing to remove. |

Reproduction commands (read-only):

```bash
npx esbuild src/lib/nudges.ts --bundle --platform=node --format=cjs --outfile=scripts/.nudges-bundle.js
SERVICE_KEY=… node scripts/diagnose-contact.mjs "Alec Hartman"
SERVICE_KEY=… node scripts/diagnose-contact.mjs "Sean Salaz"
```

## Step 2 — Identity graphs

Search: `ilike` on first/last name across **all** statuses and personas in the
account; each name matched exactly one row. No archived twins, no merge
residue (the dedupe engine absorbs rows rather than keeping merge-parent
links; none applicable), no cross-persona duplicates, no legacy re-sync ids
carrying interactions.

```text
Alec Hartman
├── canonicalContactId: ctc_mrcbs2765945w0ea   (only record, status=active, kind=person)
├── persona: psn_mr6ylkyz14g1hay (shared with Sean — the account's sole import persona)
├── relationshipId: n/a (no such entity in this schema)
├── importedContactId: device-local only (not inspectable server-side; not required)
├── mergedFrom: none
└── interactions linked: 0 rows (any contact_id) — verified by direct FK query

Sean Salaz
├── canonicalContactId: ctc_mrcbs2751eycvx61   (only record, status=active, kind=person)
├── persona: psn_mr6ylkyz14g1hay
├── mergedFrom: none
└── interactions linked: 0 rows
```

## Persisted values (server graph = sync mirror)

| Field | Alec Hartman | Sean Salaz |
|---|---|---|
| id | ctc_mrcbs2765945w0ea | ctc_mrcbs2751eycvx61 |
| source | **import** | **import** |
| evaluated_at | **null** | **null** |
| status / kind | active / person | active / person |
| created_at | 2026-07-08 17:01:52 UTC | 2026-07-08 17:01:52 UTC (same import batch) |
| updated_at | 2026-07-08 (untouched since import) | 2026-07-10 (enrichment sweep filled role/company/linkedin — no status-relevant field changed) |
| cadence_days | 90 (import default, never user-set) | 90 (import default) |
| category / importance | other / 1 (defaults) | other / 1 (defaults) |
| interactions (all sources) | **0 rows** | **0 rows** |

Sean differs from Alec only in Hunter-enrichment directory fields; his
status-relevant inputs are identical. **Independent verification confirms the
same defect class for both — not two different defects.**

## Derived values (computed by the app's own functions on those rows)

| Derivation | Alec | Sean |
|---|---|---|
| `lastContactAt` | `2026-07-08T17:01:52Z` — **the `createdAt` fallback** (`nudges.ts:41`), no interaction source exists | same |
| days since | 5 | 5 |
| `decayRatio` | **0.06** (5/90 — nominally deep-warm) | 0.06 |
| `contactHealth` | **cold** — via `untouchedHealth` branch `source==='import' && !evaluatedAt → 'cold'` (`nudges.ts:63`); the 0.06 ratio is never consulted | cold, same branch |
| `buildHealthIndex` | cold (batch path agrees — Health screen consistency confirmed) | cold |
| `isTracked` | false (import, never evaluated) | false |

## Rendered values (user screenshots, 2026-07-13 15:06 ET) vs. producing code

| Rendered string (contact detail) | Matches derivation? | Producing code |
|---|---|---|
| "Gone quiet" badge | ✅ health=cold | `untouchedHealth` cold-override → i18n label |
| "last touch 5 days ago" | ✅ *of the fallback value* | detail screen renders `lastContactAt` whenever `health !== 'new'` (`contact/[id].tsx:391-394`); the value is `createdAt`, not a touch |
| "Other" chip / "every 90 days" chip | ✅ | stored defaults |
| "No interactions logged yet" | ✅ | History over the (truly empty) interaction list (`contact/[id].tsx:715`) — a **successful empty result**, not loading/filtering/pagination (0 rows exist server-side; the in-memory filter is source-complete) |
| Health tab: both listed under "Gone quiet"; People row Sean-type rows show "no touch logged yet" | ✅ | rows guard on `touched`, not on `health==='new'` |

**Every rendered value matches its derivation exactly.** There is no
client/server skew, no cache staleness, no duplicate-record bleed, no orphaned
interactions, and no unexplained interaction source.

## Where the values become inconsistent

The persisted data is internally consistent. The contradiction is
manufactured at **two derivation/presentation sites**, in sequence:

1. **`src/lib/nudges.ts:60-66` (`untouchedHealth`)** — for `source='import'`
   with no Track verdict and no interactions, health is set to `'cold'`
   *unconditionally*, discarding the cadence ratio. This is a deliberate
   July-10 product rule ("importing is not meeting"), and it is why a 5-day-old
   record carries "Gone quiet" against a 90-day cadence. On its own this is
   defensible product semantics; it becomes contradictory only when combined
   with (2).

2. **`src/app/contact/[id].tsx:391-394`** — the detail screen suppresses the
   last-touch line only when `health === 'new'`. The cold-override in (1)
   means an untouched contact can be `'cold'`, so the screen falls through to
   rendering `relativeTime(lastContactAt(...))` — whose value, with zero
   interactions, is the **`createdAt` fallback** (`nudges.ts:41`). The screen
   thereby asserts "last touch 5 days ago" for a person the History section
   correctly reports as never touched. `ContactRow` (People, Health lists)
   guards the identical string on `touched` (an interaction exists) and does
   not exhibit the contradiction.

Divergence point, stated precisely: **the first moment a false value exists is
inside the contact-detail render, when `lastContactAt`'s createdAt fallback is
presented as a touch because the "untouched" guard tests `health === 'new'`
instead of the absence of interactions.** Everything upstream (rows, sync,
engine) agrees with itself.

## Scale of the affected class

`SELECT count(*)` over the account: **3,708 of 4,452 active person contacts**
are in the identical state (import, unevaluated, zero interactions). The
rendered Health screen the same day showed **3,711 "Gone quiet"** — the
3,708 plus a handful of genuinely-stale touched contacts — and 693 "New"
(non-import or recently created records without touches). The reported
contradiction therefore reproduces on ~83 % of this account's contacts when
their detail screens are opened; Alec and Sean are representative, not
special.

## Explicitly ruled out during this phase

- Duplicate/merged/archived records feeding different screens — one canonical row each
- Orphaned or foreign interactions — zero rows by FK for both ids
- Email-sync ghost interactions — zero `email-sync` rows for both
- Cache or hydration staleness — no cache layer exists; rendered = derived
- Server/client divergence — server-derived values match device-rendered strings exactly
- Pagination/filter false-empties in History — 0 rows exist; empty state is truthful
- Timezone artifacts — all values reproduce with UTC ms-floor math

— End of Phase 2. Read-only throughout; the only artifact touched was the
regeneration of the diagnostic's gitignored bundle from current source. Phase 3
(remediation design) can proceed from the two divergence sites above.
