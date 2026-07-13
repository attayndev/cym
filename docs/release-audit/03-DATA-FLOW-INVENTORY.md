# 03 — Data-Flow Inventory

Every field that leaves the device, where it lands, who can read it, retention, deletion, and disclosure status.

## On-device storage (AsyncStorage)

| Key | Contents | Sensitive? |
|---|---|---|
| `cym.db.v1` | whole graph: profile, personas, contacts (names, emails, phones, company, city, birthday, notes/context), interactions, hooks, nudges | **Yes — PII** |
| `cym.deviceLinks.v1` | cym-contact-id → native-contact-id map (device-local, never synced) | ids only |
| `cym.archiveTombstones.v1` | device-contact ids the user removed | ids only |
| `cym.mergeKeeps.v1`, `cym.refresh.v1`, `cym.deckSkips.v1`, `cym.deckCollapsed.v1`, `cym.checklist.v1`, `cym.activePersona.v1`, `cym.locale.v1` | view/UX state | no |
| Supabase auth session | access + refresh tokens | **Yes — auth material** |

**Note (see `07`, finding S-07):** the Supabase session lives in **AsyncStorage**, not iOS Keychain / Android Keystore. This is the Supabase-Expo default and acceptable (sandboxed per-app storage, no `NSFileProtection` downgrade), but not hardware-backed. Documented, not blocking.

## Off-device transfers

| Data | Destination | Trigger | Stored where | Retention / deletion | Disclosed? |
|---|---|---|---|---|---|
| Whole graph (all contact fields, context notes, interactions) | Supabase Postgres (own project) | sign-in pull / push | `contacts`,`contexts`,`interactions`,… RLS-isolated to user | until account deletion (CASCADE) | ✅ privacy.html |
| Contact email address | Hunter.io, NinjaPear/Nubela | Plus enrichment (`enrich-contact`) | `hunter_cache` (global, keyed by email) | found = permanent cache; miss = 30-day TTL | ✅ providers named in privacy.html |
| Business-card **photo** (base64) | Anthropic (`card-scan`, opus) | user scans a card | not persisted; returns fields only | none | ✅ "AI" + Anthropic subprocessor |
| Contact directory fields (first/last/company/email) | Anthropic (`classify-contacts`, haiku) | sweep classify | not persisted | none | ✅ Anthropic subprocessor |
| Draft prompt (contact name/role/company/context/notes) | Anthropic (`drafts`, sonnet, via proxy) | user taps draft | not persisted | none | ✅ AI drafts disclosed |
| Gmail message **headers** (From/To/Cc/Date) | Google Gmail API → own DB | Gmail sync | `interactions`,`contact_hints`,`suggested_contacts` | until account deletion / disconnect | ✅ metadata-only stated |
| Gmail OAuth tokens | own DB (`gmail_credentials`) | Gmail connect | service-role-only table | deleted on disconnect / account deletion | ✅ |
| IMAP app password + host | own DB (`imap_credentials`) | IMAP connect | service-role-only table, **plaintext** | deleted on disconnect / account deletion | ✅ (plaintext-at-rest flagged S-03) |
| Push token + platform | own DB (`push_tokens`) | login on device | RLS-isolated | account deletion | ✅ |
| Push notification copy (contact **first names**) | Expo Push | `daily-nudges` cron | transient | n/a | first-name only; lock-screen note S-08 |
| Card-safe fields (name/role/company/email/phone/city) | anyone with share token; Google Wallet | share / wallet | public by capability | token rotation revokes | ✅ user-initiated sharing |
| Waitlist / affiliate email | own DB (`waitlist`,`affiliate_applications`) | marketing forms | RLS/service-only | manual | ✅ marketing forms |
| Referral click (IP **SHA-256 hashed**) | own DB (`ref_clicks`) | `?ref=` visit | hashed only | manual | site cookie notice |

## What never leaves the device

- Device-contact id links, archive tombstones, deck/refresh/checklist view state.
- Raw email message **bodies/subjects** (Gmail metadata scope cannot read them; IMAP fetches ENVELOPE only).
- Raw client IP for attribution (hashed before storage).

## Third-party subprocessors (must match privacy policy — see `10`)

Supabase, Cloudflare, Expo (push), Anthropic, Google (OAuth/Gmail/Wallet/Firebase-FCM), Apple (Wallet/auth), Hunter, NinjaPear/Nubela, RevenueCat. **All are named in `site/privacy.html`.** ✅
