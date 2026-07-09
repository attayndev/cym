-- Launch-notification waitlist, captured from the marketing site's
-- "Coming soon" popup. Service-role only; the public writes through the
-- rate-limited waitlist edge function.
create table if not exists public.waitlist (
  email text primary key,
  source text, -- 'ios' | 'android' | other badge origins
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
