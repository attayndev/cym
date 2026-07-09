-- Free-tier AI draft meter: FREE_DRAFTS_PER_MONTH per calendar month.
-- Service-role only; the drafts function reads/increments.
create table if not exists public.draft_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  count int not null default 0,
  primary key (user_id, month)
);
alter table public.draft_usage enable row level security;
revoke all on public.draft_usage from anon, authenticated;
