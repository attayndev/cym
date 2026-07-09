-- Hunter.io enrichment (Plus tier).

-- Global lookup cache, keyed by the looked-up email only (no user data in the
-- key, so one user's lookup benefits all). Service-role only.
create table if not exists public.hunter_cache (
  email text primary key,
  status text not null, -- 'found' | 'none'
  payload jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.hunter_cache enable row level security;
revoke all on public.hunter_cache from anon, authenticated;

-- Per-user daily lookup counter — a guardrail, not billing (the enrichment
-- endpoints are credit-free; this stops a client bug from hammering Hunter).
create table if not exists public.enrich_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  lookups int not null default 0,
  primary key (user_id, day)
);
alter table public.enrich_usage enable row level security;
revoke all on public.enrich_usage from anon, authenticated;

-- LinkedIn handle — often the most useful enrichment for professional
-- relationships.
alter table public.contacts add column if not exists linkedin text;
