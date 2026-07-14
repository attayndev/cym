# Relationship-Data Investigation — Phase 1: Architecture Map

Read-only analysis, 2026-07-13. No code, records, or migrations were changed in
this phase; no temporary diagnostics were needed (static tracing sufficed —
every value below was verified against the code at the cited lines, not
assumed). This document maps how the app determines and displays: tracked
status, cadence, last touch, interaction history, relationship status
(health), Health-screen counts, and Today recommendations.

## Step 1 — Technology stack

| Concern | What actually exists |
|---|---|
| Mobile framework | Expo SDK 56 / React Native 0.85 (New Architecture), TypeScript |
| Navigation | expo-router (file-based; tabs: Today `index`, `card`, `scan`, `dashboard` = Health, `people`) |
| State management | **One React context** (`src/state/app-context.tsx`, `AppProvider`) holding a single in-memory `DB` object. No Redux/Zustand/MobX. |
| Data fetching / caching | None (no react-query/SWR). Supabase reads happen inside `sync.ts`/feature libs; results merge into the one `DB` object. Feature-local `useState`/`useMemo` only. |
| Local persistence | AsyncStorage, single JSON blob `cym.db.v1` (`src/lib/store.ts`) + small device-local side stores (below) |
| Backend | Supabase: Postgres + Deno edge functions; PostgREST via `@supabase/supabase-js` (no ORM) |
| Background jobs | pg_cron + pg_net → edge functions: `gmail-sync` 07:00 UTC, `outlook-sync` 07:10, `imap-sync` 07:20, `daily-nudges` hourly at :05 (9am-local gate) |
| Contact sync | `expo-contacts/legacy` two-way (`src/lib/contacts.ts`); device-link map is device-local |
| Communication sync | Gmail (REST, metadata-only), Outlook/Graph (removed — IMAP path instead), generic IMAP. All write `interactions` rows server-side, **outbound messages only** |
| Auth / scoping | Supabase Auth (email, Apple, Google). Every table row is `user_id`-scoped with RLS; client whole-graph sync per user |
| Testing | Jest (`jest-expo`), 147 tests; Playwright (chrome channel) for web e2e |

## Step 1 — Actual architectural boundaries

There is no repository/service/use-case layering. The real pipeline is:

```text
Supabase Postgres (per-user rows; RLS)
  ⇄  sync.ts pullGraph/mergeGraphs/pushGraph   ← whole-graph, debounced push (1.5 s), version-guarded
        ↓ merge
AsyncStorage blob cym.db.v1  ⇄  AppProvider in-memory DB (React context)
        ↓ (render time — no memo layer for health)
Pure functions in src/lib (nudges.ts, tier.ts, deck.ts, classify.ts, dates.ts)
        ↓
Screens / components (contact/[id].tsx, ContactRow, dashboard.tsx, index.tsx, people.tsx)
```

Parallel server-only pipeline (never passes through the client engine):

```text
gmail-sync / imap-sync (Deno)  →  interactions rows (source='email-sync', ids int_gm_/int_im_)
daily-nudges (Deno)            →  reads contacts/contexts SQL directly → push notifications
```

Patterns checklist (asked in the brief): repository layer **no**; service layer
**no** (feature libs of pure functions instead); domain services **partially**
(`nudges.ts` is a de-facto domain engine); use cases **no**; selectors **yes,
as plain functions called inline in render** (`contactHealth`,
`lastContactAt`, `buildHealthIndex`, `pendingNudges`, `isTracked`); store
**single React context**; query hooks **no**; API clients **supabase-js
only**; server functions **yes** (edge fns); database functions **no** (no
pl/pgsql for this domain); background jobs **yes** (crons above); local
persistence **yes** (AsyncStorage); denormalized DB fields **inputs only, no
persisted derived status** — health is always recomputed; calculated view
models **inline at render**.

## Storage inventory (inputs to the seven values)

**`DB` blob (`cym.db.v1`, mirrored to Postgres):** `contacts`, `contexts`,
`interactions`, `hooks`, `nudges`, `personas`, `profile`, `accounts`,
`onboarded` (`src/lib/types.ts:178`).

Fields that feed status math:

