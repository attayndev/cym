# Call Your Mom — Features & Architecture

The living source of truth for what the app does and how it is built. Update this
document whenever features change. Product rationale lives in
[PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md); how to run it lives in [README.md](./README.md).

_Last updated: 2026-07-02_

---

## 1. What it is

A personal relationship manager that captures the people you meet *with the context of
why they matter*, then surfaces the right moment and the right move to reconnect — with
the message already drafted. Runs as both a **mobile app** (iOS/Android) and a **web
app** from one Expo / React Native codebase.

## 2. Feature inventory

Status legend: ✅ shipped · 🟡 partial · ⏳ planned (needs backend/credentials)

### Free tier
| Feature | Status | Notes |
|---|---|---|
| Contact capture with context prompts | ✅ | 3-step wizard: identity → the four context prompts (where met / discussed / why they matter / commitment + due date) → category, importance, cadence |
| Edit / delete contacts; add context later | ✅ | Edit screen mirrors capture; delete with confirm; context is editable after creation |
| Contacts sync (two-way) | ✅ | Mobile: device contacts import (deduped) + app contacts export to the device address book, which the OS syncs to Google/iCloud/Microsoft. Device↔app link is device-local (never synced). "Sync contacts" on People |
| Sharing card + QR | ✅ | Editable profile card → QR. Signed in: the QR is a token URL to your card page on getcym.app; signed out/offline it stays a plain vCard any camera can add |
| QR landing page + reciprocal exchange | ✅ | `getcym.app/c/<token>`: a ~17 KB brand-styled static page — recipient sees your card, saves a vCard, and can share their details back (plus a "get your own card" CTA). Submissions land in a review inbox on People; accepting runs the capture ritual prefilled (`source: 'qr'`). Links are revocable and `noindex`/robots-disallowed |
| Onboarding | ✅ | First-run: welcome → card setup → notification priming → add first person / import / sample data. No more demo-seed-on-launch |
| Empty states | ✅ | Today, People, and Health all have first-run empty states |
| Settings & privacy | ✅ | Profile, language, notifications, subscription, privacy statement, data export, reset |
| Multilingual (i18n) | ✅ | English + Spanish; device-locale aware; in-app language switcher; locale-aware dates |

### Paid tier ($100/yr — gated on `profile.isPro`)
| Feature | Status | Notes |
|---|---|---|
| Occasion-aware nudge engine | ✅ | Decay scoring vs. cadence + hooks: birthday, commitment-due, 6-month reconnect. Hook-led; bare decay nudges capped at 3 so it never becomes a guilt list |
| Local notifications + daily scheduling | ✅ | On-device: morning digest of live hook nudges + birthday-morning reminders. Mobile only |
| Server push + nightly job | 🟡 | `daily-nudges` edge function sends localized push for today's birthdays + due commitments; nightly cron runs gmail-sync then daily-nudges. Code complete; needs EAS project + dev build + cron — see `supabase/PUSH.md`. Push is mobile-only and needs a physical device |
| Follow-up drafts | ✅ | Generated from captured context + hook, in the user's language; context-aware template fallback; channel toggle (text/email) opens Messages/Mail |
| Aging dashboard | ✅ | Health buckets (new / warm / cooling / at-risk / cold) + "bring these back to warm". Contacts with no logged interaction (typical for address-book imports) are 'new' — never counted warm, never targeted by decay/anniversary nudges — until a first touch is logged or Gmail sync backfills one |
| Accounts + cross-device sync | 🟡 | Supabase backend fully scaffolded (schema, RLS, auth, sync layer, auth UI). Dormant until `EXPO_PUBLIC_SUPABASE_*` env vars are set — see `supabase/README.md` |
| Email sync (Gmail) | 🟡 | The brief's make-or-break. Fully coded: 3 edge functions (OAuth start/callback + metadata sync), locked-down token table, "Connect Gmail / Sync now / Disconnect" in settings. Reads metadata only (timestamps + participants), matches to contacts by email, writes email-sync interactions. Needs Google OAuth provisioning + function deploy — see `supabase/GMAIL.md`. Restricted-scope verification required before public launch |
| Real billing | ⏳ | "Go Pro" currently flips a local flag (`is_pro` column exists). Needs StoreKit/RevenueCat (mobile) + Stripe (web) + a payment webhook |
| Personas (scoped graphs) | ✅ | Persona switcher (appears at 2+ personas), manage screen (create/edit/delete/set-default), per-persona contacts/nudges/health/card + share link. Creating a 2nd persona is Pro-gated. Active persona is device-local |

