# 10 — Privacy Disclosure Matrix

Cross-checks each collected data field against: actual code, `site/privacy.html`, Apple App Privacy answers (draft), and Google Data Safety answers (draft). Basis: the verified `03` data-flow inventory.

## Draft store answers (field-by-field)

| Data type | Collected | Shared (3rd party) | Purpose | Optional? | Encrypted transit | Deletable | Code evidence | In privacy.html? |
|---|---|---|---|---|---|---|---|---|
| Name (user + contacts) | Yes | No | app function | required | Yes | Yes | `contacts`/`profiles` | ✅ |
| Email address (user) | Yes | No | account | required | Yes | Yes | Supabase Auth | ✅ |
| Email address (contacts) | Yes | **Yes** → Hunter, NinjaPear | enrichment (Plus) | optional (Plus feature) | Yes | Yes | `enrich-contact` | ✅ (providers named) |
| Phone (contacts) | Yes | No | app function | required | Yes | Yes | `contacts` | ✅ |
| Contact list | Yes | No (processed by AI on request) | relationship memory | required for sync | Yes | Yes | `contacts.ts` | ✅ |
| Photos (business-card scan) | Yes (transient) | **Yes** → Anthropic (processing) | OCR extraction | optional (scan) | Yes | not stored | `card-scan` | ✅ (AI + Anthropic) |
| Contact directory fields | Yes (transient) | **Yes** → Anthropic (classify) | noise filtering | optional (sweep) | Yes | not stored | `classify-contacts` | ✅ |
| Interaction history | Yes | No | scoring/nudges | required | Yes | Yes | `interactions` | ✅ |
| Email metadata (headers) | Yes | via Google API into own DB | "last contact" accuracy | optional (connect) | Yes | Yes (disconnect) | `gmail-sync`/`imap-sync` | ✅ (metadata-only stated) |
| Birthday, notes, context | Yes | drafts→Anthropic on request | reminders/drafts | required/optional | Yes | Yes | `contexts` | ✅ |
| Push token | Yes | Expo (delivery) | notifications | optional | Yes | Yes | `push_tokens` | ✅ |
| Purchase/subscription | Yes | RevenueCat/Apple/Google | billing | required for Plus | Yes | — | RevenueCat | ✅ |
| Approx. identifiers for ads/tracking | **No** | No | — | — | — | — | no analytics/ad SDK | n/a |
| Coarse/precise location | **No** | — | — | — | — | — | not requested | n/a |

## Apple App Privacy "nutrition label" (draft)
- **Data used to track you:** None (no ATT; no tracking SDK).
- **Data linked to you:** Contact info (name/email/phone), Contacts, User content (notes/photos for scan), Identifiers (user id), Purchases, Usage (interactions).
- **Data not linked to you:** none material.
- Card-scan photos and classify payloads are transient (not stored) but are still "collected/transmitted" for the session → declare under User Content / processing.

## Consistency checks / flags

| Check | Result |
|---|---|
| Every subprocessor in code is named in privacy policy | ✅ Supabase, Cloudflare, Expo, Anthropic, Google, Apple, Hunter, NinjaPear, RevenueCat |
| Contact write-back to device disclosed | ✅ privacy.html states additive write-back; ⚠️ ensure Android pre-permission UI repeats it (F-18/09) |
| Gmail scope claim (metadata-only) matches code | ✅ `gmail.metadata` scope, headers only |
| Enrichment sends only email (no notes) | ✅ verified in `enrich-contact` |
| Data collected before consent | ✅ none — sync/import/enrichment all user-initiated; onboarding is account-gated |
| Retention/deletion claims match code | ✅ CASCADE on account delete; enrichment cache TTL noted |
| **Pricing statements consistent** | ❌ **F-20** — terms.html vs store-listing.md diverge; reconcile |
| **Web deletion URL exists** | ❌ **F-18** — add for Play |
| iOS vs Android behavior differences disclosed | ✅ Apple sign-in iOS-only, IMAP both; no undisclosed divergence |
| Analytics receives PII | ✅ N/A — no analytics |

## Recommended factual corrections (for counsel/product — not legal advice)
1. Reconcile the **Plus price** across `terms.html`, `store-listing.md`, `paywall` copy, and store product config (F-20).
2. Add a **web account-deletion page** and reference it in the policy + Play Data Safety (F-18).
3. Confirm the privacy policy's effective date and operator entity ("Attayn Group LLC, DBA Call Your Mom") are current at submission.
