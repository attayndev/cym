# 09 — Google Play Compliance

Reviewed against current **Google Play Developer Program Policies** and target-API requirements as of **2026-07-12**
(source: developer.android.com/google/play/requirements/target-sdk, Play Console Data Safety).

Legend: ✅ · ⚠️ human-confirm · ❌ · N/A.

## Build & platform
| Item | Status |
|---|---|
| Target API level | ✅ Expo SDK 56 targets **API 35 (Android 15)** — meets the current requirement. ⚠️ **Timeline:** new apps must target **API 36** from **2026-08-31**; if submitting after that date, bump to SDK that targets 36. |
| Min SDK | ⚠️ confirm Expo SDK 56 default min (API 24+) in merged manifest |
| Output | ✅ AAB via EAS (`eas build -p android --profile production`) |
| 64-bit | ✅ RN 0.85 / Expo produce arm64 + x86_64 |
| Package / version | `app.getcym.cym` ✅ / EAS remote `autoIncrement` ✅ |
| Signing | ⚠️ Play App Signing — confirm upload key + enrollment |
| Native debug symbols / mapping | ⚠️ upload from EAS build artifacts to Play for crash readability |
| Edge-to-edge (Android 15) | ⚠️ verify system-bar handling on API 35 (no clipped content) — 📋 device |
| Notification permission (API 33+) | ✅ requested at runtime via expo-notifications opt-in |
| Foreground services | ✅ none declared |

## Permissions (merged production manifest — ⚠️ confirm)
Declared in `app.json`: `READ_CONTACTS`, `WRITE_CONTACTS`. Plus plugin-injected: camera (image-picker), notifications (POST_NOTIFICATIONS), internet.

| Permission | Feature | Necessary? | Pre-prompt disclosure |
|---|---|---|---|
| READ_CONTACTS | import/sync the address book | ✅ core | ✅ onboarding + purpose string |
| WRITE_CONTACTS | write cym contacts + directory facts back to device | ✅ two-way sync | ✅ must state write-back before prompt (see below) |
| CAMERA | scan business cards/badges | ✅ scan feature | ✅ purpose string |
| POST_NOTIFICATIONS | reminders/nudges | ✅ | ✅ opt-in |

**Action (⚠️):** Play's contacts + write-back policy requires an in-app **prominent disclosure BEFORE the runtime permission prompt** stating that contact data is accessed, whether transmitted, whether stored, the feature it enables, and that the app **writes contacts back to the device**. The onboarding + purpose strings cover read/sync; confirm the write-back is explicitly disclosed in the pre-permission UI. No unused/high-risk permissions (no SMS, call log, location, accessibility, QUERY_ALL_PACKAGES, exact alarm) — good.

## Data Safety (draft → `10`)
Full field-by-field proposal in `10`. Key answers: collects Contacts, Personal info (name/email/phone), Photos (card scan, not stored), App activity (interactions); **shares** contact email with Hunter/NinjaPear enrichment (Plus) and card data with Anthropic (processing); **all encrypted in transit**; **deletion supported** in-app; **no data used for advertising/tracking** (no such SDKs).

## Account deletion (Play requires both in-app AND a web URL)
- ✅ In-app deletion path exists.
- ❌ / ⚠️ **No dedicated web account-deletion URL** (F-18). Play's Data Safety form asks for a web-accessible deletion request URL. **HUMAN:** add `getcym.app/delete-account` describing the in-app path + an email request route, and enter it in Play Console.
- ✅ Deletion revokes sessions (signOut) and removes push tokens + Gmail/IMAP creds via CASCADE.

## Store listing & reviewer access (⚠️ human)
- Category, content rating (IARC), target audience (13+), ads declaration (**No ads**), data declarations — complete in console.
- Privacy policy URL `getcym.app/privacy` ✅; support URL/email `support@getcym.app` ✅.
- Working demo account + contact-import test instructions (`11`).
- Screenshots must match production; store description must not promise unavailable features. Reconcile pricing (F-20).

## Pre-launch report
- ⚠️ Run Play **internal testing** + review the pre-launch report (crashes, accessibility, privacy) before production. The beta page already links a Play internal-test track.

## Verdict
Meets Play policy on code/permissions; **blockers to close before submit are console/content items**: web deletion URL (F-18), Data Safety form from `10`, write-back prominent disclosure confirmation, and (if post-Aug-31) API 36 target.