## 3. Architecture

| Layer | Location | Notes |
|---|---|---|
| Data model | `src/lib/types.ts` | User, Persona, Contact, Context, Interaction, Hook, Nudge, ConnectedAccount, LocalizedText. Multi-persona-ready from day one |
| Persistence | `src/lib/store.ts` | AsyncStorage JSON document behind a small repository surface (swappable for a hosted backend) |
| Nudge engine | `src/lib/nudges.ts` | Pure functions: decay scoring, health bucketing, hook generation, decay capping. Nudge content is stored as translation keys + params (`LocalizedText`) and resolved at render time so it follows the language switch |
| Notifications | `src/lib/notifications.ts` | Local scheduling; web-guarded; reschedules on every data change |
| Drafts | `src/lib/drafts.ts` | `fetch`-based Anthropic call (NOT the Node SDK — it imports `node:fs` and breaks the RN bundle). Modes: backend proxy → dev API key → template fallback. Writes in the user's language |
| i18n | `src/i18n/` | `t()` / `tx()` + `I18nProvider` context; `en` is the source dictionary, `es` is a full translation; non-React callers use the module-level `t()` |
| App state | `src/state/app-context.tsx` | Provider exposing the db + all actions; engine + notifications re-run on every mutation and app open |
| Seed data | `src/lib/seed.ts` | `emptyDB()` for new accounts; `sampleEntities()` for the opt-in "load sample data" |
| Backend (Supabase) | `src/lib/supabase.ts`, `src/lib/sync.ts`, `src/state/auth-context.tsx`, `supabase/migrations/` | Env-guarded client (`isSupabaseConfigured()`); per-user RLS schema; whole-graph pull/push sync; email auth. All dormant until env vars are set — the app is identical local-first without them |
| Gmail sync | `src/lib/gmail.ts`, `supabase/functions/gmail-*` | OAuth flow runs server-side (client secret never on device); metadata-only sync writes `email-sync` interactions. Server owns `connected_accounts` + email interactions; client push leaves them untouched. Provisioning in `supabase/GMAIL.md`. **Mobile-only** |
| Push notifications | `src/lib/push.ts`, `supabase/functions/daily-nudges` | Device token registration + server-sent localized push for the day's hooks (birthday/commitment-due, hook-driven only). Nightly cron chains gmail-sync → daily-nudges. Provisioning in `supabase/PUSH.md` |
| Contacts sync | `src/lib/contacts.ts`, `src/lib/store.ts` (link map) | Two-way device address-book sync; covers Google/Apple/Microsoft via the OS-merged book. Link map is device-local in AsyncStorage (device-contact ids differ per phone, so never synced). Mobile-only |
| QR share + exchange | `src/lib/share.ts`, `src/lib/vcard.ts`, `supabase/functions/share-card`, `src/app/c/[token].tsx`, `src/components/exchange-inbox.tsx` | Per-persona share tokens (Postgres-minted, 128-bit) + exchange submissions live OUTSIDE the whole-graph sync (like connected_accounts) and are fetched on demand. `share-card` (public, verify_jwt off) serves card-by-token + accepts submissions with caps; RLS: owner-only, no insert policy |
| Personas | `src/lib/personas.ts`, `src/components/persona-switcher.tsx`, `src/app/personas.tsx` | Pure helpers (resolve/filter/card-fallback/reassign) + switcher pill + manage modal. Active persona is device-local AsyncStorage (`cym.activePersona.v1`) — a view preference, never synced |
| Marketing site (Cloudflare) | `site/`, `wrangler.jsonc`, `workers/router.ts` | Static brand site on getcym.app (getcym.com 301s to it); single-page + `share.html` (the ~17 KB share landing served for `/c/*` with per-token OG tags injected worker-side). Login links out to app.getcym.app. `npm run site:deploy` |
| Web app (Cloudflare) | `wrangler.app.jsonc` | The RN web export on app.getcym.app (login-only: no signup on web; `/login` redirects to `/auth`). `npm run app:deploy` |
| Design system | `src/constants/theme.ts`, `src/components/dial-mark.tsx`, `scripts/generate-brand-assets.mjs` | The brand system (matches getcym.app): Fraunces 900 + Karla, cream/butter/cherry/espresso/avocado/blush tokens, 2px espresso borders, hard offset shadows via RN `boxShadow` (`hardShadow()` helper), butter tab bar, kicker pills, rotary-dial mark (SVG component + generated icon/splash/favicon set) |
| Screens | `src/app/` | Today, People, Health, My Card (tabs); capture, contact detail, contact edit, nudge composer, onboarding, settings, paywall |

