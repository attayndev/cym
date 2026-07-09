-- Multi-inbox Gmail: connected_accounts becomes one row PER (user, email).
-- The old id scheme (gmail_<uid>) allowed exactly one Gmail row per user, so a
-- second inbox overwrote the first and shared its sync/backfill bookmarks.
update public.connected_accounts
  set id = 'gmail_' || user_id::text || '_' || email
  where provider = 'gmail'
    and id = 'gmail_' || user_id::text;