| Field | Set by | Used for |
|---|---|---|
| `contact.createdAt` | capture/import | `lastContactAt` fallback; `untouchedHealth` staleness |
| `contact.cadenceDays` | capture (category default), Track verdict, edit; import default 90 | cadence chip; `decayRatio` divisor |
| `contact.evaluatedAt` | deck Track verdict (`trackContact`) | `isTracked`; `untouchedHealth` import rule; evaluate-deck pool |
| `contact.source` (`'manual'\|'import'\|'qr'…`) | creation path | `isTracked`; `untouchedHealth`; deck pool |
| `contact.kind` / `contact.status` | classifier / sweep / archive | `isActiveContact`, `isTracked` |
| `interaction.occurredAt`, `contactId`, `source` (`'manual'\|'capture'\|'email-sync'`), `type`, `note` | see writers below | last touch, history, decay, health |
| `context.commitment/commitmentDueAt`, `contact.birthday` | user input | hooks → Today + server push |
| `nudge.state/kind/score/hookId` | engine + user actions | Today list |
| `profile.isPro` | RevenueCat webhook (remote-owned in merge) | tier filtering |

**Interaction writers:** client — `logInteraction` (contact screen quick-log +
composer Mark sent), `markNudgeActed` (nudge screen), capture flow; server —
gmail/imap sync (deterministic ids `int_gm_<msg>_<contact>`, outbound-only).

**Device-local side stores (never synced, `src/lib/store.ts`):**
`cym.deviceLinks.v1`, `cym.checklist.v1`, `cym.mergeKeeps.v1`,
`cym.archiveTombstones.v1`, `cym.refresh.v1` (Updates deck proposals),
`cym.deckSkips.v1`, `cym.activePersona.v1`.

**Server-only tables (outside whole-graph sync):** `contact_memory`,
`share_tokens`, `exchange_submissions`, `suggested_contacts`, `contact_hints`,
`connected_accounts` (merge treats accounts + email-sync interactions as
remote-owned).

## The seven values — source → calculation → consumers

### 1. Tracked
- **Rule:** `isTracked(c)` = active ∧ not business ∧ (`evaluatedAt` set ∨ `source !== 'import'`) — `src/lib/tier.ts:15`.
- **Consumers:** Today free-tier nudge filter (`visibleNudgeContactIds`, `(tabs)/index.tsx:33`), local notifications filter (`notifications.ts:47`), capture save gate, deck Track gate (`canTrackMore`).
- **Duplicate implementation:** `supabase/functions/daily-nudges/index.ts` re-expresses the rule in SQL/Deno for free users (`evaluated_at OR source<>'import'`, line ~120). Two codebases must agree by convention only.

### 2. Cadence
- **Source of truth:** stored `contact.cadenceDays` (no calculation). Import default 90; category defaults at capture; user-editable; rhythm suggestions (`refresh.ts` UpdateProposal `cadenceDays`) only change it after user acceptance.
- **Consumers:** chips on contact screen/edit; `decayRatio` divisor; deck Track chips (30/90/180).

### 3. Last touch
- **Calculation:** `lastContactAt(contact, interactions)` — max `occurredAt` over that contact's interactions **of any source**, else **fallback `contact.createdAt`** (`nudges.ts:27-42`; the fallback is deliberate per the July-10 comment).
- **Consumers and their guards (differ):**
  - `ContactRow` (`contact-row.tsx:37-59`): shows "last touch …" only when `touched` (an interaction exists); otherwise "no touch logged yet".
  - **Contact detail** (`contact/[id].tsx:143,391-394`): shows "no touch yet" only when `health === 'new'`; for every other health value it renders `relativeTime(lastContactAt(...))` — which for a zero-interaction contact is the createdAt fallback.
  - `decayRatio` (engine): same function, denominator input.

### 4. Interaction history
- **Source:** `db.interactions.filter(contactId).sort(occurredAt desc)` computed in the contact screen (`contact/[id].tsx:139-141`); History section renders all sources; empty state at line 715.
- Merge rules (`sync.ts:265-330`): manual/capture interactions union **by id** (a logged touchpoint can never be erased by a pull); `email-sync` rows are replaced wholesale from remote (server-owned).

### 5. Relationship status (health)
- **Calculation (two implementations, kept in lockstep by hand):**
  - `contactHealth` (`nudges.ts:69-80`): zero interactions → `untouchedHealth` (**import ∧ no `evaluatedAt` → `'cold'` outright**; else `'new'` until `createdAt` is 180 days old, then `'cold'`); with interactions → `'cold'` if ≥180 days silent, else ratio buckets `healthOf` (≤1 warm, ≤1.75 cooling, ≤3 at-risk, else cold).
  - `buildHealthIndex` (`nudges.ts:87-110`): one-pass batch re-implementation of the same rules for long lists.
- **Display mapping:** `HealthBadge` + i18n (`at-risk` → "Going quiet", `cold` → "Gone quiet", `new` → shown as "no touch yet" text in rows).
- **Consumers:** contact detail (per-contact fn), ContactRow (prop from index or per-row fn), People (`buildHealthIndex`, memoized on `[contacts, interactions, now-ish]`), Health tab (`dashboard.tsx:41`), engine decay candidacy (`healthOf(ratio)` at `nudges.ts:387` — note: engine uses the *ratio* path only; candidates are pre-filtered to touched contacts).