### Conventions
- **No hardcoded user-facing strings** — every label goes through `t()` with a key in
  `src/i18n/en.ts` (and a Spanish translation in `es.ts`). Engine-generated text uses
  `LocalizedText` ({key, params}) resolved with `tx()`.
- **React Compiler is disabled** (`app.json` → `experiments.reactCompiler: false`).
  It memoized `t('constant')` calls and broke live language switching.
- Web content is capped at a centered ~560px column so the desktop web app doesn't
  stretch edge-to-edge.

## 4. Verification

- Types: `npm run typecheck` (tsc, clean)
- Tests: `npm test` (jest-expo — nudge engine + date logic, 14 tests)
- Bundles: `npx expo export --platform ios --platform web` (export iOS too — web-only
  export does not catch `node:` builtin resolution errors that crash the native bundle)
- Landing page locally: `npm run web:export && npx wrangler dev` → open
  `http://localhost:8787/c/<token>` (worker OG injection + assets, no deploy needed)

## 5. Roadmap (next, in order)

1. **Provision Supabase** (scaffold done) — create the project, apply `supabase/migrations/0001_init.sql`, set env vars. See `supabase/README.md`. Then harden sync (per-row diffing / realtime / conflict handling) beyond the MVP whole-graph approach.
2. **Gmail email sync** (code complete) — provision Google OAuth + deploy functions per `supabase/GMAIL.md`, then complete restricted-scope verification before public launch. Next: a server cron to recompute decay / fire push (the nightly `gmail-sync` schedule is a starting point)
3. **Real billing** (StoreKit/RevenueCat + Stripe) wired to the `is_pro` column via a payment webhook
4. Share hardening: per-IP rate limiting / Turnstile on the public `share-card` POST;
   universal links (open `/c/<token>` in the app); Apple/Google Wallet pass variants
5. More locales (the i18n foundation is in place — add a dictionary file + register it)
6. **Remote beta distribution** — wire `expo-updates`/EAS Update channels for OTA JS
   pushes to testers; Android beta = preview APK link; iOS beta = ad-hoc preview build
   (register tester UDIDs via `eas device:create`). TestFlight stays gated behind the
   RevenueCat + explicit-go production policy.
7. **"Update Contacts" export button** — push CYM-captured directory facts (phone,
   email, company, role, birthday) into the linked device contacts via the existing
   link map. Additive only: fill blanks and add values, never overwrite/delete device
   data. Never export CYM-private context (why-they-matter, commitments, notes).
