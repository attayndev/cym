// Public endpoints behind a share token (the token IS the capability):
//   GET  ?token=...  → the sharer's card, card-safe fields only
//   POST {token, firstName, ...} → reciprocal exchange submission (pending)
// Unauthenticated by design (verify_jwt=false); everything is validated here
// and the inbox review step in the app keeps spam out of the graph.
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

const FIELD_CAP = 200;
const NOTE_CAP = 1000;

function clean(value: unknown, cap = FIELD_CAP): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, cap) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (!token) return json({ error: 'not_found' }, 404);

    const { data: link } = await admin
      .from('share_tokens')
      .select('user_id, persona_id')
      .eq('token', token)
      .maybeSingle();
    if (!link) return json({ error: 'not_found' }, 404);

    const { data: profile } = await admin
      .from('profiles')
      .select('name, role, company, email, phone, city')
      .eq('user_id', link.user_id)
      .maybeSingle();
    if (!profile) return json({ error: 'not_found' }, 404);

    const { data: persona } = await admin
      .from('personas')
      .select('tagline, role, company')
      .eq('id', link.persona_id)
      .eq('user_id', link.user_id)
      .maybeSingle();

    // Card-safe fields only — never echo ids.
    return json({
      name: profile.name,
      tagline: persona?.tagline ?? null,
      role: persona?.role ?? profile.role ?? null,
      company: persona?.company ?? profile.company ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      city: profile.city ?? null,
    });
  }

  if (req.method === 'POST') {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid' }, 400);
    }

    const token = typeof body.token === 'string' ? body.token : '';
    const firstName = clean(body.firstName);
    if (!token || !firstName) return json({ error: 'invalid' }, 400);

    const { data: link } = await admin
      .from('share_tokens')
      .select('user_id, persona_id')
      .eq('token', token)
      .maybeSingle();
    if (!link) return json({ error: 'not_found' }, 404);

    const { error } = await admin.from('exchange_submissions').insert({
      user_id: link.user_id,
      persona_id: link.persona_id,
      first_name: firstName,
      last_name: clean(body.lastName),
      email: clean(body.email),
      phone: clean(body.phone),
      company: clean(body.company),
      role: clean(body.role),
      note: clean(body.note, NOTE_CAP),
    });
    if (error) return json({ error: 'failed' }, 500);

    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
});
