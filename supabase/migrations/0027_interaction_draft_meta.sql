-- Tone/channel/edited stamp captured at Mark sent, for on-device user-voice
-- learning (Phase A). Content-free — no message text lives here.
alter table public.interactions add column if not exists draft_meta jsonb;
comment on column public.interactions.draft_meta is 'Tone/channel/edited stamp captured at Mark sent — content-free signal for on-device user-voice distillation (Phase A). Never contains message text.';
