-- Persona card fields: each persona can carry its own display name, email,
-- and phone that override the profile's (Personal vs Professional cards can
-- now fully diverge, not just role/company). Null means "inherit from
-- profile" — the fallback lives in app code (personaCardFields).
alter table public.personas
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists phone text;
