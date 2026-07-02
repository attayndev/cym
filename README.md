# Call Your Mom

A personal relationship manager that keeps the relationships you care about from going cold. Full product rationale in [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md).

## Stack

- **Expo SDK 56 / React Native** with expo-router (iOS-first, runs on web for quick iteration)
- **Local-first storage** — all entities persist on-device via AsyncStorage behind a repository layer (`src/lib/store.ts`); designed to swap to a hosted backend without touching screens
- **Design system** — cream background, dark card accents, Playfair Display + DM Sans (`src/constants/theme.ts`)

## Run it

```sh
npm install
npm run ios      # or: npm run web
```

The app seeds itself with demo contacts on first launch so the nudge engine has something to chew on. The paywall's "Go Pro" button flips the subscription flag locally (real billing arrives with the backend).

### Follow-up drafts

Drafts fall back to context-aware templates by default. To enable generated drafts in development, set:

```sh
EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-... npm run ios
```

Production will route drafts through a backend proxy — the key never ships in the app.

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Types / data model | `src/lib/types.ts` | User, Persona, Contact, Context, Interaction, Hook, Nudge, ConnectedAccount — multi-persona-ready from day one; UI ships single-persona |
| Persistence | `src/lib/store.ts` | AsyncStorage JSON document |
| Seed data | `src/lib/seed.ts` | Demo relationships at varied decay stages |
| Nudge engine | `src/lib/nudges.ts` | Decay scoring vs. cadence + hook generation (birthday, commitment-due, reconnect-anniversary). Hook-led nudges lead; bare decay nudges are capped at 3 so the feed never becomes a guilt list |
| Drafts | `src/lib/drafts.ts` | Template generator + API-backed generator behind one interface |
| App state | `src/state/app-context.tsx` | Provider exposing the db + actions; engine re-runs on every mutation and app open |
| Screens | `src/app/` | Today (nudge feed), People, Health dashboard, My Card (QR vCard), capture wizard, contact detail, nudge composer, paywall |

## Tier gating

Free: capture with context prompts, address-book import, sharing card + QR.
Pro ($100/yr): nudge engine, follow-up drafts, aging dashboard — gated on `profile.isPro`.

## Next milestones

- Backend (accounts, subscription, hosted db) — schema maps 1:1 to `src/lib/types.ts`
- Gmail sync via OAuth (`ConnectedAccount` is already modeled) + daily decay-recompute job
- Real billing (StoreKit / RevenueCat)
- QR landing page with reciprocal exchange
- Two-way native contacts sync (import-only today)
