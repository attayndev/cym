-- Row-level modification times for true sync merging. Without these, any
-- pull adopted the cloud graph wholesale and stomped unpushed local changes
-- (the "app keeps losing my interactions" bug), and version conflicts had to
-- discard one side. With them, merges keep the newest version of every row.
alter table public.contacts add column if not exists updated_at timestamptz;
alter table public.contexts add column if not exists updated_at timestamptz;
alter table public.personas add column if not exists updated_at timestamptz;
