// AI drafts proxy: the app POSTs a prompt with the user's JWT; we verify it,
// call the Anthropic Messages API with the server-held key, and return the
// draft text. The key never ships in a client bundle. The system prompt is
// server-owned so the endpoint can't be repurposed as a general LLM proxy.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

// Sonnet: near-Opus quality on short, tone-sensitive text at a fraction of the
// cost — drafts are 2-4 sentences from a few hundred tokens of context.
const MODEL = 'claude-sonnet-5';
const MAX_PROMPT_CHARS = 6000;

const SYSTEM = `You ghost-write short personal outreach messages that read like the sender actually typed them on a phone.

Iron rule: never invent facts. If the brief carries no shared history, write an honest short note instead of a fabricated memory — "been too long" beats a meeting that never happened. No invented topics, dates, places, or callbacks.

Voice: plain over clever, specific over smooth, contractions, no letter-writing ceremony. A text can start mid-thought. You'd send this to a friend, not a lead.

Register examples (never reuse their names or details):
- text, thin brief: "hey Sam — realized it's been way too long. how's life at Meridian these days?"
- text, promise due: "Nina — that reading list I promised is coming this week. want it weighted toward hiring or team structure?"
- email, reconnect: "Hi Leo,\n\nStill think about your design-hiring rant from that founder dinner. Just met someone you should know.\n\nWorth an intro?"

You write only the message, nothing else.`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);

  let body: { prompt?: string } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to validation
  }
  const prompt = (body.prompt ?? '').trim();
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return json({ error: 'bad prompt' }, 400);
  }

  // Free tier gets a monthly taste of AI drafts; Plus is unmetered.
  const FREE_DRAFTS_PER_MONTH = 3;
  const { data: profile } = await admin
    .from('profiles')
    .select('is_pro')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!profile?.is_pro) {
    const month = new Date().toISOString().slice(0, 8) + '01';
    const { data: usage } = await admin
      .from('draft_usage')
      .select('count')
      .eq('user_id', data.user.id)
      .eq('month', month)
      .maybeSingle();
    const used = usage?.count ?? 0;
    if (used >= FREE_DRAFTS_PER_MONTH) {
      return json({ error: 'draft_limit', used, limit: FREE_DRAFTS_PER_MONTH }, 402);
    }
    await admin
      .from('draft_usage')
      .upsert({ user_id: data.user.id, month, count: used + 1 }, { onConflict: 'user_id,month' });
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    // Drafts are latency-sensitive (the composer shows a spinner) and short;
    // no extended thinking, but medium effort — low was producing lazy,
    // cliche-ridden notes and the extra ~1s buys noticeably better drafts.
    thinking: { type: 'disabled' },
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: prompt }],
  });

  if (msg.stop_reason === 'refusal') return json({ text: '' });
  const block = msg.content.find((b) => b.type === 'text');
  return json({ text: block && 'text' in block ? block.text.trim() : '' });
});
