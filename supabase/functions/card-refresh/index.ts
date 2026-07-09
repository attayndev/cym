// Living cards: batch-resolve share tokens to their CURRENT card fields so
// holders' copies stay fresh. Serves exactly what the public share page
// serves — self-published card fields only — just batched for subscribers.
// Rotated/dead tokens report gone:true so clients retire the subscription.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_TOKENS = 50;

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

interface CardResult {
  token: string;
  gone?: boolean;
  name?: string;
  tagline?: string | null;
  role?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth.user) return json({ error: 'unauthorized' }, 401);

  let body: { tokens?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }
  const tokens = Array.isArray(body.tokens)
    ? [...new Set(body.tokens.filter((t): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t)))].slice(0, MAX_TOKENS)
    : [];
  if (tokens.length === 0) return json({ cards: [] });

  const { data: links } = await admin
    .from('share_tokens')
    .select('token, user_id, persona_id')
    .in('token', tokens);
  const byToken = new Map((links ?? []).map((l) => [l.token, l]));

  const cards: CardResult[] = [];
  for (const token of tokens) {
    const link = byToken.get(token);
    if (!link) {
      cards.push({ token, gone: true });
      continue;
    }
    const [{ data: profile }, { data: persona }] = await Promise.all([
      admin
        .from('profiles')
        .select('name, role, company, email, phone, city')
        .eq('user_id', link.user_id)
        .maybeSingle(),
      admin
        .from('personas')
        .select('tagline, role, company')
        .eq('id', link.persona_id)
        .maybeSingle(),
    ]);
    if (!profile) {
      cards.push({ token, gone: true });
      continue;
    }
    cards.push({
      token,
      name: profile.name ?? undefined,
      tagline: persona?.tagline ?? null,
      role: persona?.role ?? profile.role ?? null,
      company: persona?.company ?? profile.company ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      city: profile.city ?? null,
    });
  }

  return json({ cards });
});
