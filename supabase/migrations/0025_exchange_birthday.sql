-- Optional self-reported birthday on the share-back form (MM-DD, no year).
alter table public.exchange_submissions add column if not exists birthday text;