8. **More email providers** — generic IMAP BUILT July 9 (iCloud, Yahoo, Outlook-via-IMAP, custom domains; app-specific passwords, envelope-only). Microsoft OAuth/Graph was built then REMOVED same day (Azure account unavailable — decision: no Microsoft dependencies). Original plan reference: (a) ~~Outlook/Microsoft 365~~ via
   Microsoft Graph (proper OAuth, revocable scopes, REST — architecturally a sibling
   of the Gmail integration: provider row on connected_accounts + an outlook-sync
   function emitting the same interaction rows); then (b) **iCloud Mail** via IMAP —
   Apple has no mail API or OAuth, so this means app-specific passwords
   (appleid.apple.com), a Deno IMAP client fetching envelope headers only, and a
   heavier privacy disclosure (the password grants full mailbox access; headers-only
   becomes our promise rather than a provider-enforced scope). Multi-inbox already
   covers iCloud users' secondary Gmail/work accounts in the meantime.
9. **Relationship memory** — DESIGNED July 13, plan at `~/.claude/plans/relationship-memory.md`.
   Per-contact memory (facts / open threads / life events) built ONLY from user-typed
   or user-approved text (draft anchors, sent drafts, capture context, commitments,
   living-card changes) — never email content. Haiku extraction with reinforcement +
   expiry into a server-owned `contact_memory` table (outside whole-graph sync);
   injected into draft prompts, nudge context lines, and a "What you know" contact
   section; Phase 2 mints "ask how it went" hooks. Phase 0 (no AI) persists the
   currently-ephemeral draft anchor onto interactions. Includes a new onboarding
   explainer step ("It remembers, so you don't have to"). Ports Cosmiquee's
   reading-memory/tarot-memory patterns. PLUS-ONLY (Yan, July 13): memory is the
   headline why-you-pay feature — paywall/site/store-listing copy leads with it,
   shipping WITH Phase 1 (never before; honesty guardrail). Free users' typed
   notes persist but stay undistilled; upgrading unlocks memory retroactively.
   Build after the release-audit checklist.
10. **CRM integrations (Salesforce, HubSpot, Pipedrive)** — needs discussion + design
   before any build. Two pieces: (a) push CYM contacts into the connected CRM;
   (b) for contacts flagged "in CRM", also push email/text interactions into the
   CRM contact's activity record. Open questions for the design session: which
   direction wins on conflicts (CRM vs CYM), per-contact vs per-category flagging,
   OAuth app review requirements per vendor (AppExchange / HubSpot marketplace /
   Pipedrive marketplace), whether interaction push is metadata-only (matches our
   Gmail privacy story: timestamps + participants, never bodies), and tier gating
   (this is a professional-audience feature — likely Plus or a higher business tier).

## 6. Changelog

- **2026-07-02** — App rebrand to the brand system: Fraunces 900 + Karla (replacing
  Playfair/DM Sans), full token remap in theme.ts (cream/butter/cherry/espresso +
  brand-derived health ramp), 2px espresso borders and hard offset shadows everywhere
  (RN 0.85 `boxShadow`), butter tab bar, kicker pills, deterministic brand-color
  avatars, cherry-shadowed QR card and paywall price card, dial mark in onboarding and
  empty states. New app icon / Android adaptive+monochrome / splash (butter + mark) /
  favicon generated from brand art via `scripts/generate-brand-assets.mjs` (sharp).
  Verified: 0 old hexes in the bundle, 27 tests, iOS+web exports, all screens
  screenshotted, deployed to app.getcym.app.
