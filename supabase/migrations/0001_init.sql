-- Call Your Mom — initial schema
-- Mirrors src/lib/types.ts. The client generates string ids (e.g. "ctc_..."),
-- so primary keys are text. Every row is owned by a user via user_id, and
-- row-level security restricts all access to the owner.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role text,
  company text,
  email text,
  phone text,
  city text,
  is_pro boolean not null default false,
  notifications_enabled boolean not null default false,
  default_persona_id text,
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- personas
-- ---------------------------------------------------------------------------
create table if not exists public.personas (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  tagline text,
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists personas_user_id_idx on public.personas (user_id);

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  persona_id text not null,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  company text,
  role text,
  city text,
  birthday text,            -- "MM-DD"
  category text not null,
  importance smallint not null,
  cadence_days integer not null,
  source text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists contacts_user_id_idx on public.contacts (user_id);

-- ---------------------------------------------------------------------------
-- contexts (the four capture prompts, attached to a contact)
-- ---------------------------------------------------------------------------
create table if not exists public.contexts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id text not null,
  where_met text,
  discussed text,
  why_matters text,
  commitment text,
  commitment_due_at text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists contexts_user_id_idx on public.contexts (user_id);

-- ---------------------------------------------------------------------------
-- interactions (drive decay scoring)
-- ---------------------------------------------------------------------------
create table if not exists public.interactions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id text not null,
  type text not null,
  occurred_at timestamptz not null,
  note text,
  source text not null,
  updated_at timestamptz not null default now()
);
create index if not exists interactions_user_id_idx on public.interactions (user_id);

-- ---------------------------------------------------------------------------
-- hooks (occasions: birthday / commitment-due / reconnect-anniversary)
-- ---------------------------------------------------------------------------
create table if not exists public.hooks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id text not null,
  type text not null,
  trigger_at text not null,
  label text not null,
  source_context_id text,
  consumed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists hooks_user_id_idx on public.hooks (user_id);

-- ---------------------------------------------------------------------------
-- nudges (headline/reason/suggested_action are LocalizedText JSON)
-- ---------------------------------------------------------------------------
create table if not exists public.nudges (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id text not null,
  hook_id text,
  kind text not null,
  headline jsonb not null,
  reason jsonb not null,
  suggested_action jsonb not null,
  state text not null,
  snoozed_until timestamptz,
  created_at timestamptz not null,
  score double precision not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists nudges_user_id_idx on public.nudges (user_id);

-- ---------------------------------------------------------------------------
-- connected_accounts (email/LinkedIn OAuth — tokens NOT stored here in MVP)
-- ---------------------------------------------------------------------------
create table if not exists public.connected_accounts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  email text not null,
  status text not null,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists connected_accounts_user_id_idx on public.connected_accounts (user_id);

-- ---------------------------------------------------------------------------
-- Row-level security: a user can only see and write their own rows
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.personas            enable row level security;
alter table public.contacts            enable row level security;
alter table public.contexts            enable row level security;
alter table public.interactions        enable row level security;
alter table public.hooks               enable row level security;
alter table public.nudges              enable row level security;
alter table public.connected_accounts  enable row level security;

-- profiles keys on user_id directly; the rest carry a user_id column.
do $$
declare
  tbl text;
begin
  -- profiles (PK is user_id)
  execute 'create policy "own profile" on public.profiles for all
           using (auth.uid() = user_id) with check (auth.uid() = user_id)';

  foreach tbl in array array[
    'personas','contacts','contexts','interactions','hooks','nudges','connected_accounts'
  ]
  loop
    execute format(
      'create policy "own rows" on public.%I for all
       using (auth.uid() = user_id) with check (auth.uid() = user_id)', tbl);
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
