// Generic IMAP mail-metadata sync — covers iCloud, Yahoo, Fastmail, and
// custom domains via app-specific passwords. A deliberately minimal IMAP
// client over TLS that fetches ENVELOPEs only (from/to/cc/date — never
// bodies), walks INBOX + the sent folder, and feeds the shared harvest.
// Incremental via UID watermark per mailbox.
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

const BACKFILL_MONTHS = 12;
const MAX_FETCH = 2000; // envelopes per run per folder — resumable by UID

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } });

// ---------- tiny IMAP client ----------
class Imap {
  private conn!: Deno.TlsConn;
  private buf = '';
  private tagN = 0;
  private dec = new TextDecoder();
  private enc = new TextEncoder();

  async connect(host: string, port: number): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: host, port });
    await this.readUntil(/^\* (OK|PREAUTH)/m);
  }

  private async readMore(): Promise<void> {
    const chunk = new Uint8Array(65536);
    const n = await this.conn.read(chunk);
    if (n === null) throw new Error('imap: connection closed');
    this.buf += this.dec.decode(chunk.subarray(0, n));
  }

  private async readUntil(re: RegExp): Promise<string> {
    const start = Date.now();
    while (!re.test(this.buf)) {
      if (Date.now() - start > 60000) throw new Error('imap: read timeout');
      await this.readMore();
    }
    const out = this.buf;
    this.buf = '';
    return out;
  }

  async cmd(command: string): Promise<string> {
    const tag = `A${++this.tagN}`;
    await this.conn.write(this.enc.encode(`${tag} ${command}\r\n`));
    const out = await this.readUntil(new RegExp(`^${tag} (OK|NO|BAD)`, 'm'));
    const m = out.match(new RegExp(`^${tag} (OK|NO|BAD)`, 'm'));
    if (m && m[1] !== 'OK') throw new Error(`imap ${command.split(' ')[0]}: ${m[1]}`);
    return out;
  }

  /** Quote per RFC 3501 (password may contain specials). */
  q(s: string): string {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  close(): void {
    try {
      this.conn.close();
    } catch {
      // already closed
    }
  }
}

// ---------- envelope parsing ----------
// ENVELOPE addr: (name adl mailbox host) — we s-expression-parse just enough.
function parseAddrList(sexp: unknown): Participant[] {
  if (!Array.isArray(sexp)) return [];
  const out: Participant[] = [];
  for (const a of sexp) {
    if (!Array.isArray(a) || a.length < 4) continue;
    const name = typeof a[0] === 'string' ? a[0] : undefined;
    const mailbox = typeof a[2] === 'string' ? a[2] : '';
    const host = typeof a[3] === 'string' ? a[3] : '';
    if (!mailbox || !host) continue;
    out.push({ email: `${mailbox}@${host}`.toLowerCase(), name });
  }
  return out;
}

/** Minimal s-expression tokenizer for FETCH ENVELOPE responses. */
function sexp(input: string, pos = { i: 0 }): unknown[] {
  const out: unknown[] = [];
  while (pos.i < input.length) {
    const ch = input[pos.i];
    if (ch === '(') {
      pos.i++;
      out.push(sexp(input, pos));
    } else if (ch === ')') {
      pos.i++;
      return out;
    } else if (ch === '"') {
      let s = '';
      pos.i++;
      while (pos.i < input.length && input[pos.i] !== '"') {
        if (input[pos.i] === '\\') pos.i++;
        s += input[pos.i++];
      }
      pos.i++;
      out.push(s);
    } else if (ch === '{') {
      // literal {n}\r\n....
      const close = input.indexOf('}', pos.i);
      const n = parseInt(input.slice(pos.i + 1, close), 10);
      const start = input.indexOf('\n', close) + 1;
      out.push(input.slice(start, start + n));
      pos.i = start + n;
    } else if (/\s/.test(ch)) {
      pos.i++;
    } else {
      let s = '';
      while (pos.i < input.length && !/[\s()]/.test(input[pos.i])) s += input[pos.i++];
      out.push(s === 'NIL' ? null : s);
    }
  }
  return out;
}

interface ImapCred {
  user_id: string;
  email: string;
  host: string;
  port: number;
  password: string;
  last_uid: number | null;
  sent_folder: string | null;
}

