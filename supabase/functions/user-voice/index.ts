// Stateless user-voice distiller (Plus). The client sends its own sent notes
// (already on the phone — never anything from email) and this function
// distills HOW this person writes into a short style profile, returned as
// JSON. It persists NOTHING: no table, no logging of note content. The app
// is the only place a voice profile is ever stored — device-local
// AsyncStorage, deliberately outside the whole-graph sync. Same trust
// envelope as the drafts proxy.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-4-5';
const MAX_NOTES = 25;
const MAX_NOTE_CHARS = 400;
const MAX_TOTAL_CHARS = 6000;
const MAX_VOICE_ROWS = 8;
const MAX_PREF_ROWS = 4;
const MAX_ROW_CHARS = 140;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

const SYSTEM_BASE = `You study a person's own sent messages and distill two short lists: HOW they write, and their tone/channel PREFERENCES. This is style analysis, not content extraction.

VOICE (max 8 short observations): greetings, sign-offs, contractions, emoji habits, punctuation quirks, typical length, recurring phrases or turns of phrase. Describe the pattern, not a single instance.

PREFERENCES (max 4 short observations): tone by relationship (e.g. more formal with colleagues, playful with friends), channel habits (short texts vs longer emails).

Hard rules:
- Style observations only. NEVER include a recipient's name or email.
- NEVER quote more than 6 words verbatim from any note.
- Each observation is a short, general sentence — not a repeat of one message.
- If the notes are too thin or too uniform to say anything real, return fewer items or empty arrays — never invent a pattern.`;

function systemFor(locale: 'en' | 'es'): string {
  return `${SYSTEM_BASE}\n\n${locale === 'es' ? 'Write every observation in Spanish.' : 'Write every observation in English.'}`;
}

const SCHEMA = {
  type: 'object',
  properties: {
    voice: { type: 'array', items: { type: 'string' } },
    preferences: { type: 'array', items: { type: 'string' } },
  },
  required: ['voice', 'preferences'],
  additionalProperties: false,
} as const;

interface Distilled {
  voice: string[];
  preferences: string[];
}

function clip(raw: string, max: number): string {
  return raw.trim().slice(0, max);
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

  let body: { notes?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const rawNotes = Array.isArray(body.notes) ? body.notes : null;
  const locale: 'en' | 'es' = body.locale === 'es' ? 'es' : 'en';
  if (!rawNotes || rawNotes.length === 0 || rawNotes.length > MAX_NOTES) {
    return json({ error: 'bad_request' }, 400);
  }

  const notes = rawNotes
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .map((n) => clip(n, MAX_NOTE_CHARS));
  const totalChars = notes.reduce((sum, n) => sum + n.length, 0);
  if (notes.length === 0 || totalChars > MAX_TOTAL_CHARS) return json({ error: 'bad_request' }, 400);

  const prompt = `My own sent notes, most recent first:\n${notes.map((n) => `- ${n}`).join('\n')}`;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: systemFor(locale),
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (msg.stop_reason === 'refusal') return json({ voice: [], preferences: [] });
  const block = msg.content.find((b) => b.type === 'text');
  if (!block || !('text' in block)) return json({ voice: [], preferences: [] });

  let distilled: Distilled;
  try {
    distilled = JSON.parse(block.text) as Distilled;
  } catch {
    return json({ voice: [], preferences: [] });
  }

  const voice = (distilled.voice ?? [])
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .slice(0, MAX_VOICE_ROWS)
    .map((s) => clip(s, MAX_ROW_CHARS));
  const preferences = (distilled.preferences ?? [])
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .slice(0, MAX_PREF_ROWS)
    .map((s) => clip(s, MAX_ROW_CHARS));

  return json({ voice, preferences });
});
