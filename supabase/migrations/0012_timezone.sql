-- User timezone (IANA name, auto-reported by the app) so server-sent
-- notifications fire on the user's local day at a civilized local hour —
-- not UTC's idea of "today".
alter table public.profiles add column if not exists timezone text;
