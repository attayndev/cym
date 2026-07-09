# Data-flow map (Phase 1 — audited 2026-07-09)

## Stores
- **Source of truth**: device-local AsyncStorage blob (`cym.db.v1` via src/lib/store.ts) —
  whole graph: profile, personas, contacts, contexts, interactions, hooks, nudges.
- **Mirror**: Supabase Postgres (contacts/contexts/interactions/hooks/nudges/personas/profiles),
  whole-graph sync in src/lib/sync.ts. Server-owned rows: interactions with
  source='email-sync' (gmail-sync fn), connected_accounts, profiles.is_pro (RevenueCat),
  contact_hints, suggested_contacts, hunter_cache (enrichment caches).
- **Device address book**: expo-contacts; linked by device-local map `cym.deviceLinks.v1`
  (app contactId → device contact id). Never authoritative for app data.
- **Device-local sidecars**: deck skips, refresh sweep state + update proposals,
  merge keeps, archive tombstones (all AsyncStorage; listed in clearDB).

## Interactions (incl. manual/flagged)
- Created in app-context `logInteraction` (manual types: met/call/text/email/coffee/meeting)
  and `markNudgeActed`; appended to db.interactions with random id `int_*`; saved to
  AsyncStorage immediately; pushed to Supabase after 1.5s debounce.
- Email-sync interactions created server-side with deterministic ids `int_gm_<msg>_<contact>`.
- Deletions: ONLY via removeContact purge (manual rows of that contact) and
  replaceClientInteractions delete-missing during push (client-owned rows only).

## Warmth/temperature
- NEVER stored: computed on render from persisted interactions.
  src/lib/nudges.ts: lastContactAt(contact, interactions) → most recent interaction
  occurredAt (fallback createdAt); decayRatio = daysSince/cadence; healthOf thresholds
  (warm ≤1.25, cooling ≤2, at-risk ≤3.5, cold >3.5); 'new' when zero interactions.
  All interaction SOURCES count equally (manual flags ARE real events).

## Sync (the historic data-loss zone — overhauled 2026-07-09)
- Push: version-guarded (graph_version compare-and-bump; stale push → GraphVersionConflict);
  replaceTable upsert+delete-missing per table; client-owned interactions only.
- Pull: pullGraph → **mergeGraphs** (union manual interactions by id; newest-updatedAt-wins
  contacts/contexts/personas; nudge verdict rank; email-sync remote-owned) — pulls can no
  longer stomp unpushed local work. Conflict = pull-merge-retry.
- updatedAt stamped centrally in update() by reference-diff.

## Contact sync/import (device ⇄ app)
- src/lib/contacts.ts syncDeviceContacts: pages device book; skips tombstoned + linked ids;
  name-matches (exact) to existing incl. same-run creations; additive alt-email/phone patches
  for linked; export writes app→device once, additive. Idempotent by links map + name match.
- Self-heal: links pruned when app contact vanished (clobber recovery path).
- Dedupe: dedupeImports on load/pull — exact-name auto-merge; loose-name merges only with
  shared email/phone evidence; ambiguous pairs → human MergeReview. Merges reassign manual
  interactions/contexts to keeper; drop only regenerable rows (dupe's email-sync ints, hooks, nudges).

## Enrichment
- Tier-0: gmail-sync harvests header names → contact_hints (server); client applyEnrichment
  fills blank lastName/company after every pull (additive only).
- Hunter/NinjaPear: enrich-contact fn (Plus-gated, global hunter_cache, daily caps; usage
  charged only on success as of today); client sweep (60/day, paced 350ms, cursor resumes
  on failure) fills blanks additively + turns conflicts into human-review proposals
  (updates deck; device-local store). Fills flow through updateContact → stamped → synced.
- Living cards: card_token subscription; subject-published fields overwrite on refresh.
- Writeback to phone book: ONLY via explicit "Update phone contacts" (additive, fills
  device blanks, never overwrites); enrichment does NOT auto-write to the device book.

## Known destructive operations (all audited)
- clearDB/resetAll (user-initiated only), delete-account fn (user-initiated),
  removeContact purge (user-initiated, archives + purges manual history),
  replaceTable delete-missing (now safe: only merged graphs are pushed),
  suggested/waitlist admin cleanups (server-side, not user graph).
- Migrations: additive only (add column/table); none drop user data.
