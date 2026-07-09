-- Resumable 12-month Gmail backfill state. The nightly sync digs backwards in
-- budgeted slices (the metadata scope can't filter by date server-side), saving
-- its place here until the full lookback window is covered.
alter table public.connected_accounts
  add column if not exists backfill_cursor text,
  add column if not exists backfill_done boolean not null default false;
