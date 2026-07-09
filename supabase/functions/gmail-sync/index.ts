// Pulls Gmail message *metadata* (From/To/Cc/Date — never bodies), matches
// participants to the user's contacts by email, and writes deduped "email-sync"
// interactions that feed decay scoring. Accepts either a user JWT (manual
// "Sync now") or the service role (scheduled batch over all accounts).
//
// Two phases per run:
//  1. incremental — newest mail down to one day before the last sync;
//  2. backfill — resumes from a saved cursor and digs backwards in budgeted
//     slices until LOOKBACK_DAYS is covered (the metadata scope rejects the
//     `q` param, so Google can't date-filter server-side; we walk and stop).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const LOOKBACK_DAYS = 365;
const PAGE_SIZE = 100;
const INCREMENTAL_PAGE_BUDGET = 5;
const BACKFILL_PAGE_BUDGET = 10;

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

/** Thrown when Gmail rejects a stored page cursor (they expire); the backfill
 *  restarts from the top next run — upserts dedup, so re-walking is harmless. */
class StaleCursor extends Error {}

/** Run `fn` over items with bounded concurrency. Serial fetches blow the edge
 *  function's wall clock (100 metadata GETs ≈ 10s+); a pool of 6 stays inside
 *  Gmail's per-user quota (GET = 5 units, 250 units/s). */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

interface Participant {
  email: string;
  name?: string;
}

/** Parse an address header into {email, name} pairs. Handles quoted display
 *  names containing commas ("Chen, Julia" <j@x.com>), bare names, and bare
 *  addresses. */
function parseParticipants(header?: string): Participant[] {
  if (!header) return [];
  const out: Participant[] = [];
  const spans: [number, number][] = [];
  const re = /(?:"([^"]*)"|([^<>,"]+))?\s*<([^<>@\s]+@[^<>\s]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header))) {
    const name = (m[1] ?? m[2] ?? '').trim();
    out.push({ email: m[3].trim().toLowerCase(), name: name || undefined });
    spans.push([m.index, re.lastIndex]);
  }
  let rest = header;
  for (let i = spans.length - 1; i >= 0; i--) {
    rest = rest.slice(0, spans[i][0]) + rest.slice(spans[i][1]);
  }
  for (const part of rest.split(',')) {
    const e = part.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) out.push({ email: e });
  }
  return out;
}

// Senders that are machines, not relationships — never suggest, never hint.
const MACHINE_LOCAL_RE =
  /^(no-?reply|do-?not-?reply|donot|noreply|reply|info|support|sales|contact|hello|hi|office|admin|billing|notifications?|notify|updates?|news(letter)?s?|digest|mailer(-daemon)?|bounce|marketing|receipts?|alerts?|team|help|orders?|service|security|account|store|welcome|email|em|mail|share|sharing|invites?|events?|community|feedback|careers|jobs|press|media|legal|privacy|postmaster|abuse|customer(care|service)?|member(ship)?s?)([+._\-\d]|$)/i;
// Mail-blast subdomains (e.affirm.com, em1.cloudflare.com, mail.britbox.com…).
const ESP_DOMAIN_RE =
  /^(e|em\d*|mail|mailer|news|newsletters?|marketing|info|mg|email|bounce|reply|notifications?|updates?|links|click|go|hs|mta\d*)\./i;

function isMachine(email: string): boolean {
  const [local = '', domain = ''] = email.split('@');
  return (
    MACHINE_LOCAL_RE.test(local) ||
    ESP_DOMAIN_RE.test(domain) ||
    /[0-9a-f]{10,}/i.test(local) // tracking/uuid locals
  );
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

async function listPage(
  token: string,
  pageToken?: string,
): Promise<{ ids: string[]; next?: string }> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('maxResults', String(PAGE_SIZE));
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (pageToken && res.status === 400) throw new StaleCursor();
    throw new Error(`list failed: ${res.status}`);
  }
  const list = await res.json();
  return {
    ids: (list.messages ?? []).map((m: { id: string }) => m.id),
    next: list.nextPageToken,
  };
}

