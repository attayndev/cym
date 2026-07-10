-- Affiliate program applications (phase 2 groundwork): collected from the
-- marketing site; reviewed manually. Payment details are asked at approval,
-- not application.
create table if not exists public.affiliate_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  website text,
  audience text,
  why text,
  ip_hash text,
  created_at timestamptz not null default now()
);
alter table public.affiliate_applications enable row level security;
