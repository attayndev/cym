// Outlook mail-metadata sync via Microsoft Graph: inbox + sent items,
// 12-month resumable backfill then incremental. Reads sender/recipients/
// dates only ($select keeps bodies out of the response entirely). Emits the
// same interaction rows, name hints, and outbound-only suggestions as Gmail.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  flushHarvest,
  loadContactIndex,
  newHarvest,
  processMessage,
  type ParsedMessage,
  type Participant,
} from '../_shared/mailsync.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID')!;
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET')!;

const BACKFILL_MONTHS = 12;
const PAGE = 100;
const MAX_PAGES_PER_RUN = 30; // resumable via last_sync watermark

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } });

interface Cred {
  user_id: string;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
  expiry: string | null;
}

async function freshToken(admin: SupabaseClient, cred: Cred): Promise<string> {
  if (cred.access_token && cred.expiry && new Date(cred.expiry).getTime() - Date.now() > 120e3) {
    return cred.access_token;
  }
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: cred.refresh_token ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const tok = await res.json();
  await admin
    .from('outlook_credentials')
    .update({
      access_token: tok.access_token,
      ...(tok.refresh_token ? { refresh_token: tok.refresh_token } : {}),
      expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', cred.user_id)
    .eq('email', cred.email);
  return tok.access_token;
}

const addr = (r: { emailAddress?: { address?: string; name?: string } }): Participant | null => {
  const email = r.emailAddress?.address?.toLowerCase();
  if (!email) return null;
  return { email, name: r.emailAddress?.name || undefined };
};

async function syncAccount(admin: SupabaseClient, cred: Cred, ownEmails: Set<string>): Promise<number> {
  const token = await freshToken(admin, cred);
  const idx = await loadContactIndex(admin, cred.user_id);
  const harvest = newHarvest();

  const { data: acct } = await admin
    .from('connected_accounts')
    .select('last_sync_at')
    .eq('user_id', cred.user_id)
    .eq('provider', 'outlook')
    .eq('email', cred.email)
    .maybeSingle();

  const since = acct?.last_sync_at
    ? new Date(acct.last_sync_at)
    : new Date(Date.now() - BACKFILL_MONTHS * 30 * 86400e3);
  // Overlap a little so boundary messages are never missed (ids are idempotent).
  const sinceIso = new Date(since.getTime() - 3600e3).toISOString();

  let newestSeen = since.toISOString();
  for (const folder of ['inbox', 'sentitems']) {
    let url =
      `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages` +
      `?$select=id,receivedDateTime,from,toRecipients,ccRecipients` +
      `&$filter=receivedDateTime ge ${sinceIso}` +
      `&$orderby=receivedDateTime asc&$top=${PAGE}`;
    for (let page = 0; page < MAX_PAGES_PER_RUN && url; page++) {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!res.ok) throw new Error(`graph ${folder}: ${res.status}`);
      const body = await res.json();
      for (const m of body.value ?? []) {
        const from = [addr(m.from ?? {})].filter(Boolean) as Participant[];
        const toCc = [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])]
          .map(addr)
          .filter(Boolean) as Participant[];
        const msg: ParsedMessage = {
          id: String(m.id).replace(/[^A-Za-z0-9]/g, '').slice(-24),
          when: m.receivedDateTime,
          from,
          toCc,
        };
        if (m.receivedDateTime > newestSeen) newestSeen = m.receivedDateTime;
        processMessage(harvest, idx, ownEmails, cred.user_id, 'int_ol', msg);
      }
      url = body['@odata.nextLink'] ?? '';
    }
  }

  const count = await flushHarvest(admin, cred.user_id, harvest);
  await admin.from('connected_accounts').upsert({
    id: `outlook_${cred.user_id}_${cred.email}`,
    user_id: cred.user_id,
    provider: 'outlook',
    email: cred.email,
    status: 'connected',
    last_sync_at: newestSeen,
  });
  return count;
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');

  let body: { action?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // default sync
  }

  let creds: Cred[] = [];
  if (jwt && jwt !== SERVICE_KEY) {
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) return json({ error: 'unauthorized' }, 401);
    if (body.action === 'disconnect') {
      let d1 = admin.from('outlook_credentials').delete().eq('user_id', data.user.id);
      let d2 = admin
        .from('connected_accounts')
        .delete()
        .eq('user_id', data.user.id)
        .eq('provider', 'outlook');
      if (body.email) {
        d1 = d1.eq('email', body.email);
        d2 = d2.eq('email', body.email);
      }
      await d1;
      await d2;
      return json({ disconnected: true });
    }
    const { data: rows } = await admin
      .from('outlook_credentials')
      .select('*')
      .eq('user_id', data.user.id);
    creds = (rows ?? []) as Cred[];
  } else if (jwt === SERVICE_KEY || req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET')) {
    const { data: rows } = await admin.from('outlook_credentials').select('*');
    creds = (rows ?? []) as Cred[];
  } else {
    return json({ error: 'unauthorized' }, 401);
  }

  const emailsByUser = new Map<string, Set<string>>();
  for (const c of creds) {
    const s = emailsByUser.get(c.user_id) ?? new Set<string>();
    s.add(c.email.toLowerCase());
    emailsByUser.set(c.user_id, s);
  }

  let total = 0;
  const errors: string[] = [];
  for (const cred of creds) {
    try {
      total += await syncAccount(admin, cred, emailsByUser.get(cred.user_id) ?? new Set());
    } catch (e) {
      errors.push(`${cred.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return json({ accounts: creds.length, newInteractions: total, ...(errors.length ? { errors } : {}) });
});
