# 11 — App Review Notes (Reviewer Package)

> Placeholders in ANGLE BRACKETS must be filled by the product owner before submission. Do not include production admin credentials.

## What Call Your Mom is
Call Your Mom is a personal relationship-memory app. It helps you stay in touch with the people already in your life: it imports your contacts, learns each relationship's natural rhythm, and nudges you before someone goes cold — with optional AI-drafted messages, business-card scanning, and a shareable digital contact card.

## Core features to test
1. Onboarding + account creation
2. Contact import (address-book permission)
3. Relationship health / warm–cold status
4. Logging an interaction ("touchpoint") and seeing the score update
5. Reminders/nudges (birthday, reconnect)
6. QR/business-card exchange and card scanning
7. AI message drafts
8. Subscription (Plus) purchase + restore
9. Account deletion

## Reviewer login steps
1. Launch the app → **Sign in** on the onboarding account step.
2. Use the demo account: **email** `<DEMO_EMAIL>` / **password** `<DEMO_PASSWORD>` (no 2FA).
3. The account is pre-seeded with representative contacts, interactions, and nudges so every screen has content.
   - If empty, go **Settings → Data → Load sample data** to populate demo relationships instantly.

## Steps to test contact import
1. Onboarding → allow **Contacts** when prompted (purpose string explains why).
2. The People tab fills with imported contacts; denying permission is non-fatal (you can still add people manually and grant later from system Settings).
3. (iOS) test **Limited** contact access — the app handles a partial selection.

## Steps to test QR exchange
1. **Card** tab → your persona card shows a QR. Tap **share** / open the card link.
2. On a second device or browser, open the link (`getcym.app/c/<token>`) → the card renders; submit the reciprocal form.
3. Back in the app, **People → Exchange inbox** shows the pending submission to accept.
4. Invalid/expired token → the page shows a not-found state (no crash).

## Steps to test interaction tracking & scoring
1. Open any contact → **Log a touchpoint** (text/call/in-person).
2. The health badge moves toward **warm** and the last-contact date updates immediately.
3. Reopen the app → the interaction and score persist (they are never overwritten by sync).

## Steps to test reminders/notifications
1. Onboarding → enable notifications (or Settings → Notifications).
2. A contact with an upcoming birthday appears as a nudge on **Today**; tapping it opens the draft composer.
3. (Device) daily digest arrives at the configured local hour.

## Sensitive permissions — why each is used
- **Contacts (read):** to import and remember the people already in your life.
- **Contacts (write):** two-way sync writes your cym contacts and directory updates back to the device address book (additive; nothing is deleted).
- **Camera:** to scan business cards / conference badges into a new contact.
- **Notifications:** to deliver reminders and reconnect nudges.
No location, microphone, SMS, call-log, or tracking permissions are used. No advertising or analytics SDKs.

## Contact syncing & enrichment (for the privacy reviewer)
- Contact data syncs to the user's own backend (Supabase), isolated per-account by row-level security.
- Optional Gmail/IMAP connection reads **email metadata only** (sender/recipient/date headers — never message bodies) to improve "last contacted" accuracy.
- Optional enrichment (Plus) sends **only a contact's email address** to Hunter/NinjaPear to fill company/title.
- Card scanning and contact classification send data to Anthropic for processing; results are not retained by the provider on our behalf.

## Account deletion instructions
In-app: **Settings → Data → Delete account** → confirm. This permanently deletes the account and all associated data (contacts, interactions, notes, email credentials, push tokens) via database cascade. Web request: `<ACCOUNT_DELETION_URL>` (to be published — F-18).

## Known sandbox limitations
- Subscriptions run in **store sandbox/TestFlight**; purchases don't charge real money.
- AI features and enrichment require network; offline falls back to templates/cached state.

## Contacts
- **Support:** `<SUPPORT_EMAIL — e.g. support@getcym.app>`
- **Privacy policy:** `https://getcym.app/privacy`
- **Account deletion URL:** `<ACCOUNT_DELETION_URL>`

---

## Submission checklist (Apple + Google)

| Item | iOS | Android |
|---|---|---|
| App icons | ✅ 1024² | ✅ adaptive |
| Screenshots (match production) | ⚠️ | ⚠️ |
| Store copy / description | ⚠️ (reconcile F-20) | ⚠️ |
| Keywords / category | ⚠️ | ⚠️ |
| Content rating | ⚠️ | ⚠️ IARC |
| Privacy policy URL | ✅ | ✅ |
| Support URL/email | ✅ | ✅ |
| App Privacy / Data Safety | ⚠️ from `10` | ⚠️ from `10` |
| Demo credentials | ⚠️ fill above | ⚠️ fill above |
| Review notes | ✅ this doc | ✅ this doc |
| Version / build | 0.1.0 / auto | 0.1.0 / auto |
| Signing | ⚠️ dist cert | ⚠️ Play App Signing |
| Release notes | ⚠️ | ⚠️ |
| Export compliance / encryption | ✅ non-exempt=false | ✅ |
| Subscription metadata | ⚠️ match paywall | ⚠️ |
| Account deletion URL | ⚠️ F-18 | ⚠️ F-18 (required) |
| TestFlight / internal testing results | ⚠️ | ⚠️ pre-launch report |
| Privacy manifest / required-reason APIs | ⚠️ F-26 verify | N/A |
