# Platform Access Audit — Apple & Google

Every surface where Call Your Mom touches Apple or Google infrastructure, and its
configuration state. Legend: ✅ verified by command · 👀 needs a human to confirm in a
dashboard · ⬜ not done yet. Re-verify the ✅ items with the commands shown.

_Last audited: 2026-07-04_

## 1. Gmail email sync (Google Cloud project #1 — stays in Testing until CASA)

| Item | Status | How verified / what to check |
|---|---|---|
| OAuth client (Web application) exists, secrets set in edge functions | ✅ | `supabase secrets list` shows GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GMAIL_REDIRECT_URL (set 2026-06-14) |
| Functions deployed (gmail-auth-start / oauth-callback / sync) | ✅ | `supabase functions list` — all ACTIVE |
| Scope is metadata-only | ✅ | `grep -rho "gmail\.[a-z]*" supabase/functions/` → `gmail.metadata` only; never message bodies |
| Redirect URI byte-match (Google client ↔ GMAIL_REDIRECT_URL) | 👀 | Google Console → Credentials → the client's redirect URI must be exactly `https://jvuvuukvgunhpemrhqxl.supabase.co/functions/v1/gmail-oauth-callback` |
| Consent screen: Testing mode, test users listed | 👀 | Google Console → OAuth consent screen. Keep in **Testing** until CASA. Testing = refresh tokens can expire after 7 days (observed surviving longer, not guaranteed) |
| End-to-end sync verified | ✅ | Live-tested 2026-07-02 (list-without-q fix); errors now surface in the function response |
| Nightly cron | ✅ | `select * from cron.job` → gmail-nightly 07:00 UTC, active |
| **CASA security review** (restricted-scope verification) | ⬜ | Required before the consent screen can go to Production → before public launch. THE long-pole external dependency |

## 2. Sign-in providers (Apple + Google login)

| Item | Status | How verified / what to check |
|---|---|---|
| App code (native Apple id-token, browser OAuth Google, web parity) | ✅ | Shipped 2026-07-02; `npx tsc --noEmit` + exports clean |
| `usesAppleSignIn` + expo-apple-authentication plugin in app.json | ✅ | `grep usesAppleSignIn app.json` |
| Profile-name trigger handles OAuth metadata | ✅ | Migration 0005 applied (`supabase migration list`) |
| Google Cloud project #2 ("CYM Sign-In"), consent **published to Production**, non-sensitive scopes only | ✅ (2026-07-04) | Created + published by user; gmail scopes deliberately absent |
| Google Web-application OAuth client, redirect `https://jvuvuukvgunhpemrhqxl.supabase.co/auth/v1/callback` | ✅ | Client 988781153038-…; authorize endpoint 302s to accounts.google.com (verified by curl) |
| Apple App ID `app.getcym.cym` with Sign In with Apple capability | ✅ (2026-07-04) | Registered before first EAS build, as required |
| Apple Services ID `app.getcym.cym.web` (domain `jvuvuukvgunhpemrhqxl.supabase.co`, return URL `…/auth/v1/callback`) | ✅ | authorize endpoint 302s to appleid.apple.com with this client id (verified by curl) |
| Apple SIWA key (.p8, Key ID 5PJ39Q8D9C, Team 6W5G6FZQSX) | ✅ | .p8 kept OUTSIDE the repo (user's Downloads — move somewhere durable, e.g. a password manager; needed again at rotation) |
| Supabase: providers enabled, site_url, uri_allow_list | ✅ | `external_google_enabled:true`, `external_apple_enabled:true`, site_url app.getcym.app, allow-list app.getcym.app/** + callyourmom://** + localhost dev |
| **Apple client-secret expiry: 2027-01-02** | ⚠️ | Regenerate the ES256 JWT + PATCH `external_apple_secret` BEFORE this date or web Apple login breaks (native id-token unaffected). ~2-minute task; needs the .p8 + Key ID + Team ID above |

## 3. Contacts access (device address book)

| Item | Status | How verified |
|---|---|---|
| iOS `NSContactsUsageDescription` | ✅ | app.json `ios.infoPlist` |
| expo-contacts plugin permission string | ✅ | app.json plugins |
| Android `READ_CONTACTS` + `WRITE_CONTACTS` | ✅ | app.json `android.permissions` |
| Two-way sync implementation, mobile-only gating | ✅ | `src/lib/contacts.ts`; web shows mobile-only notes |
| Runtime permission flow on a real device | ⬜ | Confirm on the dev build (first Sync contacts tap) |

Note: "Google contacts" and "Apple/iCloud contacts" are both covered via the OS-merged
device address book — no Google People API, no CardDAV, no extra OAuth.

## 4. Push notifications

| Item | Status | How verified |
|---|---|---|
| push_tokens table + registration code + daily-nudges function + 08:00 UTC cron | ✅ | migration 0003, `supabase functions list`, cron.job |
| EAS project linked | ✅ | app.json `extra.eas.projectId` |
| APNs key (iOS push) | ⬜ | Created automatically during the first `eas build` credentials flow |
| FCM (Android push) | ⬜ | Needs a Firebase project + FCM V1 service-account key uploaded to EAS — separate task when Android matters |
| Physical-device end-to-end test | ⬜ | After the dev build: sign in, enable notifications, then trigger daily-nudges |

## 5. Store prerequisites

| Item | Status | Notes |
|---|---|---|
| Apple Developer Program + Google Play Console enrollment | ✅ (user-confirmed) | |
| Bundle id / package `app.getcym.cym` | ✅ | Locks permanently at first store submission |
| App icon 1024 + adaptive/monochrome + splash | ✅ | `scripts/generate-brand-assets.mjs` |
| Sign in with Apple offered alongside Google | ✅ (code) | App Store guideline 4.8 |
| **Privacy Policy URL** | ⬜ | Required by BOTH stores; site footer still links `#` |
| Terms of Service page | ⬜ | Site footer links `#` |
| Store badge URLs on getcym.app | ⬜ | Placeholder bare store roots until listings exist |
| CASA (for public Gmail sync) | ⬜ | See §1 |
