# 14 — Remaining Risks

Stated plainly, not minimized.

## Security (open, non-blocking after F-01/F-02 fixes)
- **RevenueCat webhook auth (F-13, MEDIUM):** a shared-secret string compare, not a payload HMAC and not constant-time. Anyone who learns `REVENUECAT_WEBHOOK_SECRET` can flip any user's `is_pro`. Mitigation today: TLS + a strong secret. Recommend RevenueCat signed-payload verification.
- **IMAP passwords plaintext at rest (F-12, MEDIUM):** protected only by RLS + service-role isolation. A DB compromise exposes them. Recommend app-level/KMS encryption.
- **imap-sync outbound connections (F-14, LOW-MED):** authenticated users can make the function open TLS to an arbitrary host/port. Bounded to IMAP but is an egress surface; recommend a host allowlist.
- **Error-detail leakage (F-16, LOW):** a few endpoints echo internal error text to the (own-account) caller.
- **RLS not yet probed live (S-live):** static review found all graph tables correctly gated, but a two-user runtime probe should confirm before launch.

## Data integrity
- **Device two-way contact sync (`contacts.ts`) is untested (residual):** the cloud-graph merge is now well-covered (20 tests), but the device address-book import/merge/write-back path has no unit tests. This is the most complex remaining code and the historical source of "lost interactions / resurrected archived contacts." Archive tombstones + additive patching mitigate it; **manual multi-sync device testing (`13` #4, #15) is required** before relying on it at scale.
- **Whole-graph push model:** `pushGraph` replaces client-owned tables wholesale (guarded by a version claim). Correct for MVP scale (hundreds–low-thousands of contacts); at 10k+ contacts the chunked replace is bandwidth-heavy. A later per-row diff is noted in-code as future work — not a launch blocker.

## Store / compliance (human-gated)
- **Web account-deletion URL missing (F-18):** Play Data Safety expects one. In-app deletion exists; add the page before Android submit.
- **Privacy manifest verification (F-26):** relies on module-shipped manifests; must be confirmed in the built iOS archive's Privacy Report.
- **Pricing inconsistency (F-20):** reconcile terms/site/listing/store product before submission to avoid a metadata rejection.
- **Target API 36 deadline:** submitting to Play after **2026-08-31** requires targeting API 36; SDK 56 targets 35. Ship before then or upgrade.

## Product decisions for the owner
- **Launch version number (F-10):** currently `0.1.0`. Decide whether to release as `1.0.0` (conventional; safe pre-first-build). Whatever you choose, keep `app.json` and `package.json` aligned.
- **Health Pro-gate (F-27):** disabled for beta. Re-enable (or keep open) for GA deliberately.
- **Associated domains (F-30):** shared `/c/` links open the web page, not the app. Add universal/app links if you want them to open in-app.

## Operational
- **No crash reporting / analytics** is a genuine privacy win but also means **you will be blind to production crashes.** Consider a privacy-respecting crash reporter (with its own privacy manifest + disclosure) post-launch — a product tradeoff, not a defect.
- **CRON secrets:** `daily-nudges` `CRON_SECRET` is optional (F-29); ensure the scheduled job authenticates via the intended path.
