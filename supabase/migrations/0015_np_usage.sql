-- Track paid-fallback (NinjaPear) calls separately: it bills per request even
-- on misses, so it gets its own tighter daily budget than free Hunter lookups.
alter table public.enrich_usage add column if not exists np_lookups int not null default 0;
