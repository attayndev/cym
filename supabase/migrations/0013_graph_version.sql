-- Optimistic concurrency for whole-graph sync. Every successful push bumps
-- the version; a push carrying a stale version is refused client-side and
-- the device pulls instead. Ends the stale-device-clobbers-the-graph bug
-- (a lagging device deleted thousands of rows by pushing its old snapshot).
alter table public.profiles add column if not exists graph_version bigint not null default 0;
