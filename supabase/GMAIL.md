# Gmail sync setup

Gmail sync keeps "last contact" accurate automatically by reading **only message
metadata** — timestamps and participants, never message bodies (we request the
restricted `gmail.metadata` scope, which can't read content even if we wanted to).

It has three moving parts, all already coded:
- Three Supabase Edge Functions (`supabase/functions/gmail-*`).
- A locked-down `gmail_credentials` table (`migrations/0002_gmail.sql`) only the
  functions can read.
- The "Email sync" section in the app's Settings (visible once you're signed in).

Everything below is one-time provisioning — it needs Google Cloud credentials
created under your own Google account.

---

## 1. Apply the migration

If you haven't already, run `migrations/0002_gmail.sql` in the Supabase SQL Editor
(or `supabase db push`).

## 2. Create Google OAuth credentials

1. **Google Cloud Console** (https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → Library →** search **Gmail API → Enable**.
3. **APIs & Services → OAuth consent screen:**
   - User type **External**.
   - Fill app name, your support email, developer email.
   - **Scopes →** add `openid`, `.../auth/userinfo.email`, and the restricted
     **`.../auth/gmail.metadata`**.
   - **Test users →** add the Gmail address(es) you'll test with. (Required while the
     app is unverified.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - Application type **Web application**.
   - **Authorized redirect URIs →** add **exactly**:
     ```
     https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/gmail-oauth-callback
     ```
   - Create, then copy the **Client ID** and **Client secret**.

## 3. Give the functions their secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically. Set the rest
(replace the values and your project ref):

```sh
supabase secrets set \
  GOOGLE_CLIENT_ID="...apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="GOCSPX-..." \
  GMAIL_REDIRECT_URL="https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/gmail-oauth-callback"
```

## 4. Deploy the functions

```sh
supabase functions deploy gmail-auth-start --no-verify-jwt
supabase functions deploy gmail-oauth-callback --no-verify-jwt
supabase functions deploy gmail-sync --no-verify-jwt
```

(`--no-verify-jwt` matches `config.toml`; the functions authenticate manually.)

## 5. Test

In the app (signed in): **Settings → Email sync → Connect Gmail**. Approve the consent
screen with a test-user Gmail. You'll bounce back to the app marked connected, an initial
sync runs, and any emails to/from people already in your contacts show up as interactions
that move their "last contact" forward. Use **Sync now** to re-run anytime.

---

## Two gotchas worth knowing up front

- **Testing-mode refresh tokens expire after 7 days.** While the OAuth consent screen's
  publishing status is **Testing**, Google expires refresh tokens after 7 days, so sync
  will stop until you reconnect. Fine for development. To run continuously you either
  reconnect weekly or move to **Production** — which, because `gmail.metadata` is a
  *restricted* scope, requires Google's security review (CASA assessment) first. Budget
  for that review before public launch; it's the single biggest external dependency in the
  whole app, exactly as the product brief flagged.
- **The redirect URI must match byte-for-byte.** A trailing slash or http/https mismatch
  between the Google credential and `GMAIL_REDIRECT_URL` is the most common failure.

## Optional: scheduled sync

To sync nightly instead of only on demand, schedule `gmail-sync` with the service role.
In the SQL Editor (enables `pg_cron` + `pg_net`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('gmail-nightly', '0 8 * * *', $$
  select net.http_post(
    url    := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/gmail-sync',
    headers:= jsonb_build_object(
      'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'),
    body   := '{}'::jsonb
  );
$$);
```

With no user JWT, `gmail-sync` runs over **all** connected accounts. (Store the service
role key as a Vault secret rather than inline before doing this for real.)

**Which key counts as "the service role key":** the functions compare the bearer token
against the `SUPABASE_SERVICE_ROLE_KEY` env Supabase injects, which on this project is the
new-format **`sb_secret_...`** key (Dashboard → Settings → API keys), *not* the legacy
`eyJ...` JWT service_role key. The legacy key gets treated as a user JWT and rejected.
