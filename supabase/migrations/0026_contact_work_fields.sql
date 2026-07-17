-- Optional work address/number alongside the existing (personal) email/phone.
alter table public.contacts add column if not exists work_email text;
alter table public.contacts add column if not exists work_phone text;