async function syncAccount(admin: SupabaseClient, cred: ImapCred, ownEmails: Set<string>): Promise<number> {
  const imap = new Imap();
  await imap.connect(cred.host, cred.port);
  try {
    await imap.cmd(`LOGIN ${imap.q(cred.email)} ${imap.q(cred.password)}`);

    // Find the sent folder once and remember it.
    let sent = cred.sent_folder;
    if (!sent) {
      const list = await imap.cmd('LIST "" "*"');
      const candidates = ['Sent Messages', 'Sent Items', 'Sent', '[Gmail]/Sent Mail'];
      for (const c of candidates) {
        if (new RegExp(`"${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(list)) {
          sent = c;
          break;
        }
      }
      sent = sent ?? 'Sent';
      await admin
        .from('imap_credentials')
        .update({ sent_folder: sent })
        .eq('user_id', cred.user_id)
        .eq('email', cred.email);
    }

    const idx = await loadContactIndex(admin, cred.user_id);
    const harvest = newHarvest();
    const sinceDate = new Date(Date.now() - BACKFILL_MONTHS * 30 * 86400e3);
    const imapDate = `${sinceDate.getDate()}-${
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][sinceDate.getMonth()]
    }-${sinceDate.getFullYear()}`;

    let maxUid = cred.last_uid ?? 0;
    for (const folder of ['INBOX', sent]) {
      try {
        await imap.cmd(`SELECT ${imap.q(folder)}`);
      } catch {
        continue; // folder missing on this server
      }
      const searchCrit = cred.last_uid ? `UID ${cred.last_uid + 1}:*` : `SINCE ${imapDate}`;
      const search = await imap.cmd(`UID SEARCH ${searchCrit}`);
      const uids = (search.match(/^\* SEARCH([\d ]*)$/m)?.[1] ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .slice(0, MAX_FETCH);
      if (uids.length === 0) continue;

      // Fetch envelopes in ranges of 200 uids.
      for (let i = 0; i < uids.length; i += 200) {
        const range = uids.slice(i, i + 200).join(',');
        const resp = await imap.cmd(`UID FETCH ${range} (UID ENVELOPE)`);
        // Each line: * N FETCH (UID x ENVELOPE (date subject (from) ...))
        for (const m of resp.matchAll(/\* \d+ FETCH \((.*)\)\r?\n?/g)) {
          const parsed = sexp(m[1]);
          const uidIdx = parsed.findIndex((t) => t === 'UID');
          const envIdx = parsed.findIndex((t) => t === 'ENVELOPE');
          if (uidIdx < 0 || envIdx < 0) continue;
          const uid = Number(parsed[uidIdx + 1]);
          const env = parsed[envIdx + 1] as unknown[];
          if (!Array.isArray(env)) continue;
          // ENVELOPE: date subject from sender reply-to to cc bcc in-reply-to msgid
          const date = typeof env[0] === 'string' ? new Date(env[0]) : null;
          const from = parseAddrList(env[2]);
          const toCc = [...parseAddrList(env[5]), ...parseAddrList(env[6])];
          if (!date || isNaN(date.getTime())) continue;
          if (uid > maxUid) maxUid = uid;
          const msg: ParsedMessage = {
            id: `${folder === 'INBOX' ? 'i' : 's'}${uid}${cred.email.replace(/[^a-z0-9]/gi, '').slice(0, 8)}`,
            when: date.toISOString(),
            from,
            toCc,
          };
          processMessage(harvest, idx, ownEmails, cred.user_id, 'int_im', msg);
        }
      }
    }

    const count = await flushHarvest(admin, cred.user_id, harvest);
    await admin
      .from('imap_credentials')
      .update({ last_uid: maxUid, updated_at: new Date().toISOString() })
      .eq('user_id', cred.user_id)
      .eq('email', cred.email);
    await admin.from('connected_accounts').upsert({
      id: `imap_${cred.user_id}_${cred.email}`,
      user_id: cred.user_id,
      provider: 'imap',
      email: cred.email,
      status: 'connected',
      last_sync_at: new Date().toISOString(),
    });
    return count;
  } finally {
    imap.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');

  let body: {
    action?: string;
    email?: string;
    host?: string;
    port?: number;
    password?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    // default sync
  }

  let creds: ImapCred[] = [];
  if (jwt && jwt !== SERVICE_KEY) {
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) return json({ error: 'unauthorized' }, 401);
    const uid = data.user.id;

    if (body.action === 'connect') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const host = String(body.host ?? '').trim().toLowerCase();
      const port = Number(body.port ?? 993);
      const password = String(body.password ?? '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !host || !password) {
        return json({ error: 'invalid' }, 400);
      }
      // Verify the credentials before storing anything.
      const probe = new Imap();
      try {
        await probe.connect(host, port);
        await probe.cmd(`LOGIN ${probe.q(email)} ${probe.q(password)}`);
      } catch (e) {
        return json({ error: 'login_failed', detail: e instanceof Error ? e.message : '' }, 400);
      } finally {
        probe.close();
      }
      await admin.from('imap_credentials').upsert(
        { user_id: uid, email, host, port, password, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,email' },
      );
      await admin.from('connected_accounts').upsert({
        id: `imap_${uid}_${email}`,
        user_id: uid,
        provider: 'imap',
        email,
        status: 'connected',
      });
      return json({ connected: true });
    }

    if (body.action === 'disconnect') {
      let d1 = admin.from('imap_credentials').delete().eq('user_id', uid);
      let d2 = admin.from('connected_accounts').delete().eq('user_id', uid).eq('provider', 'imap');
      if (body.email) {
        d1 = d1.eq('email', body.email);
        d2 = d2.eq('email', body.email);
      }
      await d1;
      await d2;
      return json({ disconnected: true });
    }

    const { data: rows } = await admin.from('imap_credentials').select('*').eq('user_id', uid);
    creds = (rows ?? []) as ImapCred[];
  } else if (jwt === SERVICE_KEY || req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET')) {
    const { data: rows } = await admin.from('imap_credentials').select('*');
    creds = (rows ?? []) as ImapCred[];
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
