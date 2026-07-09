-- Tier-0 email enrichment.

-- Contacts can carry every address/number from the device card — matching a
-- person by their second email is the difference between "New" and a real
-- correspondence history.
alter table public.contacts
  add column if not exists alt_emails text[],
  add column if not exists alt_phones text[];

-- SERVER-OWNED (written by gmail-sync with the service role; the client only
-- reads). Display names harvested from message headers for matched contacts.
create table if not exists public.contact_hints (
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id text not null,
  kind text not null, -- 'name'
  value text not null,
  observed int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, contact_id, kind)
);
alter table public.contact_hints enable row level security;
create policy "read own hints" on public.contact_hints
  for select using ((select auth.uid()) = user_id);

-- SERVER-OWNED rows, client may read + dismiss: people you correspond with
-- who aren't in your contacts at all.
create table if not exists public.suggested_contacts (
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  name text,
  message_count int not null default 0,
  last_seen_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, email)
);
alter table public.suggested_contacts enable row level security;
create policy "read own suggestions" on public.suggested_contacts
  for select using ((select auth.uid()) = user_id);
create policy "dismiss own suggestions" on public.suggested_contacts
  for update using ((select auth.uid()) = user_id);
