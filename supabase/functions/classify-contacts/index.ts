// AI contact classifier: the app sends contacts the heuristics couldn't decide
// (kind = 'unclear'), Haiku sorts them into person/business/unclear, and the
// client applies the results locally (sync persists them — no server-side
// writes here, so the whole-graph client push can't clobber anything).
// Only directory fields travel: name, company, email. Never notes/context.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

// Classification is bulk + cheap: Haiku sorts thousands of rows for pennies.
const MODEL = 'claude-haiku-4-5';
const MAX_ITEMS = 200; // per invocation; the app loops batches
const CHUNK = 40; // per model call

const SYSTEM = `You classify address-book entries. For each entry decide:
- "person": a human being the user plausibly knows (real human name; a company field alone does not make someone a business — people work at companies).
- "business": a company, store, restaurant, service, office, clinic, hotline, or automated sender (name reads like an organization, or the email is a role address like info@/support@).
- "unclear": genuinely impossible to tell.
Lean "person" when the name looks like a real human name. Respond for every entry.`;

const SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['person', 'business', 'unclear'] },
        },
        required: ['id', 'kind'],
        additionalProperties: false,
      },
    },
  },
  required: ['classifications'],
  additionalProperties: false,
} as const;

interface Entry {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

const clip = (s: unknown) => (typeof s === 'string' ? s.slice(0, 120) : undefined);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);

  let body: { contacts?: Entry[] } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const contacts = (body.contacts ?? [])
    .filter((c) => typeof c?.id === 'string')
    .slice(0, MAX_ITEMS)
    .map((c) => ({
      id: c.id.slice(0, 64),
      firstName: clip(c.firstName),
      lastName: clip(c.lastName),
      company: clip(c.company),
      email: clip(c.email),
    }));
  if (contacts.length === 0) return json({ kinds: [] });

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const kinds: { id: string; kind: 'person' | 'business' | 'unclear' }[] = [];

  for (let i = 0; i < contacts.length; i += CHUNK) {
    const chunk = contacts.slice(i, i + CHUNK);
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(chunk) }],
    });
    if (msg.stop_reason === 'refusal') continue;
    const block = msg.content.find((b) => b.type === 'text');
    if (!block || !('text' in block)) continue;
    try {
      const parsed = JSON.parse(block.text) as { classifications?: typeof kinds };
      const valid = new Set(chunk.map((c) => c.id));
      for (const k of parsed.classifications ?? []) {
        if (valid.has(k.id) && ['person', 'business', 'unclear'].includes(k.kind)) {
          kinds.push(k);
        }
      }
    } catch {
      // Malformed chunk response: skip; the app retries those ids next run.
    }
  }

  return json({ kinds });
});
