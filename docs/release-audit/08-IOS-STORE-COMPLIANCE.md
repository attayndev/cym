# 08 — Apple App Store Compliance

Reviewed against the current **App Store Review Guidelines** and submission requirements as of **2026-07-12**
(sources: developer.apple.com/app-store/review/guidelines, App Privacy Details, "Offering account deletion in your app").

Legend: ✅ pass · ⚠️ needs human confirmation (build/console/credentials) · ❌ fail · N/A.

## 2.1 App completeness
- ✅ No placeholder screens, lorem ipsum, or dead buttons in source after the artifact sweep (`03` prototype pass, all fixed). One intentional pre-launch "Coming soon" is on the **marketing site**, not in the app.
- ⚠️ No-crash / all-features-work must be confirmed on a signed device build (📋 `13`). Reviewer must be able to reach every advertised feature — provide the demo account + steps in `11`.

## 5.1 Privacy
- ✅ Privacy policy accessible: in-app Settings → Privacy links to `getcym.app/privacy`; also on store listing.
- ✅ Policy accurately describes code/SDK behavior and names every subprocessor (`10`).
- ⚠️ **App Privacy answers** (App Store Connect) must be filled from `10`. Because there is **no analytics/ad/tracking SDK**, "Data used to track you" = **None** and no ATT prompt is required.
- ✅ **Account deletion in-app** exists (Settings → Data → Delete account → `delete-account` fn → CASCADE). Meets Guideline 5.1.1(v).
- ✅ Permission purpose strings are specific and benefit-oriented:
  - Contacts: "Call Your Mom uses your contacts to remember the people already in your life. Nothing on your phone changes unless you ask."
  - Camera (via expo-image-picker): "…scan business cards and conference badges so you can capture a contact in seconds."
- ✅ Permissions requested only in-context (contacts at import, camera at scan, notifications at onboarding/opt-in).
- ⚠️ **Privacy manifest (`PrivacyInfo.xcprivacy`)** — F-26. Not explicitly declared in `app.json`; relies on module-shipped manifests (AsyncStorage `CA92.1` UserDefaults reason, expo-device, expo-updates). **Must generate the Xcode Privacy Report from the archive and confirm required-reason API declarations match usage** before submit.

## 4.0 / 4.8 Authentication
- ✅ **Sign in with Apple is present** (`usesAppleSignIn: true`, native iOS flow). Required because Google (third-party social) login is offered — SiWA satisfies 4.8.
- ⚠️ First-time + returning SiWA must be verified on device (📋). Name captured on first authorization is persisted.
- ⚠️ Reviewer account: provide email/password demo creds (no 2FA) with representative seeded data (`11`).

## 3.1 Payments / IAP
- ✅ Subscriptions go through **RevenueCat → StoreKit** (`react-native-purchases`); no external purchase links or alternative payment language in-app.
- ✅ Restore purchases implemented (`restorePurchases`); expiration/renewal handled server-side by the webhook.
- ⚠️ **F-02 fixed** — production no longer grants Plus without a StoreKit transaction. Re-verify in a TestFlight sandbox purchase (📋).
- ⚠️ Ensure App Store Connect subscription products (monthly/annual, 7-day trial) and localized price strings match `paywall` copy. Reconcile the **pricing mismatch F-20** ($15/$120 vs $14.99/$119.99) so metadata/screenshots are accurate (3.1.2 / 2.3.1).

## Native configuration (verify in the archive — ⚠️)
| Item | Value / status |
|---|---|
| Bundle id | `app.getcym.cym` ✅ |
| Version / build | `0.1.0` / EAS remote `autoIncrement` ✅ (decide 1.0.0 launch — F-10) |
| Signing | EAS-managed ⚠️ confirm distribution cert/profile |
| `usesAppleSignIn` entitlement | ✅ |
| Push entitlement / background modes | expo-notifications ⚠️ confirm `aps-environment` + only needed background modes (remove unused) |
| Associated domains / universal links | **none** (F-30) — `/c/` links open the web page, not the app. Acceptable; add applinks if in-app open desired |
| URL scheme | `callyourmom://` ✅ |
| Export compliance | `ITSAppUsesNonExemptEncryption:false` ✅ |
| Orientation / device | portrait, iPhone (iPad support not declared — confirm intent) |
| App icon / splash | `icon.png` 1024² ✅, splash configured ✅ |
| Min iOS / SDK | Expo SDK 56 defaults ⚠️ confirm deployment target + built with current required Xcode |

## Archive validation (⚠️ human — cannot run in-session)
Build + validate the release archive with current Apple tooling:
```
eas build --platform ios --profile production
# then App Store Connect / Transporter validation, or:
eas submit --platform ios --profile production   # after ASC creds wired (F-25)
```
Generate the **Xcode Privacy Report** from the `.xcarchive` and diff against the App Privacy answers.

## Verdict
Code and configuration are **consistent with Apple's guidelines**; remaining items are build/console confirmations (privacy manifest, archive validation, sandbox purchase, reviewer creds), not code defects.
