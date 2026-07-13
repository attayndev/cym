# 04 — Third-Party SDK & Dependency Inventory

## Client SDKs (ship in the app bundle)

| Package | Version | Purpose | Data access | Privacy-manifest note (iOS) |
|---|---|---|---|---|
| `@supabase/supabase-js` | ^2.108.1 | auth + DB | tokens, graph | pure JS |
| `@react-native-async-storage/async-storage` | 2.2.0 | local store | graph, session | uses UserDefaults → **required-reason API `CA92.1`**; ships own privacy manifest ≥1.21 (verify in archive) |
| `react-native-purchases` | ^10.4.1 | RevenueCat billing | purchase state, RC anon id | ships own manifest; verify |
| `expo-contacts` | ~56.0.8 | address book | contacts (read/write) | contacts permission |
| `expo-image-picker` | ~56.0.20 | card photo | camera | camera permission |
| `expo-notifications` | ~56.0.17 | push/local | push token | — |
| `expo-apple-authentication` | ~56.0.4 | Sign in with Apple | Apple id token | — |
| `expo-auth-session`, `expo-web-browser`, `expo-linking` | ~56 | OAuth / deep links | — | — |
| `expo-localization`, `expo-updates`, `expo-image`, `expo-clipboard`, `expo-device`, `expo-symbols`, `expo-glass-effect`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-font` | ~56 | platform | `expo-device` → device model; `expo-updates` → OTA | `expo-device`/`expo-updates` are required-reason API users; Expo modules ship manifests |
| `react-native-qrcode-svg`, `react-native-svg` | 6.x / 15.x | QR render | — | — |
| `react-native-reanimated`, `-gesture-handler`, `-screens`, `-safe-area-context`, `-worklets` | ~56/RN | UI | — | — |
| `@expo-google-fonts/*`, `@expo/vector-icons`, `@expo/ui` | — | UI | — | — |

**No analytics, attribution, crash-reporting, or advertising SDK is present.** No IDFA/GAID access. → **No App Tracking Transparency prompt required**, and iOS "Tracking" / Google "Data shared for advertising" answers are all **No**.

## Server-side (Deno edge functions — not shipped to client)

`npm:@supabase/supabase-js`, `npm:@anthropic-ai/sdk`, `npm:node-forge` (Apple pass PKCS#7 signing), `npm:fflate` (.pkpass zip). Supply-chain surface limited to server; `node-forge`/`fflate` handle Wallet pass generation only.

## Secrets posture

- **Client bundle contains only `EXPO_PUBLIC_*` keys**: Supabase URL + anon/publishable key, drafts endpoint URL, share base URL, RevenueCat iOS/Android **public SDK keys**. All are designed to be public and are RLS/entitlement-gated. Verified by scanning the compiled `dist/` bundle: **no service-role key, no Anthropic key, no Hunter/Google secret** present (`02` build evidence).
- **All true secrets live in Supabase function env**: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `HUNTER_API_KEY`, `NINJAPEAR_API_KEY`, `GOOGLE_CLIENT_SECRET`, `REVENUECAT_WEBHOOK_SECRET`, `CRON_SECRET`, `OAUTH_STATE_SECRET` (new), Wallet signing keys.
- **google-services.json** ships a Firebase/FCM Android API key (expected public) — see `05` F-11: apply Google Cloud key restrictions.