- **2026-07-02** — Marketing site update 01 (professional positioning pass): hero sub now
  names the dual audience ("the client, the cofounder, the college roommate, and yes,
  your mom"); new ninth section `#work` ("Cold tools track relationships. Warm ones keep
  them.") between the nudge demo and pricing — relationship *enhancer*, not relationship
  *intelligence*; never split the site by personal/professional audience.
- **2026-07-02** — Marketing website + domain split: getcym.app now serves the static
  marketing site (reference design: Fraunces/Karla, cream/butter/cherry/espresso brand
  system); the web app moved to app.getcym.app (login-only — accounts are created in the
  mobile apps; `/login` route added); share links `/c/<token>` now serve a lightweight
  static page (~17 KB vs the ~3 MB RN bundle) with the same exchange flow and a
  get-the-app growth loop; getcym.com 301s to getcym.app. Lighthouse mobile 93/96/100
  (perf/a11y/SEO). Paywall price aligned to $99/yr. Store badge URLs are placeholders
  until the App Store / Play listings exist.
- **2026-07-02** — QR landing page + reciprocal exchange (free) and Personas UI (paid):
  per-persona share tokens (`share_tokens`) + exchange inbox (`exchange_submissions`),
  public `share-card` edge function, `/c/[token]` landing page (card view, vCard
  download, share-back form), card tab QR upgraded to a token URL with rotate,
  Cloudflare Worker hosting on getcym.app with per-token OG tags. Personas: switcher,
  manage screen, per-persona scoping across Today/People/Health/Card, persona card
  overrides (role/company/tagline), Pro gate on 2nd persona. Migration 0004.
- **2026-07-02** — Gmail sync fixed + fully provisioned: the `gmail.metadata` scope
  rejects the `q` search param, so every sync silently wrote 0 interactions; rewrote
  message listing to paginate newest-first with an internalDate cutoff, and surfaced
  per-account errors in the response. Nightly crons scheduled (gmail-sync 07:00 UTC,
  daily-nudges 08:00 UTC) with the service key in Vault. EAS project linked +
  `eas.json` dev profile added (device build still pending).
- **2026-06-14** — Two-way contacts sync (mobile): device contacts import (deduped) +
  app contacts export to the device address book (the OS then syncs to Google/iCloud/
  Microsoft). Device↔app link map is device-local in AsyncStorage, never synced to the
  cloud (device-contact ids differ per phone). Replaced the one-way import with a "Sync
  contacts" action on People; onboarding still does import-only.
- **2026-06-14** — Scheduled sync + push notifications (code complete, needs provisioning):
  `push_tokens` table + `profiles.locale`, device token registration (`src/lib/push.ts`),
  `daily-nudges` edge function (localized push for today's birthdays + due commitments,
  hook-driven only), nightly cron chaining gmail-sync → daily-nudges. Locale mirrored to
  the profile so push is in the user's language. Guide: `supabase/PUSH.md`.
- **2026-06-14** — Positioning locked: mobile-first tool with a desktop/cloud backend.
  Email sync and contacts sync are **mobile-only** (web shows an "available in the mobile
  app" note); per-provider web contacts APIs dropped. Mobile contacts sync (device address
  book, two-way) covers Google/Apple/Microsoft via the OS — planned next.
- **2026-06-13** — Gmail sync (code complete, needs provisioning): three Supabase Edge
  Functions (OAuth start/callback + metadata sync), locked-down `gmail_credentials` table,
  "Connect Gmail / Sync now / Disconnect" in settings, `pullNow()` to refresh after sync.
  Sync reads metadata only and matches participants to contacts by email. Push layer now
  leaves server-owned data (connected accounts + email-sync interactions) untouched.
  Provisioning guide: `supabase/GMAIL.md`.
- **2026-06-13** — Supabase backend scaffold: per-user RLS schema + migration, env-guarded
  client, email auth (context + screen), whole-graph pull/push sync layer, "Account & sync"
  in settings, `.env.example`, and `supabase/README.md` provisioning guide. Entirely dormant
  until env vars are set; verified the app still runs identically local-first without them.
- **2026-06-13** — Phase 1 real-MVP pass: local notifications + daily scheduling;
  contact edit/delete + add-context-later; real onboarding (stopped auto-seeding) +
  empty states; settings & privacy screen with data export/reset; nudge-engine and
  date unit tests; multilingual (English + Spanish) via a new i18n layer with an in-app
  language switcher; drafts now generated in the user's language. Disabled the React
  Compiler (it broke live language switching).
- **2026-06-13** — Fixed startup crash: replaced the Anthropic Node SDK with a `fetch`
  call (the SDK imported `node:fs`); made the web layout a centered column.
- **2026-06-10** — Initial MVP: capture + context, nudge engine, drafts, aging
  dashboard, QR card, address-book import, paywall stub, seeded demo data.
