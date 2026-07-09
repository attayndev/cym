-- Outlook (Microsoft Graph) + generic IMAP connectors, mirroring the Gmail
-- pattern: token/credential tables are service-role only (RLS, no policies);
-- the client-visible status lives on connected_accounts (provider column).

create table if not exists public.outlook_credentials (
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  access_token text,
  refresh_token text,
  expiry timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, email)
);
alter table public.outlook_credentials enable row level security;
revoke all on public.outlook_credentials from anon, authenticated;

create table if not exists public.imap_credentials (
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  host text not null,
  port int not null default 993,
  -- App-specific / IMAP password. Held server-side only, like OAuth tokens.
  password text not null,
  last_uid bigint,
  sent_folder text,
  updated_at timestamptz not null default now(),
  primary key (user_id, email)
);
alter table public.imap_credentials enable row level security;
revoke all on public.imap_credentials from anon, authenticated;
