-- Gmail sync: OAuth token storage.
-- Tokens are NEVER readable by the client. RLS is enabled with no policies, so
-- anon/authenticated roles get zero access; only Edge Functions using the
-- service role (which bypasses RLS) can read or write here.

create table if not exists public.gmail_credentials (
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  access_token text,
  refresh_token text,
  expiry timestamptz,
  scope text,
  updated_at timestamptz not null default now(),
  primary key (user_id, email)
);

alter table public.gmail_credentials enable row level security;
-- Belt-and-suspenders on top of RLS-with-no-policies:
revoke all on public.gmail_credentials from anon, authenticated;

-- connected_accounts (created in 0001) holds the client-visible status only —
-- provider, email, last_sync_at — never tokens. It is written by the sync
-- functions (service role) and read by the client.
