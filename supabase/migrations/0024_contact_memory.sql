-- Relationship Memory (Phase 1): per-contact memory distilled from text the
-- user typed or approved in the app — never from email content. Server-owned:
-- the memory-extract function writes with the service role; users can read
-- and delete their own rows, never insert or update them. Deliberately
-- outside the whole-graph sync tables.
create table public.contact_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id text not null,
  kind text not null check (kind in ('fact', 'thread', 'event')),
  theme text not null,
  content text not null,
  source text not null,
  source_id text,
  weight numeric not null default 1.0,
  reinforcement_count integer not null default 1,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contact_id, kind, theme)
);

alter table public.contact_memory enable row level security;

create policy "contact_memory_select_own" on public.contact_memory
  for select using (auth.uid() = user_id);

create policy "contact_memory_delete_own" on public.contact_memory
  for delete using (auth.uid() = user_id);

create index contact_memory_user_contact
  on public.contact_memory (user_id, contact_id);