### 6. Health-screen counts
- `dashboard.tsx:40-41`: `buildHealthIndex(db.contacts.filter(isActiveContact), db.interactions, now)` → bucket counts (warm/cooling/going-quiet/gone-quiet/new). All personas (persona filtering was removed July 11); archived excluded via `isActiveContact` (`classify.ts:64`). "Bring these back to warm" list = cold bucket, capped at 25 rows.

### 7. Today recommendations
- **Client engine** `refreshEngine` (`nudges.ts:307-407`): (a) wake lapsed snoozes; (b) hooks — birthday (7-day lookahead), commitment-due (3), reconnect anniversary, role-change — deduped by `contact|type|date`, content re-derived every run; (c) decay nudges — only contacts with ≥1 interaction (`touched` set, line 376), active, not already nudged, not handled within 14 days, `healthOf(ratio)` ∈ {at-risk, cold}, sorted `ratio×importance`, capped at 10 live.
- **When it runs:** app cold load (`app-context.tsx:226`), every cloud pull (`:319`), and after mutations that add hooks (`:391`). Health itself is *not* engine output — it's recomputed at render.
- **Presentation:** `pendingNudges` sort (hooks before decay, then score) → free-tier filter → Today sections (Worth acting on / Keep warm), plus the non-engine decks: Evaluate ("Worth tracking?" — `deck.ts:43` pool = active persons, `source==='import'`, no `evaluatedAt`), UpdatesDeck (device-local `cym.refresh.v1`), MergeReview.
- **Server push path (independent):** `daily-nudges` recomputes *birthday-today* and *commitment-due-today* from SQL rows in Deno, with its own tz math and its own free-tier filter — it shares no code with `refreshEngine`.

## Lifecycle (when each value can change)

1. **Cold start:** `loadDB` → `ensureClassified` → `dedupeImports` → `refreshEngine` → `saveDB` (`app-context.tsx:224-230`).
2. **Every mutation:** `update()` → `stampUpdatedRows` (ref-diff sets `updatedAt`) → conditional `refreshEngine` → `saveDB` + `schedulePush` (1.5 s debounce) (`:391-394`, `:249`).
3. **Sign-in / foreground (>3 min) / version conflict:** `pullFromCloud` → `mergeGraphs` → normalize chain → optional push-back (`:288-342`, RNAppState listener `:267`).
4. **Nightly (server):** email syncs insert `email-sync` interactions → reach the client on its next pull (until then, client health and server-side reality can differ by up to one pull cycle).
5. **Render:** health / last-touch / counts are computed fresh from the in-memory DB on every render (no persisted or cached status anywhere).

## Where the reported contradictory strings come from (locations only)

For a contact like Alec Hartman (import or re-import, zero interaction rows,
`createdAt` ≈ 5 days ago, default cadence), the four simultaneous displays are
each produced by a different rule above:

| Displayed string | Producing code |
|---|---|
| "Gone quiet" | `untouchedHealth` → `'cold'` for `source==='import' && !evaluatedAt` (`nudges.ts:63`) → i18n "Gone quiet" |
| "last touch 5 days ago" | contact detail renders `lastContactAt` whenever `health !== 'new'` (`contact/[id].tsx:391-394`); with zero interactions that value is the `createdAt` fallback (`nudges.ts:41`) |
| "Every 90 days" | stored `contact.cadenceDays` chip (import default) |
| "No interactions logged yet" | History section over the contact's actual (empty) interaction list (`contact/[id].tsx:715`) |

Note `ContactRow` guards the same string differently (`touched` vs
`health==='new'`), which is why list rows show "no touch logged yet" while the
detail screen shows a relative date for the same contact. Recording the
divergence points is the extent of Phase 1; no diagnosis or fix is made here.

## Duplicated-rule registry (single source of divergence risk)

1. `contactHealth` vs `buildHealthIndex` — same rules, two implementations (`nudges.ts:69` / `:87`).
2. "no touch yet" guard — `ContactRow` (`touched`) vs contact detail (`health==='new'`).
3. `isTracked` — client TS (`tier.ts:15`) vs `daily-nudges` Deno/SQL filter.
4. Birthday/commitment "today" — client hooks (`computeHooks`) vs `daily-nudges` server recomputation (different tz handling).
5. Last-touch semantics — `lastContactAt` fallback to `createdAt` is embedded in three consumers with different display guards.

— End of Phase 1. No files outside this document were modified.
