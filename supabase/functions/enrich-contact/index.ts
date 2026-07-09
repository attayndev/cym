// Hunter.io enrichment proxy (Plus tier). The client sends ONLY an email
// address; this function checks the global cache, calls Hunter's credit-free
// combined enrichment on a miss, and returns a normalized slice — title,
// company, LinkedIn handle, location. Nothing else from Hunter's response
// leaves this function, and the API key never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY');
const NINJAPEAR_API_KEY = Deno.env.get('NINJAPEAR_API_KEY');

// NinjaPear charges credits even on misses, so it only runs as the fallback
// for work-domain emails Hunter came up empty on. Free-mail lookups would be
// guaranteed wasted credits.
const FREE_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'tuta.io',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'fastmail.com', 'hey.com',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'cox.net', 'earthlink.net',
  'qq.com', '163.com', '126.com', 'yandex.ru', 'yandex.com',
  'web.de', 't-online.de', 'orange.fr', 'free.fr', 'wanadoo.fr', 'libero.it', 'mail.ru',
]);

const DAILY_CAP = 250; // Hunter enrichment is credit-free
const NP_DAILY_CAP = 15; // NinjaPear bills per call (even misses) — keep it on a leash
const NEGATIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // retry not-found after 30d

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

interface Enriched {
  found: boolean;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  companyDomain?: string;
  linkedinHandle?: string;
  city?: string;
  state?: string;
  country?: string;
}

/** Reduce Hunter's combined/find response to the fields we actually use. */
function normalize(data: Record<string, unknown> | null | undefined): Enriched {
  const person = (data?.person ?? null) as Record<string, any> | null;
  const company = (data?.company ?? null) as Record<string, any> | null;
  if (!person && !company) return { found: false };
  const clean = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  return {
    found: true,
    firstName: clean(person?.name?.givenName),
    lastName: clean(person?.name?.familyName),
    title: clean(person?.employment?.title),
    company: clean(person?.employment?.name) ?? clean(company?.name),
    companyDomain: clean(person?.employment?.domain) ?? clean(company?.domain),
    linkedinHandle: clean(person?.linkedin?.handle),
    city: clean(person?.geo?.city) ?? clean(company?.geo?.city),
    state: clean(person?.geo?.state),
    country: clean(person?.geo?.country),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!HUNTER_API_KEY) return json({ error: 'not_configured' }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(jwt);
  const userId = auth.user?.id;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  // Enrichment is a Plus feature — enforce server-side, not just in the UI.
  const { data: profile } = await admin
    .from('profiles')
    .select('is_pro')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile?.is_pro) return json({ error: 'plus_required' }, 403);

  let body: { email?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'invalid' }, 400);

  // Cache first — found entries never expire; not-found retries after 30 days.
  const { data: cached } = await admin
    .from('hunter_cache')
    .select('status,payload,fetched_at')
    .eq('email', email)
    .maybeSingle();
  if (cached) {
    const fresh =
      cached.status === 'found' ||
      Date.now() - new Date(cached.fetched_at).getTime() < NEGATIVE_TTL_MS;
    if (fresh) {
      return json({ ...((cached.payload as Enriched) ?? { found: false }), cached: true });
    }
  }

  // Daily cap (read-modify-write; approximate is fine for a guardrail).
  const day = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from('enrich_usage')
    .select('lookups,np_lookups')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle();
  const lookups = usage?.lookups ?? 0;
  const npLookups = usage?.np_lookups ?? 0;
  if (lookups >= DAILY_CAP) return json({ error: 'daily_cap' }, 429);

  // Waterfall: Hunter first (credit-free, clean provenance), NinjaPear as
  // the paid fallback for work-domain emails Hunter doesn't know.
  // One retry with backoff on rate limits — sweeps arrive in bursts.
  const hunterGet = () =>
    fetch(`https://api.hunter.io/v2/combined/find?email=${encodeURIComponent(email)}`, {
      headers: { 'X-API-KEY': HUNTER_API_KEY },
    });
  let res = await hunterGet();
  if (!res.ok && res.status !== 404) {
    await new Promise((r) => setTimeout(r, 1400));
    res = await hunterGet();
  }

  let result: Enriched;
  if (res.status === 404) {
    result = { found: false };
  } else if (res.ok) {
    const payload = await res.json();
    result = normalize(payload?.data);
  } else {
    // Still failing after retry: report WITHOUT caching and WITHOUT charging
    // the cap — failures must not eat the day's budget (they were: 147 of
    // 250 cap slots burned on upstream 429s on July 9).
    return json({ error: 'upstream', status: res.status }, 502);
  }

  // Charge the cap only now that we have a cacheable answer.
  await admin
    .from('enrich_usage')
    .upsert({ user_id: userId, day, lookups: lookups + 1 }, { onConflict: 'user_id,day' });

  const domain = email.split('@')[1] ?? '';
  if (
    !result.found &&
    NINJAPEAR_API_KEY &&
    domain &&
    !FREE_DOMAINS.has(domain) &&
    npLookups < NP_DAILY_CAP
  ) {
    try {
      const np = await fetch(
        `https://nubela.co/api/v2/employee/profile?work_email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${NINJAPEAR_API_KEY}` } },
      );
      await admin
        .from('enrich_usage')
        .upsert(
          { user_id: userId, day, lookups: lookups + 1, np_lookups: npLookups + 1 },
          { onConflict: 'user_id,day' },
        );
      if (np.ok) {
        const p = await np.json();
        const job = Array.isArray(p?.work_experience) ? p.work_experience[0] : null;
        const clean = (v: unknown): string | undefined =>
          typeof v === 'string' && v.trim() ? v.trim() : undefined;
        // NinjaPear location fields can be UN/LOCODE-style codes ("USNYC",
        // "US-NY") rather than names — only human-readable values pass.
        const place = (v: unknown): string | undefined => {
          const s = clean(v);
          return s && /[a-z]/.test(s) ? s : undefined;
        };
        const mapped: Enriched = {
          found: Boolean(p?.full_name || job),
          firstName: clean(p?.first_name),
          lastName: clean(p?.last_name),
          title: clean(job?.role),
          company: clean(job?.company_name),
          companyDomain: clean(job?.company_website)?.replace(/^https?:\/\/(www\.)?/, ''),
          city: place(p?.city),
          state: place(p?.state),
          country: place(p?.country),
        };
        if (mapped.found) result = mapped;
      }
      // Non-OK falls through to the Hunter (not-found) result — the miss is
      // cached below so the fallback's credits are never spent twice.
    } catch {
      // Fallback is best-effort; the Hunter result stands.
    }
  }

  await admin.from('hunter_cache').upsert({
    email,
    status: result.found ? 'found' : 'none',
    payload: result,
    fetched_at: new Date().toISOString(),
  });

  return json({ ...result, cached: false });
});
