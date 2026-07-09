// Public waitlist capture for the marketing site's "Coming soon" popup.
// POST {email, source} → row in waitlist. Rate-limited per IP; duplicate
// emails are fine (first signup wins, quietly).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// Per-isolate speed bump (same pattern as share-card).
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(req: Request): boolean {
  const ip =
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (rateLimited(req)) return json({ error: 'rate_limited' }, 429);

  let body: { email?: unknown; source?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return json({ error: 'invalid' }, 400);
  }
  const source =
    typeof body.source === 'string' && /^[a-z-]{1,20}$/.test(body.source) ? body.source : null;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await admin
    .from('waitlist')
    .upsert({ email, source }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) return json({ error: 'storage' }, 500);

  return json({ ok: true });
});
