-- Card/badge scan metering: one row per user per day; the card-scan function
-- (service role) reads and bumps it. No client access.
create table if not exists public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.scan_usage enable row level security;
