// Pulls Gmail message *metadata* (From/To/Cc/Date — never bodies) since the last
// sync, matches participants to the user's contacts by email, and writes deduped
// "email-sync" interactions that feed decay scoring. Accepts either a user JWT
// (manual "Sync now") or the service role (scheduled batch over all accounts).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Cred {
  user_id: string;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
  expiry: string | null;
}

function emailFrom(header: string): string {
  const m = header?.match(/<([^>]+)>/);
  return (m ? m[1] : header ?? '').trim().toLowerCase();
}
function emailsFrom(header?: string): string[] {
  if (!header) return [];
  return header.split(',').map(emailFrom).filter(Boolean);
}

async function freshToken(admin: SupabaseClient, cred: Cred): Promise<string> {
  const valid = cred.expiry && new Date(cred.expiry).getTime() > Date.now() + 60_000;
  if (valid && cred.access_token) return cred.access_token;
  if (!cred.refresh_token) throw new Error('no refresh token');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: cred.refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const t = await res.json();
  if (!t.access_token) throw new Error('refresh failed');
  const expiry = new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString();
  await admin
    .from('gmail_credentials')
    .update({ access_token: t.access_token, expiry })
    .eq('user_id', cred.user_id)
    .eq('email', cred.email);
  return t.access_token;
}

async function syncAccount(admin: SupabaseClient, cred: Cred): Promise<number> {
  const token = await freshToken(admin, cred);

  const { data: acct } = await admin
    .from('connected_accounts')
    .select('last_sync_at')
    .eq('user_id', cred.user_id)
    .eq('provider', 'gmail')
    .maybeSingle();

  // The gmail.metadata scope rejects the `q` search parameter, so we can't ask
  // Google to filter by date. Instead we walk the (newest-first) message list and
  // stop once messages fall behind the cutoff: first run looks back 90 days;
  // afterwards one day before the last sync (overlap is fine — upserts dedup).
  const cutoff = acct?.last_sync_at
    ? new Date(acct.last_sync_at).getTime() - 24 * 3600_000
    : Date.now() - 90 * 24 * 3600_000;

  const { data: contacts } = await admin
    .from('contacts')
    .select('id,email')
    .eq('user_id', cred.user_id);
  const byEmail = new Map<string, string>();
  for (const c of contacts ?? []) {
    if (c.email) byEmail.set(String(c.email).toLowerCase(), c.id);
  }

  const stamp = async () =>
    admin
      .from('connected_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', cred.user_id)
      .eq('provider', 'gmail');

  if (byEmail.size === 0) {
    await stamp();
    return 0;
  }

  const rows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  pages: for (let page = 0; page < 5; page++) {
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('maxResults', '100');
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken);
    const listRes = await fetch(listUrl, { headers: { authorization: `Bearer ${token}` } });
    if (!listRes.ok) throw new Error(`list failed: ${listRes.status}`);
    const list = await listRes.json();
    const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
    if (ids.length === 0) break;

    for (const id of ids) {
      const getUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
      getUrl.searchParams.set('format', 'metadata');
      for (const h of ['From', 'To', 'Cc', 'Date']) getUrl.searchParams.append('metadataHeaders', h);
      const getRes = await fetch(getUrl, { headers: { authorization: `Bearer ${token}` } });
      if (!getRes.ok) continue;
      const msg = await getRes.json();

      const occurred = Number(msg.internalDate ?? 0);
      if (occurred && occurred < cutoff) break pages;

      const headers: Record<string, string> = {};
      for (const h of msg.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;

      const when = headers['date']
        ? new Date(headers['date']).toISOString()
        : new Date(occurred).toISOString();

      const participants = [
        ...emailsFrom(headers['from']),
        ...emailsFrom(headers['to']),
        ...emailsFrom(headers['cc']),
      ];
      const contactIds = new Set<string>();
      for (const e of participants) {
        const cid = byEmail.get(e);
        if (cid) contactIds.add(cid);
      }
      for (const contactId of contactIds) {
        rows.push({
          id: `int_gm_${id}_${contactId}`,
          user_id: cred.user_id,
          contact_id: contactId,
          type: 'email',
          occurred_at: when,
          source: 'email-sync',
        });
      }
    }

    pageToken = list.nextPageToken;
    if (!pageToken) break;
  }

  if (rows.length > 0) {
    await admin.from('interactions').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  }
  await stamp();
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body — fine
  }

  // Resolve which accounts to act on.
  let creds: Cred[] = [];
  let actingUserId: string | null = null;
  if (jwt && jwt !== SERVICE_KEY) {
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }
    actingUserId = data.user.id;
    const { data: c } = await admin.from('gmail_credentials').select('*').eq('user_id', actingUserId);
    creds = (c as Cred[]) ?? [];
  } else {
    const { data: c } = await admin.from('gmail_credentials').select('*');
    creds = (c as Cred[]) ?? [];
  }

  // Disconnect: drop credentials + mark the account disconnected (user-scoped only).
  if (body.action === 'disconnect' && actingUserId) {
    await admin.from('gmail_credentials').delete().eq('user_id', actingUserId);
    await admin
      .from('connected_accounts')
      .delete()
      .eq('user_id', actingUserId)
      .eq('provider', 'gmail');
    return new Response(JSON.stringify({ disconnected: true }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  let total = 0;
  const errors: string[] = [];
  for (const cred of creds) {
    try {
      total += await syncAccount(admin, cred);
    } catch (e) {
      // Skip a failing account; the rest still sync — but say so in the response.
      errors.push(`${cred.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(
    JSON.stringify({
      accounts: creds.length,
      newInteractions: total,
      ...(errors.length > 0 ? { errors } : {}),
    }),
    { headers: { ...cors, 'content-type': 'application/json' } },
  );
});
