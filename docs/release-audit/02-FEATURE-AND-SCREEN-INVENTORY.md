# 02 — Feature & Screen Inventory

Routes in `src/app/` (expo-router). Root: `I18nProvider → AuthProvider → AppProvider`. Gate (`(tabs)/_layout.tsx`): not onboarded → `/onboarding`; onboarded + backend configured + no session → `/auth`.

## Tabs (5)

| Tab | File | Key elements | Nav targets |
|---|---|---|---|
| Today | `(tabs)/index.tsx` | dateline, settings gear, GettingStarted checklist, hook+decay NudgeCards, free-tier locked-nudge teaser, MergeReview, UpdatesDeck, EvaluateDeck, capture button | `/settings`, `/paywall`, `/capture`, `/nudge/[id]` |
| Card | `(tabs)/card.tsx` | persona QR (share-link or vCard fallback), PersonaSwitcher, Apple/Google Wallet buttons, rotate token, inline card editor | wallet URL, personas |
| Scan | `(tabs)/scan.tsx` | camera scan CTA, tips, manual entry | `/capture` |
| Health | `(tabs)/dashboard.tsx` | 5 health buckets (new/warm/cooling/at-risk/cold) as filters, "bring back" list (cap 25 free / 100), ContactRows | `/contact/[id]` |
| People | `(tabs)/people.tsx` | A–Z SectionList + jump rail, search, ExchangeInbox, sweep banner, two-way sync row (native), add | `/capture`, `/sweep`, `/contact/[id]` |

## Modals & stack routes

| Route | Purpose |
|---|---|
| `/onboarding` | 4 steps: account (AuthPanel) → card fields + referral code → notifications → start; fires `attribution` on ref code |
| `/auth` | sign-in lock; auto-redirects on session |
| `/capture` | 3-step add wizard (identity+scan / context / classify); `canTrackMore` gate → paywall |
| `/paywall` | 6 feature rows, annual/monthly picker, RevenueCat purchase/restore |
| `/personas` | list/create/edit/delete personas; create gated behind Pro |
| `/settings` | profile, account/sync, email sync (Gmail+IMAP), language, notifications (Pro-gated), subscription, privacy links, data (sync / update device / export / sample / reset / **delete account**) |
| `/sweep` | bulk-archive business suspects; AI classify unclear (`classify-contacts`) |
| `/contact/[id]` | detail: health badge, reach-out composer (text/email/WhatsApp/Telegram/Signal deep links), promise-next-week, enrich (Hunter), update proposals, log touchpoint, context, history, remove |
| `/contact/edit/[id]` | edit fields, persona reassignment, cadence/importance/category |
| `/nudge/[id]` | draft composer: channel toggle, AI/template draft, regen, mark sent |
| `/c/[token]` | **public web** QR landing: sharer card, vCard download, reciprocal exchange → `share-card` |
| `/login` | redirect → `/auth` (marketing links) |

## Feature areas

- **Onboarding** — account-gated when backend configured; waits on cloud pull before new-vs-returning decision; referral attribution.
- **Auth** — email/password, Apple (native iOS via identity token; web OAuth; **unavailable Android**), Google (browser OAuth all platforms). Web is login-only.
- **Contact import / two-way sync** — `contacts.ts` + `sync.ts`: name-dedup import with tombstones, additive alt-email/phone, export new cym contacts to device, push directory facts (company/title overwrite; emails/phones additive). Whole-graph cloud mirror with version-token concurrency.
- **Personas / cards** — multiple personas (Pro); each persona owns its card fields (no profile inheritance). Active persona device-local.
- **QR exchange** — server-minted `share_tokens`; card/badge scan → `card-scan`; reciprocal submissions in `exchange_submissions` surfaced by ExchangeInbox.
- **Nudges / health** — engine builds birthday / commitment-due / reconnect-anniversary / role-change hooks + capped decay nudges; health warm→cold by decay ratio. Local morning digest + birthday reminders; push registration.
- **Email** — Gmail metadata OAuth + IMAP app passwords; `syncAllEmail` fans out; interactions written server-side (metadata only).
- **Enrichment** — Tier-0 header hints (additive), inbox suggestions, Hunter lookup (Plus) with identity guard + additive patch.
- **Drafts** — proxy endpoint (JWT, metered), dev-only direct Anthropic (now `__DEV__`-gated), or context-aware templates.
- **Billing** — RevenueCat entitlement `plus`; free caps `FREE_TRACK_LIMIT=10`, `FREE_DRAFTS_PER_MONTH=3`.
- **Account deletion** — `delete-account` edge fn → signOut → local reset.
- **Wallet passes** — Apple `.pkpass` / Google Wallet via `wallet-pass`.
- **i18n** — English (source) + Spanish; key parity confirmed (~213 keys each); `t()` falls back to English.

## Known gaps found & dispositioned (detail in `05`)

- Dead `syncGmailNow`/`disconnectGmail` in `gmail.ts` — **removed**.
- `ConnectedAccount.provider` type `'gmail'|'outlook'` vs code using `imap` — **fixed → `'gmail'|'imap'`**.
- Hardcoded personal email in seed profile + real-looking Gmail sample contact — **replaced with neutral samples**.
- GettingStarted "card" step reads profile fields though cards moved to personas — may never complete for persona-only cards (**open, Low** — see `05`).
- `runCardScan` `{kind:'canceled'}` outcome unhandled — benign no-op (**Informational**).
