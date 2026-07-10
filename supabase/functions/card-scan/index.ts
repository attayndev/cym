// Card/badge scanner: the app POSTs a photo (base64) with the user's JWT; we
// verify it, extract contact fields via the Anthropic Messages API vision
// input, and return structured fields for the capture form. The key never
// ships in a client bundle; the prompt is server-owned. Handles business
// cards and conference badges in any layout or language.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

// Opus: extraction runs once per scan and a wrong email poisons a contact
// forever — accuracy is worth far more than the fraction of a cent saved.
const MODEL = 'claude-opus-4-8';
const DAILY_CAP = 25;
// ~5MB of image after base64 (photos are compressed client-side to q≈0.7).
const MAX_B64_CHARS = 7_500_000;

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

const EXTRACT_TOOL = {
  name: 'save_contact',
  description: 'Record the contact details visible in the photo',
  input_schema: {
    type: 'object' as const,
    properties: {
      found: {
        type: 'boolean',
        description:
          'true only if the photo shows a business card, conference badge, or similar with a person\'s contact details',
      },
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      company: { type: 'string' },
      role: { type: 'string', description: 'job title as printed' },
      email: { type: 'string' },
      phone: { type: 'string', description: 'best single phone number, mobile preferred' },
      city: { type: 'string', description: 'city only, from any address shown' },
      linkedin: { type: 'string', description: 'LinkedIn URL or handle if printed' },
    },
    required: ['found'],
  },
};

const PROMPT =
  'This photo should show a business card or a conference/networking badge. ' +
  'Extract the contact details exactly as printed — do not guess or invent values; ' +
  'omit any field that is not clearly visible. If the text is in another language, ' +
  'keep names and titles as written. If the photo shows neither a card nor a badge, ' +
  'set found to false.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  let body: { image?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const image = body.image ?? '';
  const mediaType = (body.mediaType ?? 'image/jpeg') as (typeof ALLOWED_MEDIA)[number];
  if (!image || image.length > MAX_B64_CHARS) return json({ error: 'bad_image' }, 400);
  if (!ALLOWED_MEDIA.includes(mediaType)) return json({ error: 'bad_media_type' }, 400);

  // Daily cap — charge only after a successful extraction.
  const day = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from('scan_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle();
  if ((usage?.count ?? 0) >= DAILY_CAP) return json({ error: 'scan_limit' }, 429);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  let extracted: Record<string, unknown> | null = null;
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'save_contact' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
    const tool = resp.content.find((b) => b.type === 'tool_use');
    if (tool && tool.type === 'tool_use') extracted = tool.input as Record<string, unknown>;
  } catch (e) {
    console.error('scan model error', e instanceof Error ? e.message : e);
    return json({ error: 'scan_failed' }, 502);
  }
  if (!extracted) return json({ error: 'scan_failed' }, 502);

  await admin.from('scan_usage').upsert(
    { user_id: userId, day, count: (usage?.count ?? 0) + 1 },
    { onConflict: 'user_id,day' },
  );

  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return json({
    found: extracted.found === true,
    firstName: s(extracted.first_name),
    lastName: s(extracted.last_name),
    company: s(extracted.company),
    role: s(extracted.role),
    email: s(extracted.email)?.toLowerCase(),
    phone: s(extracted.phone),
    city: s(extracted.city),
    linkedin: s(extracted.linkedin),
  });
});
