-- Referral/affiliate attribution groundwork (phase 1 of the affiliate
-- system): site clicks on ?ref= links, and the code a user gives at signup.
-- The bounty/conversion engine arrives with RevenueCat billing.
create table if not exists public.ref_clicks (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  landing_page text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ref_clicks_code_at on public.ref_clicks (code, created_at);
alter table public.ref_clicks enable row level security;

create table if not exists public.signup_attributions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null,
  source text not null default 'onboarding',
  created_at timestamptz not null default now()
);
alter table public.signup_attributions enable row level security;
