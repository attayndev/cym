# Call Your Mom — Product Brief (MVP)

*A personal relationship manager that keeps the relationships you care about from going cold.*

**Version:** 0.1 (MVP build brief)
**Prepared for:** MVP build
**Last updated:** June 2026

---

## 1. One-liner

Call Your Mom captures the people you meet *with the context of why they matter*, then tells you the right moment and the right move to reconnect — before the relationship quietly dies.

## 2. The problem

Relationships decay silently. You meet someone great at a conference, exchange details, fully intend to follow up — and a year later you've never spoken again. The cost is invisible but enormous: the job that never came from a warm intro, the friendship that faded, the mentor who drifted.

Existing tools fail at one of two halves:

- **Digital business card apps (HiHello, Popl, Blinq)** nail the *moment of exchange* but do nothing afterward. They capture the card and forget the relationship.
- **Personal CRMs (Dex, Clay, Monica)** track relationships but surface decay as a flat "overdue" list — a guilt-driven chore that people stop opening. Their reminders fire on fixed intervals with no reason attached.

Nobody owns both halves well: best-in-class capture *and* a retention engine that feels like a thoughtful friend rather than a nagging spreadsheet.

## 3. Product thesis (the wedge)

The exchange is the cheap part. **Maintenance is the hard part, and it's where the value is.** Call Your Mom bridges the two markets:

1. **Capture with context** — at the moment of meeting, capture not just contact details but *where you met, what you discussed, why they matter, and what you committed to.* This context is load-bearing; it's the fuel for everything downstream.
2. **Occasion-aware nudges** — don't just say "you're overdue with Joe." Wait for a *reason* (his birthday, a job change, you're both in town) and hand the user the *exact move* ("wish him happy birthday and grab coffee"), with the message half-drafted.

A nudge with a hook is a gift. A nudge without one is nagging. The product's core craft is in only surfacing the former.

## 4. Target user

The relationship-rich, time-poor professional: founders, salespeople, recruiters, investors, consultants, and well-networked individuals who meet a lot of people, genuinely care about staying connected, and currently fail at it. They already understand the cost of a dead relationship — they've felt it. Secondary: anyone who wants to be more intentional about family and close friends (the literal "call your mom" use case).

## 5. Competitive positioning

| | Owns the exchange | Owns retention |
|---|---|---|
| HiHello / Popl / Blinq | ✅ | ❌ |
| Dex / Clay / Monica | ⚠️ weak capture | ✅ but guilt-list |
| **Call Your Mom** | ✅ capture + context | ✅ occasion-aware |

**Entry wedge:** beat HiHello on the half they ignore (retention). HiHello has the strongest distribution and the weakest retention story in the category — easy contrast to draw.

**Longer game:** beat Dex/Clay on retention *quality* — occasion-aware, context-driven nudges instead of fixed-interval overdue lists.

**Defensible position:** be the only product that's excellent at *both* the in-person capture moment and the ongoing intelligence layer.

## 6. Core features

### 6.1 Contact Capture — **FREE**
Capture a new contact via QR exchange, scan, or manual entry, immediately followed by the **context prompts**:
- Where did you meet?
- What did you discuss?
- Why do they matter?
- What did you commit to (follow-up)?
Plus category (Family / Friend / Professional / etc.), importance, and a suggested contact cadence. Context captured at the moment is the core differentiator — never retrofitted later.

### 6.2 Contact Sync — **FREE**
Two-way sync with the device's native address book. Frictionless and reliable; this is table stakes and stays free as a goodwill + acquisition lever.

### 6.3 Occasion-Aware Nudge Engine — **PAID** *(the heart of the product)*
Combines three ingredients to produce a nudge:
1. **Decay signal** — time since last meaningful contact, scored against the contact's cadence.
2. **Hook / occasion** — birthday, work anniversary, job change, same-city proximity, a captured follow-up commitment coming due, or "it's been exactly N months."
3. **Suggested action** — a concrete, relationship-appropriate next move, with an AI-drafted message ready to send.

