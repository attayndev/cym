# Supabase backend setup

The app is local-first and runs with no backend. Completing these steps turns on
**accounts and cross-device sync** (and is the foundation for Gmail sync and server
push later). Until `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set,
none of this code path activates — the app keeps saving everything on-device.

## 1. Create the project

1. Go to https://supabase.com → **New project**. Pick a name and a strong database password.
2. When it finishes provisioning, open **Settings → API** and copy:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Put both in a local `.env` (copy from `.env.example`).

## 2. Apply the schema

Open **SQL Editor** in the Supabase dashboard, paste the contents of
[`migrations/0001_init.sql`](./migrations/0001_init.sql), and run it. This creates all
tables, row-level-security policies (each user can only read/write their own rows), and a
trigger that creates a profile row on sign-up.

> Prefer the CLI? `supabase link --project-ref <ref>` then `supabase db push`.

## 3. Configure auth

In **Authentication → Providers**, keep **Email** enabled. For the fastest test loop,
turn **off** "Confirm email" (Authentication → Providers → Email) so sign-up logs you in
immediately; turn it back on before launch.

## 4. Run

```sh
# .env now has the two EXPO_PUBLIC_SUPABASE_* values
npm run ios   # or: npm run web
```

In the app: **Settings → Account & sync → Sign in to sync**. Create an account; anything
you captured locally is pushed up on first sign-in, and signing in on another device
pulls it back down.

## How sync works (MVP)

- The local AsyncStorage copy stays the working source of truth (offline-first).
- On sign-in we **pull** the cloud graph. If the cloud has data, it's adopted; if it's
  empty, the local graph is **pushed** up (migrates offline-captured data).
- After every change, a debounced **push** mirrors the whole graph to Supabase
  ("upsert all rows, delete the rest"). This is intentionally simple for MVP scale; a
  later milestone can move to per-row diffing / realtime and conflict resolution.

## What's intentionally NOT here yet

- **OAuth token storage for Gmail** — the `connected_accounts` table is a placeholder
  (no tokens). Email sync needs Google OAuth credentials and a server-side token exchange.
- **Server-side cron** to recompute decay / fire push notifications.
- **Billing** — subscription status (`is_pro`) is a column, but there's no payment
  webhook wiring it yet.
