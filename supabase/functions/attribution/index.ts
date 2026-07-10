// Attribution capture (affiliate groundwork). Two actions:
//   click  — the site worker logs a ?ref= landing server-side (IP hashed,
//            never stored raw). Unauthenticated by design; bounded input.
//   signup — the app records the code a user typed at onboarding, once —
//            first attribution wins and can't be rewritten later.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CODE_RE = /^[A-Za-z0-9_-]{2,32}$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body: { action?: string; code?: string; landing?: string; userAgent?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const code = (body.code ?? '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  if (body.action === 'click') {
    const ip = req.headers.get('x-cym-ip') ?? '';
    await admin.from('ref_clicks').insert({
      code,
      landing_page: (body.landing ?? '').slice(0, 200),
      ip_hash: ip ? await sha256(ip) : null,
      user_agent: (body.userAgent ?? '').slice(0, 300),
    });
    return json({ ok: true });
  }

  if (body.action === 'signup') {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: 'unauthorized' }, 401);
    // First attribution wins: ignore conflicts, never rewrite.
    await admin
      .from('signup_attributions')
      .upsert(
        { user_id: userId, code, source: 'onboarding' },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    return json({ ok: true });
  }

  return json({ error: 'bad_action' }, 400);
});
