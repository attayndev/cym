# Scheduled sync + push notifications setup

This makes the app **proactive**: a nightly job syncs Gmail and sends push
notifications for the day's hook-driven moments (birthdays today, commitments due
today) — in the user's language — without anyone opening the app.

Already coded:
- `push_tokens` table + `profiles.locale` (`migrations/0003_push.sql`).
- Device push-token registration (`src/lib/push.ts`, wired into the app on sign-in).
- `daily-nudges` edge function (`supabase/functions/daily-nudges/`).

What you provision below: an Expo (EAS) project ID, deploy of the function, and the
two cron schedules.

> ⚠️ **Push can't be tested on the iOS Simulator or in Expo Go.** Apple blocks remote
> push on the simulator, and Expo Go dropped push support. You need a **development
> build on a physical device** to receive real notifications. Local notifications
> (birthday/digest reminders the app schedules itself) still work on the simulator —
> this section is specifically about *server-sent* push.

---

## 1. Apply the migration

Run `migrations/0003_push.sql` (SQL Editor or `supabase db push`).

## 2. Get an EAS project ID

Push tokens require an Expo project ID. From the project root:

```sh
npm i -g eas-cli      # if needed
eas login
eas init              # creates/links an Expo project, writes extra.eas.projectId into app.json
```

`src/lib/push.ts` reads that ID automatically. Without it, token registration just
no-ops (the app still runs fine).

## 3. Build a dev build on a real device

```sh
eas build --profile development --platform ios   # or android
```

Install it on your phone, sign in, and make sure **Settings → Notifications →
Reminders** is on. The app registers the device's push token on sign-in.

## 4. Deploy the function

```sh
supabase functions deploy daily-nudges --no-verify-jwt
```

Test it for just yourself (send your own JWT — easiest from the app's network calls,
or use the Supabase dashboard's function tester). A quick service-role smoke test:

```sh
curl -X POST 'https://jvuvuukvgunhpemrhqxl.supabase.co/functions/v1/daily-nudges' \
  -H "Authorization: Bearer <YOUR_SERVICE_ROLE_KEY>" \
  -H 'content-type: application/json' -d '{}'
# → {"users":N,"sent":M}
```

If you have a contact whose birthday is today (or a commitment due today) and a
registered device, you'll get a push.

## 5. Schedule both jobs (nightly)

In the SQL Editor, enable the schedulers and store the service key in Vault (so it's
not inlined in the cron definition):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the service role key once (Project Settings → API → service_role key).
select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');

-- Helper: fetch it back inside the cron body.
-- (Reads from vault.decrypted_secrets, which only the postgres role can see.)

-- Gmail sync at 07:00 UTC
select cron.schedule('gmail-nightly', '0 7 * * *', $$
  select net.http_post(
    url     := 'https://jvuvuukvgunhpemrhqxl.supabase.co/functions/v1/gmail-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
$$);

-- Push nudges at 08:00 UTC (after sync, so "last contact" is fresh)
select cron.schedule('daily-nudges', '0 8 * * *', $$
  select net.http_post(
    url     := 'https://jvuvuukvgunhpemrhqxl.supabase.co/functions/v1/daily-nudges',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
$$);
```

Check schedules with `select * from cron.job;` and runs with
`select * from cron.job_run_details order by start_time desc limit 10;`.

---

## Known limitations (deliberate, for now)

- **Timezone.** "Today" is computed in **UTC**, and the cron fires at a fixed UTC
  hour. A user in another timezone may get a birthday push a few hours early/late.
  Refining this means storing each user's timezone and bucketing the cron — a good
  follow-up, not needed to prove the loop.
- **Hook-driven only.** Push covers birthdays + due commitments, never bare
  time-decay — by design, so notifications stay gifts, not nagging. Time-decay still
  surfaces quietly in-app.
- **No de-dupe across a day.** The cron runs once daily, so a moment notifies once.
  If you run it manually multiple times in a day, it'll re-send.