Design rule: **lead with hook-driven nudges; surface bare time-decay nudges sparingly** (batched/quiet) so the app never becomes the obligation machine it's replacing.

### 6.4 Email Sync (multiple accounts) — **PAID**
Connect one or more inboxes (Gmail, Outlook) to automatically detect interactions and keep "last contact" accurate without manual logging. **Multi-account is a genuine gap** — people keep separate work / personal / side-project inboxes, and competitors lean single-account. This is the engine that makes the nudge timing trustworthy. (Hardest technical lift; largest privacy surface.)

### 6.5 LinkedIn Sync — **POST-MVP** *(not in scope; see §11 and §13)*
Deliberately excluded from the MVP. The highest-value hook here (job changes → "congratulate them") is also the hardest to obtain — LinkedIn's API does not expose connections data and prohibits scraping — so it carries integration risk disproportionate to its value for proving the core loop. When revisited, the likely path is a third-party LinkedIn-data provider rather than the official API. Risk profile documented in §13.

### 6.6 AI Follow-Up Drafts — **PAID**
Generates a personalized outreach message from the captured context and the nudge's hook, editable, with channel toggle (email / text). Already prototyped; wires directly into the nudge engine.

### 6.7 Personas — **PAID**
Not just "multiple cards." Each persona (e.g. Founder / Day-job / Personal) is a **scoped relationship graph** with its own contacts, cadences, sharing card, and nudge rules. This ties a proven monetization lever (HiHello gates multiple cards) back to the product's core. Includes the sharing flow: editable profile card → QR with token URL → Apple/Google Wallet pass → recipient landing page with reciprocal exchange.

