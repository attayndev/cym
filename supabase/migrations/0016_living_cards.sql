-- Living cards: a contact can subscribe to the subject's own shared card.
-- card_token references the sharer's share_tokens token; when they update
-- their card, holders' copies refresh. Rotation revokes.
alter table public.contacts add column if not exists card_token text;
