// Public endpoints behind a share token (the token IS the capability):
//   GET  ?token=...  → the sharer's card, card-safe fields only
//   POST {token, firstName, ...} → reciprocal exchange submission (pending)
// Unauthenticated by design (verify_jwt=false); everything is validated here
// and the inbox review step in the app keeps spam out of the graph.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

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
const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function clean(value: unknown, cap = FIELD_CAP): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, cap) : null;
}

// Self-reported MM-DD, no year. A malformed birthday is never worth losing a
// lead over — on mismatch we just drop the field, we don't reject the
// submission.
function cleanBirthday(value: unknown): string | null {
  const trimmed = clean(value);
  return trimmed && BIRTHDAY_RE.test(trimmed) ? trimmed : null;
}

// Per-IP submission limiter for the public POST. Per-isolate memory (resets on
// cold start, not shared across regions) — a speed bump against casual abuse,
// not a fortress; Turnstile is the upgrade path if it's ever needed.
const RATE_LIMIT = 10; // submissions per window per IP
const RATE_WINDOW_MS = 60 * 60 * 1000;
const submissions = new Map<string, number[]>();

function rateLimited(req: Request): boolean {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const now = Date.now();
  const recent = (submissions.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  submissions.set(ip, recent);
  // Cap the map so a scan across many IPs can't grow memory unboundedly.
  if (submissions.size > 10_000) submissions.clear();
  return false;
}

type Locale = 'en' | 'es';
const PUSH_COPY: Record<Locale, { title: (n: string) => string; body: string }> = {
  en: {
    title: (n) => `${n} shared their details`,
    body: 'In your inbox — add them while the conversation is fresh.',
  },
  es: {
    // No gendered object pronoun: the sharer's name is all we know about them.
    title: (n) => `${n} compartió sus datos`,
    body: 'Está en tu bandeja — añade mientras la conversación sigue fresca.',
  },
};

/**
 * Tells the card's owner, right now, that someone filled in the share-back
 * form. This is the ONLY live signal these submissions have — there's no cron
 * covering them — so it fires on the event rather than on a daily schedule.
 *
 * Deliberately never throws and never fails the submission: the scanner has
 * already done their part, and losing their details because a push failed
 * would be the worse bug. The exp.host call is time-boxed so a slow push
 * can't leave them staring at a spinner.
 */
async function notifyOwner(
  admin: SupabaseClient,
  userId: string,
  firstName: string,
): Promise<void> {
  const [{ data: profile }, { data: tokens }] = await Promise.all([
    admin
      .from('profiles')
      .select('notifications_enabled, locale')
      .eq('user_id', userId)
      .maybeSingle(),
    admin.from('push_tokens').select('token').eq('user_id', userId),
  ]);

  // One notifications toggle governs the whole app — respect it here too.
  if (!profile?.notifications_enabled) return;
  if (!tokens?.length) return;

  const copy = PUSH_COPY[profile.locale === 'es' ? 'es' : 'en'];
  const messages = tokens.slice(0, 100).map((t) => ({
    to: t.token,
    title: copy.title(firstName),
    body: copy.body,
    sound: 'default',
    // For a future tap-to-Inbox handler; today's builds just open the app.
    data: { route: '/inbox' },
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(5000),
  });
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
      .select('tagline, role, company, display_name, email, phone')
      .eq('id', link.persona_id)
      .eq('user_id', link.user_id)
      .maybeSingle();

    // Card-safe fields only — never echo ids.
    return json({
      name: persona?.display_name ?? '',
      tagline: persona?.tagline ?? null,
      role: persona?.role ?? null,
      company: persona?.company ?? null,
      email: persona?.email ?? null,
      phone: persona?.phone ?? null,
      city: profile.city ?? null,
    });
  }

  if (req.method === 'POST') {
    if (rateLimited(req)) return json({ error: 'rate_limited' }, 429);
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
      birthday: cleanBirthday(body.birthday),
    });
    if (error) return json({ error: 'failed' }, 500);

    try {
      await notifyOwner(admin, link.user_id, firstName);
    } catch {
      // The row is saved; a missed push is recoverable, a lost lead isn't.
    }

    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
});
