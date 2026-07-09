-- Daily-deck Stage 1: contact lifecycle. kind = person/business/unclear noise
-- classification; status = active/archived (CYM-only archive — never touches
-- the device address book); evaluated_at = when the user gave an
-- evaluate-deck verdict. Nullable: legacy rows are normalized client-side.
alter table public.contacts
  add column if not exists kind text,
  add column if not exists status text,
  add column if not exists evaluated_at timestamptz;
