# RevenueCat setup

The app code is fully wired: `src/lib/purchases.ts` (env-guarded SDK wrapper),
paywall purchase/restore flows, entitlement → `profile.isPro` sync in
app-context, and the `revenuecat-webhook` edge function (keeps
`profiles.is_pro` honest for renewals/expirations that happen while the app is
closed). Everything below is dashboard provisioning.

The single entitlement id is **`plus`**. App user ids are Supabase auth user
ids (set at `Purchases.configure`), which is how the webhook maps events to
`profiles` rows.

## 1. RevenueCat dashboard (app.revenuecat.com)

1. Create a project (e.g. "Call Your Mom").
2. Add an **App Store** app — bundle id `app.getcym.cym`. Copy the **public
   API key** (`appl_…`).
3. Add a **Play Store** app — package `app.getcym.cym`. Copy its key
   (`goog_…`). (Play billing can't be tested until an Android build is
   uploaded to a Play track — fine to defer.)
4. **Entitlements** → new entitlement with identifier `plus`.
5. **Offerings** → the `default` offering gets one package (Annual) once the
   store products below exist; attach the products to the `plus` entitlement.

## 2. App Store Connect

1. Sign the **Paid Applications agreement** (Business section) — nothing works
   without it.
2. Create the app record for `app.getcym.cym` if it doesn't exist yet
   (creating the record is not a release).
3. Features → In-App Purchases → create **two auto-renewable subscriptions in
   one subscription group** ("Plus"):
   - `cym_plus_monthly` — 1 month, $15.00 (pick the nearest price point if
     $15.00 isn't offered);
   - `cym_plus_yearly` — 1 year, $120.00.
   On EACH product add an **Introductory Offer → Free trial → 1 week** (the
   7-day trial lives store-side; the app inherits it automatically). Add
   localized display names + descriptions.
4. In RevenueCat: attach both products to the `plus` entitlement; in the
   `default` offering create the **Monthly** and **Annual** packages (the app
   reads `offering.monthly` / `offering.annual`). Also upload the App Store
   Connect API key RevenueCat asks for so it can validate receipts.

## 3. Webhook (server → profiles.is_pro)

1. Generate a long random secret and set it on the function:
   `supabase secrets set REVENUECAT_WEBHOOK_SECRET=<secret>`
2. RevenueCat → Project settings → **Webhooks** → add
   `https://jvuvuukvgunhpemrhqxl.supabase.co/functions/v1/revenuecat-webhook`
   with the Authorization header value set to the same secret.
3. Send the dashboard's test event — expect 200 (unknown user ids are ignored
   with 200; bad secret is 401).

## 4. App env + rebuild (native module!)

1. `.env.local`:
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_…`
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_…`
   (Public SDK keys — safe to embed in bundles.)
2. Restart Metro with `-c` (env cache), then **rebuild both dev clients** —
   react-native-purchases is a native module; old binaries stay on the
   template/local-flip fallback until rebuilt:
   `eas build --profile development --platform ios` / `--platform android`.

## 5. Testing purchases

- iOS: create a **Sandbox tester** in App Store Connect (Users & Access →
  Sandbox) and sign into it on the device (Settings → App Store → Sandbox
  Account). Purchases in dev builds then run against the sandbox — no real
  charges. Sandbox renewals are accelerated (1 year ≈ 1 hour) which also
  exercises the webhook.
- Verify end to end: buy → paywall closes → Health tab unlocks (isPro) →
  `profiles.is_pro` true in Supabase; then let the sandbox sub expire →
  webhook flips it back.

## Notes / caveats

- Client entitlement stream is the runtime source of truth for `isPro`; the
  webhook maintains the server column. The whole-graph client push also writes
  `is_pro`, so a stale client could briefly overwrite a webhook update — the
  next entitlement refresh (app launch / RC listener) self-corrects. Revisit
  if server-side gating ever depends on `is_pro` being second-perfect.
- Web billing (Stripe) is a separate, later track; the web paywall keeps the
  local flip until then.
- Unconfigured builds (no env keys / Expo Go / web) silently keep the old
  local-flip behavior so development stays testable.