async function syncAccount(
  admin: SupabaseClient,
  cred: Cred,
  ownEmails: Set<string>,
): Promise<number> {
  const token = await freshToken(admin, cred);

  const { data: acct } = await admin
    .from('connected_accounts')
    .select('last_sync_at,backfill_cursor,backfill_done')
    .eq('user_id', cred.user_id)
    .eq('provider', 'gmail')
    .eq('email', cred.email)
    .maybeSingle();

  const { data: contacts } = await admin
    .from('contacts')
    .select('id,email,alt_emails,first_name,last_name')
    .eq('user_id', cred.user_id);
  const byEmail = new Map<string, string>();
  const knownNames = new Set<string>();
  for (const c of contacts ?? []) {
    if (c.email) byEmail.set(String(c.email).toLowerCase(), c.id);
    for (const alt of (c.alt_emails as string[] | null) ?? []) {
      if (alt) byEmail.set(String(alt).toLowerCase(), c.id);
    }
    // Middle-initial-proof: first word + last word ("Danny Bibi" catches
    // header names like "Danny E. Bibi").
    const f = String(c.first_name ?? '').trim().toLowerCase().replace(/[.,]/g, '').split(/\s+/)[0];
    const l = String(c.last_name ?? '').trim().toLowerCase().replace(/[.,]/g, '').split(/\s+/).filter(Boolean).pop();
    if (f && l) knownNames.add(`${f} ${l}`);
  }

  // No emailable contacts yet: nothing to match. Don't burn the backfill —
  // it runs once contacts exist.
  if (byEmail.size === 0) {
    await admin
      .from('connected_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', cred.user_id)
      .eq('provider', 'gmail')
      .eq('email', cred.email);
    return 0;
  }

  const rows: Record<string, unknown>[] = [];
  // Enrichment harvest: display names seen for matched contacts (From header
  // = the sender's self-declared name), and correspondents with no contact.
  const nameHints = new Map<string, Map<string, number>>();
  const suggestions = new Map<string, { name?: string; count: number; last: string }>();

  /** Fetch one message's metadata, record touches for matched contacts, and
   *  return its internalDate (ms) — or null when unknown/unavailable. */
  const processMessage = async (id: string): Promise<number | null> => {
    const getUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
    getUrl.searchParams.set('format', 'metadata');
    for (const h of ['From', 'To', 'Cc', 'Date']) getUrl.searchParams.append('metadataHeaders', h);
    const getRes = await fetch(getUrl, { headers: { authorization: `Bearer ${token}` } });
    if (!getRes.ok) return null;
    const msg = await getRes.json();

    const occurred = Number(msg.internalDate ?? 0);
    const headers: Record<string, string> = {};
    for (const h of msg.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;

    const when = headers['date']
      ? new Date(headers['date']).toISOString()
      : new Date(occurred).toISOString();

    const from = parseParticipants(headers['from']);
    const toCc = [...parseParticipants(headers['to']), ...parseParticipants(headers['cc'])];
    const isOutbound = from.some((p) => ownEmails.has(p.email));

    const contactIds = new Set<string>();
    for (const p of [...from, ...toCc]) {
      const cid = byEmail.get(p.email);
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

    // Name hints: only the From header (people name themselves there).
    for (const p of from) {
      const cid = byEmail.get(p.email);
      if (!cid || !p.name || p.name.includes('@')) continue;
      const names = nameHints.get(cid) ?? new Map<string, number>();
      names.set(p.name, (names.get(p.name) ?? 0) + 1);
      nameHints.set(cid, names);
    }

    // Suggestions: ONLY people you have written to (recipients of your sent
    // mail). Inbound-only senders are overwhelmingly newsletters and cold
    // outreach — replying is what separates a relationship from a
    // subscription, and repliers show up here via the sent copy anyway.
    const candidates = isOutbound ? toCc : [];
    for (const p of candidates) {
      if (byEmail.has(p.email) || ownEmails.has(p.email) || isMachine(p.email)) continue;
      // Someone already in contacts under a different address: not an "add".
      if (p.name) {
        const parts = p.name.trim().toLowerCase().replace(/[.,]/g, '').split(/\s+/).filter(Boolean);
        if (parts.length >= 2 && knownNames.has(`${parts[0]} ${parts[parts.length - 1]}`)) continue;
      }
      const cur = suggestions.get(p.email);
      if (cur) {
        cur.count += 1;
        if (when > cur.last) cur.last = when;
        if (!cur.name && p.name) cur.name = p.name;
      } else {
        suggestions.set(p.email, { name: p.name, count: 1, last: when });
      }
    }
    return occurred || null;
  };

  // Phase 1: incremental — only meaningful once a first sync has stamped.
  // Pages are processed with pooled GETs, so the stop check happens per page
  // (slight overshoot within a page is fine — upserts dedup).
  if (acct?.last_sync_at) {
    const cutoff = new Date(acct.last_sync_at).getTime() - 24 * 3600_000;
    let pageToken: string | undefined;
    for (let page = 0; page < INCREMENTAL_PAGE_BUDGET; page++) {
      const { ids, next } = await listPage(token, pageToken);
      if (ids.length === 0) break;
      const dates = await pool(ids, 6, processMessage);
      if (dates.some((d) => d !== null && d < cutoff)) break;
      pageToken = next;
      if (!pageToken) break;
    }
  }

  // Phase 2: resumable backfill until LOOKBACK_DAYS is covered. On the very
  // first run (no last_sync_at) this IS the sync — it starts from the newest
  // message anyway.
  let backfillCursor: string | null = acct?.backfill_cursor ?? null;
  let backfillDone = Boolean(acct?.backfill_done);
  if (!backfillDone) {
    const target = Date.now() - LOOKBACK_DAYS * 24 * 3600_000;
    try {
      for (let page = 0; page < BACKFILL_PAGE_BUDGET; page++) {
        const { ids, next } = await listPage(token, backfillCursor ?? undefined);
        if (ids.length === 0) {
          backfillDone = true; // reached the beginning of the mailbox
          break;
        }
        const dates = await pool(ids, 6, processMessage);
        if (dates.some((d) => d !== null && d < target)) {
          backfillDone = true; // dug past the lookback window
          break;
        }
        backfillCursor = next ?? null;
        if (!backfillCursor) {
          backfillDone = true;
          break;
        }
      }
    } catch (e) {
      if (e instanceof StaleCursor) {
        backfillCursor = null; // restart from the top next run
      } else {
        throw e;
      }
    }
  }

  // Persist results only after the interactions land, so a failed upsert
  // reruns cleanly instead of skipping mail.
  if (rows.length > 0) {
    const { error } = await admin
      .from('interactions')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`upsert interactions: ${error.message}`);
  }

  // Flush the enrichment harvest (server-owned tables; the client reads and
  // applies additively — nothing here is pushed back by whole-graph sync).
  if (nameHints.size > 0) {
    const hintRows = [...nameHints].map(([contactId, names]) => {
      let best = '';
      let bestCount = 0;
      let total = 0;
      for (const [n, c] of names) {
        total += c;
        if (c > bestCount) {
          best = n;
          bestCount = c;
        }
      }
      return {
        user_id: cred.user_id,
        contact_id: contactId,
        kind: 'name',
        value: best,
        observed: total,
        updated_at: new Date().toISOString(),
      };
    });
    await admin.from('contact_hints').upsert(hintRows, { onConflict: 'user_id,contact_id,kind' });
  }
  if (suggestions.size > 0) {
    // Read-modify-write the counters (bounded per run). dismissed_at is not
    // in the upsert payload, so dismissals survive future increments.
    const emails = [...suggestions.keys()].slice(0, 300);
    const existing = new Map<string, { count: number; name: string | null }>();
    for (let i = 0; i < emails.length; i += 100) {
      const { data } = await admin
        .from('suggested_contacts')
        .select('email,message_count,name')
        .eq('user_id', cred.user_id)
        .in('email', emails.slice(i, i + 100));
      for (const r of data ?? []) existing.set(r.email, { count: r.message_count, name: r.name });
    }
    const sugRows = emails.map((email) => {
      const s = suggestions.get(email)!;
      const prev = existing.get(email);
      return {
        user_id: cred.user_id,
        email,
        name: prev?.name ?? s.name ?? null,
        message_count: (prev?.count ?? 0) + s.count,
        last_seen_at: s.last,
      };
    });
    await admin.from('suggested_contacts').upsert(sugRows, { onConflict: 'user_id,email' });
  }
  await admin
    .from('connected_accounts')
    .update({
      last_sync_at: new Date().toISOString(),
      backfill_cursor: backfillDone ? null : backfillCursor,
      backfill_done: backfillDone,
    })
    .eq('user_id', cred.user_id)
    .eq('provider', 'gmail')
    .eq('email', cred.email);
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

  // Disconnect: drop credentials + the account row (user-scoped only). With an
  // `email` in the body, only that inbox disconnects; without, all of them.
  if (body.action === 'disconnect' && actingUserId) {
    const email = typeof (body as { email?: unknown }).email === 'string'
      ? ((body as { email: string }).email)
      : null;
    let creds1 = admin.from('gmail_credentials').delete().eq('user_id', actingUserId);
    let accts = admin
      .from('connected_accounts')
      .delete()
      .eq('user_id', actingUserId)
      .eq('provider', 'gmail');
    if (email) {
      creds1 = creds1.eq('email', email);
      accts = accts.eq('email', email);
    }
    await creds1;
    await accts;
    return new Response(JSON.stringify({ disconnected: true }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  // All of a user's connected addresses — outbound detection + never
  // suggesting the user to themselves.
  const emailsByUser = new Map<string, Set<string>>();
  for (const c of creds) {
    const s = emailsByUser.get(c.user_id) ?? new Set<string>();
    s.add(c.email.toLowerCase());
    emailsByUser.set(c.user_id, s);
  }

  // Accounts run concurrently (quota is per Gmail user, so pools don't stack).
  const errors: string[] = [];
  const counts = await Promise.all(
    creds.map(async (cred) => {
      try {
        return await syncAccount(admin, cred, emailsByUser.get(cred.user_id) ?? new Set());
      } catch (e) {
        // Skip a failing account; the rest still sync — but say so in the response.
        errors.push(`${cred.email}: ${e instanceof Error ? e.message : String(e)}`);
        return 0;
      }
    }),
  );
  const total = counts.reduce((a, b) => a + b, 0);

  return new Response(
    JSON.stringify({
      accounts: creds.length,
      newInteractions: total,
      ...(errors.length > 0 ? { errors } : {}),
    }),
    { headers: { ...cors, 'content-type': 'application/json' } },
  );
});
