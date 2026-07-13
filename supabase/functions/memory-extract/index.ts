// Relationship Memory extraction (Plus tier). The client sends a short text
// the user typed or approved (draft anchor + sent note, capture context, a
// commitment) and this function distills it into contact_memory rows: durable
// facts, one open thread with an expiry, one life event. Repeat mentions
// reinforce the existing row instead of duplicating it, so memory converges
// on what actually recurs. Sensitive categories are refused at the prompt —
// they survive only in the user's own verbatim notes, never as distilled
// attributes. Memory is built from typed input ONLY; email content never
// reaches this function.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-4-5';
const MAX_TEXT = 2000;
const SOURCES = new Set(['draft', 'capture', 'commitment', 'card', 'note']);

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

const SYSTEM = `You extract relationship memory from a short text a user wrote about staying in touch with one of their contacts. This is a case note about the relationship, not a message.

Extract:
1. FACTS (max 3): durable things about the contact or the relationship worth remembering long-term — family members' names, interests, places, shared history, why they matter. theme = a short specific slug ("daughter-maya", "loves-sailing"). Only what the text actually states; never infer.
2. THREADS (max 1): an open loop with a natural follow-up — something coming up, in progress, or promised ("austin-move", "marathon-training"). Include expires_in_days (7-90): when asking about it would stop making sense.
3. EVENTS (max 1): a life change that just happened (new job, move, wedding, new baby).

NEVER extract, even when the text states it plainly: health or medical conditions, politics, religion, sexuality, immigration status, money troubles, legal matters, or anything a reasonable person would treat as sensitive about a third party. Omit those entirely.

If nothing qualifies, return empty arrays. Distill only — never invent. Write each content sentence in the language of the input text.`;

const SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { theme: { type: 'string' }, content: { type: 'string' } },
        required: ['theme', 'content'],
        additionalProperties: false,
      },
    },
    threads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          content: { type: 'string' },
          expires_in_days: { type: 'integer' },
        },
        required: ['theme', 'content', 'expires_in_days'],
        additionalProperties: false,
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: { theme: { type: 'string' }, content: { type: 'string' } },
        required: ['theme', 'content'],
        additionalProperties: false,
      },
    },
  },
  required: ['facts', 'threads', 'events'],
  additionalProperties: false,
} as const;

interface Extracted {
  facts: { theme: string; content: string }[];
  threads: { theme: string; content: string; expires_in_days: number }[];
  events: { theme: string; content: string }[];
}

function normalizeTheme(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

function clipContent(raw: string): string {
  return raw.trim().slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'unauthorized' }, 401);
  const userId = auth.user.id;

  const { data: profile } = await admin
    .from('profiles')
    .select('is_pro')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile?.is_pro) return json({ error: 'plus_required' }, 403);

  let body: { contactId?: unknown; text?: unknown; source?: unknown; sourceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const contactId = typeof body.contactId === 'string' ? body.contactId.slice(0, 64) : '';
  const source = typeof body.source === 'string' && SOURCES.has(body.source) ? body.source : '';
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId.slice(0, 64) : null;
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  if (!contactId || !source) return json({ error: 'bad_request' }, 400);
  if (text.length < 8) return json({ stored: 0 });

  // The contact must be the caller's own row — keeps the table free of junk
  // ids and makes cross-user writes impossible even with a valid JWT.
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!contact) return json({ error: 'not_found' }, 404);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: text }],
  });
  if (msg.stop_reason === 'refusal') return json({ stored: 0 });
  const block = msg.content.find((b) => b.type === 'text');
  if (!block || !('text' in block)) return json({ stored: 0 });

  let extracted: Extracted;
  try {
    extracted = JSON.parse(block.text) as Extracted;
  } catch {
    return json({ stored: 0 });
  }

  let stored = 0;
  const durable = [
    ...(extracted.facts ?? []).slice(0, 3).map((f) => ({ ...f, kind: 'fact' as const })),
    ...(extracted.events ?? []).slice(0, 1).map((e) => ({ ...e, kind: 'event' as const })),
  ];

  for (const item of durable) {
    const theme = normalizeTheme(item.theme);
    const content = clipContent(item.content);
    if (!theme || !content) continue;

    const { data: existing } = await admin
      .from('contact_memory')
      .select('id, weight, reinforcement_count')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .eq('kind', item.kind)
      .eq('theme', theme)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('contact_memory')
        .update({
          content,
          source,
          source_id: sourceId,
          weight: Number(existing.weight) + 0.5,
          reinforcement_count: existing.reinforcement_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (!error) stored++;
    } else {
      const { error } = await admin.from('contact_memory').insert({
        user_id: userId,
        contact_id: contactId,
        kind: item.kind,
        theme,
        content,
        source,
        source_id: sourceId,
      });
      // A unique-constraint violation means a concurrent request won the
      // race — the memory exists either way.
      if (!error) stored++;
    }
  }

  for (const t of (extracted.threads ?? []).slice(0, 1)) {
    const theme = normalizeTheme(t.theme);
    const content = clipContent(t.content);
    if (!theme || !content) continue;
    const days = Math.min(90, Math.max(7, Math.round(t.expires_in_days) || 30));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await admin.from('contact_memory').upsert(
      {
        user_id: userId,
        contact_id: contactId,
        kind: 'thread',
        theme,
        content,
        source,
        source_id: sourceId,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,contact_id,kind,theme' },
    );
    if (!error) stored++;
  }

  return json({ stored });
});
