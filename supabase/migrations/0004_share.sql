-- QR sharing: per-persona share tokens + reciprocal exchange submissions,
-- and persona-level card overrides.
--
-- Both new tables live OUTSIDE the client's whole-graph sync (like
-- connected_accounts): the app reads them on demand via RLS, and the
-- share-card edge function (service role) does the public-facing work.

-- Personas can present their own role/company on the sharing card.
alter table public.personas add column if not exists role text;
alter table public.personas add column if not exists company text;

create extension if not exists pgcrypto with schema extensions;

-- One revocable share link per (user, persona). The token IS the capability:
-- 128 bits from pgcrypto, minted by Postgres so the client never invents ids.
create table if not exists public.share_tokens (
  token text primary key default encode(extensions.gen_random_bytes(16), 'hex'),
  user_id uuid not null references auth.users (id) on delete cascade,
  persona_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, persona_id)
);

alter table public.share_tokens enable row level security;

create policy "own share tokens" on public.share_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists share_tokens_user_id_idx on public.share_tokens (user_id);

-- Reciprocal exchange: someone who scanned a card shares their info back.
-- Inserted ONLY by the service role (share-card function) — deliberately no
-- insert policy. The owner reviews rows in the app (pending → accepted/dismissed).
create table if not exists public.exchange_submissions (
  id text primary key default ('exs_' || encode(extensions.gen_random_bytes(8), 'hex')),
  user_id uuid not null references auth.users (id) on delete cascade,
  persona_id text,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  company text,
  role text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.exchange_submissions enable row level security;

create policy "own submissions select" on public.exchange_submissions
  for select using (auth.uid() = user_id);
create policy "own submissions update" on public.exchange_submissions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own submissions delete" on public.exchange_submissions
  for delete using (auth.uid() = user_id);

create index if not exists exchange_submissions_user_status_idx
  on public.exchange_submissions (user_id, status);