> **Sharing flow note:** basic single-card sharing is **FREE** (it's part of the capture/exchange moment). Multiple personas and Wallet-pass variants are **PAID**.

## 7. Free vs Paid

| Tier | Includes | Price |
|---|---|---|
| **Free** | Contact capture (with context prompts), contact sync, single sharing card + QR | $0 |
| **Paid** | Nudge engine, multi-account email sync, AI drafts, personas, aging dashboard, analytics | **$100 / year** |

**The flywheel:** free capture + sync exists to get contacts *and their context* into the system. The more a user captures for free, the more valuable the paid intelligence layer becomes — so the free tier is simultaneously the top of the funnel and the data moat. We never paywall table stakes; we paywall intelligence.

## 8. Pricing & monetization rationale

**$100/year, no advertising.**

- **Why premium ($100 > HiHello's ~$72):** you're not paying for a business card — that's a commodity worth a few dollars. You're paying for an always-on relationship intelligence layer that *remembers so you don't have to* and tells you the moment and the move. The free tier is a complete digital-card replacement on its own; paying is strictly for the intelligence.
- **ROI framing:** one rekindled relationship — a warm intro that lands a job, a reconnected client, a re-engaged mentor — dwarfs $100. People pay that much to organize photos or workouts; relationships are the highest-leverage, most-neglected asset most people have.
- **Why no ads:** the product's entire job is to act in the user's interest — nudging them toward real human connection. An advertiser-funded model would corrupt that: you cannot be a trusted advisor whose attention is for sale. Alignment with the user *is* the pitch, and it's what justifies a direct-paid price.

## 9. MVP scope

**In (v1):**
- Contact capture with context prompts (free)
- Native contacts two-way sync (free)
- Single sharing card + QR + recipient landing page (free)
- Occasion-aware nudge engine — birthdays + time-decay + captured-commitment hooks (paid)
- AI follow-up drafts (paid)
- Single-account email sync, Gmail first (paid)
- Aging dashboard (health buckets) as the nudge engine's backstop view (paid)
- Paywall + subscription ($100/yr)

**Fast-follow (v1.x):**
- Multi-account email sync; Outlook
- Personas (scoped graphs + Wallet passes)
- Same-city / proximity hooks

**Later:**
- LinkedIn integration via a third-party data provider, incl. job-change hook detection
- Team / shared graphs

## 10. Data model (key entities)

- **User** — auth, subscription status, settings.
- **Persona** — belongs to User; name, sharing card, default cadence rules. (MVP: one default persona.)
- **Contact** — belongs to Persona; identity fields, category, importance, cadence, source.
- **Context** — the four capture prompts + tags; attached to Contact at creation.
- **Interaction** — type (call/text/email/coffee/meeting), timestamp, note, source (manual / email-sync). Drives decay scoring.
- **Hook** — type (birthday / anniversary / commitment-due / proximity / job-change), trigger date, linked Contact.
- **Nudge** — generated from decay + Hook; suggested action, draft message, state (pending / acted / dismissed / snoozed).
- **ConnectedAccount** — email/LinkedIn OAuth tokens, scopes, sync state (multi-account ready from the schema up).

## 11. Technical architecture & integrations

- **Client:** React Native (single codebase, iOS-first given the target user). Reuse the existing JSX prototype's design system (cream background, dark card accents, Playfair Display / DM Sans).
- **Backend:** API + database for contacts, interactions, nudges; a scheduled job that recomputes decay scores and fires hooks daily.
- **Email sync:** Gmail API / Microsoft Graph via OAuth. Store tokens per `ConnectedAccount` (multi-account from day one). Sync metadata only (timestamps, participants) — **not** message bodies — to minimize privacy surface; surface this to users explicitly.
- **LinkedIn:** out of MVP scope. When revisited, integrate via a third-party LinkedIn-data provider rather than the official API (which doesn't expose connections) — see §13 for the risk profile to evaluate before committing.
- **AI drafts:** Anthropic API (Claude) generating from captured context + hook.
- **Privacy posture:** relationship data is sensitive. Minimize what's stored, be explicit about scopes, never resell data, and make "no ads" a stated, durable commitment. This posture is also the marketing.

## 12. Success metrics

- **Activation:** % of new users who capture ≥3 contacts *with context* in week 1.
- **Core value moment:** % of users who act on a nudge (send the suggested message) within their first 2 weeks.
- **Retention:** weekly active nudge engagement (the real product, not vanity DAU).
- **Conversion:** free → paid rate, and which feature triggers upgrade (instrument this — likely the first hook-driven nudge).
- **Relationship health:** net change in "cooling/at-risk" contacts moved back to "warm" per user over time — the outcome the product exists to produce.

## 13. Risks & open questions

- **Email sync is the make-or-break and the hardest build.** Without it, decay scoring relies on manual logging, which decays itself. Prioritize getting Gmail right.
- **LinkedIn (post-MVP) carries inherited risk.** Third-party LinkedIn-data services are the likely integration path, but they scrape against LinkedIn's terms — the risk doesn't disappear by outsourcing it, it shifts to a vendor. Diligence before committing: does the provider operate on its own infrastructure or piggyback on *your users'* LinkedIn sessions (the latter can get users' accounts restricted)? What's the data freshness and uptime when LinkedIn changes its markup? Is there contractual indemnification, or does liability land on us? Treat it as a vendor-risk decision, not just an API integration.
- **Nudge quality is existential.** A few bad/nagging nudges and users mute notifications forever. The hook hierarchy and a tight quality bar matter more than feature breadth.
- **$100/yr is a premium ask.** The free tier must feel genuinely useful (not crippled) *and* the first paid nudge must clearly earn the price. The upgrade moment needs to be designed, not incidental.
- **Open:** Does the aging *dashboard* (health buckets) stay paid, or become a free teaser that motivates upgrade? Worth A/B-ing.
- **Open:** Persona model in MVP — ship single-persona and add the scoped-graph model later, or build the multi-persona schema up front to avoid migration pain? (Recommendation: schema supports it from day one; UI ships single-persona.)
