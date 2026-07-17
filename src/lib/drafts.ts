import { getLocale, LOCALES, t, tx } from '@/i18n';
import { shortDate } from '@/lib/dates';
import { getSupabase } from '@/lib/supabase';
import type { Channel, Contact, ContextEntry, Nudge, UserProfile } from '@/lib/types';

export type DraftTone = 'sincere' | 'funny' | 'professional';

/** Regenerating cycles tones so each tap gives a genuinely different idea
 *  (Sonnet has no temperature dial — variety comes from the prompt). */
export function toneCycle(contact: Contact): DraftTone[] {
  return contact.category === 'family' || contact.category === 'friend'
    ? ['sincere', 'funny', 'professional']
    : ['professional', 'sincere', 'funny'];
}

const TONE_PROMPT: Record<DraftTone, string> = {
  sincere:
    'Sincere and heartfelt — say something genuine about why this person matters. No jokes.',
  funny:
    'Playful and lightly funny — open with a warm joke, a wry observation, or a callback to our shared history. Never mean, never forced.',
  professional:
    'Polished and professional — friendly but businesslike, the kind of note you could send a valued colleague.',
};

export interface DraftInput {
  contact: Contact;
  context?: ContextEntry;
  nudge: Nudge;
  channel: Channel;
  profile: UserProfile;
  tone?: DraftTone;
  /** Regeneration counter within the same tone — nudges the model to take a
   *  genuinely different angle (there's no temperature dial to turn). */
  variant?: number;
  /** One optional sentence from the user ("congrats on the new job") — when
   *  present it becomes the note's anchor; when blank the AI works from
   *  captured context alone. */
  userContext?: string;
  /** Up to 3 most recent interaction notes for this contact, newest first —
   *  Plus-only memory signal (Phase 0: verbatim notes, no extraction yet). */
  recentNotes?: string[];
  /** Distilled Relationship Memory (Phase 1) — top facts/events then live
   *  threads, already ordered by liveMemory + memoryLines. Plus-only. */
  memoryLines?: string[];
}

/** Phase 0 memory: what gets persisted onto the interaction at Mark sent.
 *  The typed anchor is the strongest signal and wins verbatim; otherwise a
 *  whitespace-collapsed, 200-char head of the sent draft stands in. */
export function composerNote(
  anchor: string | undefined,
  draftText: string | undefined,
): string | undefined {
  const trimmedAnchor = anchor?.trim();
  if (trimmedAnchor) return trimmedAnchor;
  const collapsed = draftText?.replace(/\s+/g, ' ').trim();
  return collapsed ? collapsed.slice(0, 200) : undefined;
}

export interface DraftResult {
  text: string;
  source: 'ai' | 'template';
  /** Free tier's monthly AI-draft allowance is spent — template served. */
  limitReached?: boolean;
}

export function templateDraft({ contact, context, nudge, channel }: DraftInput): string {
  const name = contact.firstName;
  const signoff = channel === 'email' ? `\n\n${t('draft.signoff')}\n` : '';
  const isBirthday = nudge.kind === 'hook' && nudge.headline.key.includes('birthday');

  if (isBirthday) {
    return contact.category === 'family'
      ? t('draft.tpl.birthday.family', { name })
      : t('draft.tpl.birthday.pro', { name }) + signoff;
  }

  if (nudge.kind === 'hook' && context?.commitment) {
    return t('draft.tpl.commitment', { name, commitment: context.commitment }) + signoff;
  }

  if (context?.whereMet) {
    return t('draft.tpl.reconnect.where', { name, where: context.whereMet }) + signoff;
  }

  return contact.category === 'family' || contact.category === 'friend'
    ? t('draft.tpl.checkin.casual', { name })
    : t('draft.tpl.checkin.pro', { name }) + signoff;
}

/** Deterministic, localized subject for the email channel; mirrors templateDraft's branches. */
export function draftSubject({ contact, context, nudge }: DraftInput): string {
  const name = contact.firstName;
  const isBirthday = nudge.kind === 'hook' && nudge.headline.key.includes('birthday');

  if (isBirthday) return t('draft.subj.birthday', { name });
  if (nudge.kind === 'hook' && context?.commitment) return t('draft.subj.commitment');
  return contact.category === 'family' || contact.category === 'friend'
    ? t('draft.subj.checkin.casual')
    : t('draft.subj.checkin.pro');
}

export function buildPrompt(input: DraftInput): string {
  const { contact, context, nudge, channel, profile } = input;
  const language = LOCALES[getLocale()];
  const tone = input.tone ?? toneCycle(contact)[0];
  const lines = [
    `Recipient: ${[contact.firstName, contact.lastName].filter(Boolean).join(' ')}`,
    `Relationship: ${contact.category}${contact.role ? `, their role: ${contact.role} at ${contact.company ?? 'their company'}` : ''}`,
    context?.whereMet ? `Where we met: ${context.whereMet}` : null,
    context?.discussed ? `What we discussed: ${context.discussed}` : null,
    context?.whyMatters ? `Why they matter to me: ${context.whyMatters}` : null,
    context?.commitment
      ? `What I committed to: ${context.commitment}${context.commitmentDueAt ? ` (due ${shortDate(context.commitmentDueAt)})` : ''}`
      : null,
    input.userContext?.trim()
      ? `What I want this note to be about (make this the anchor): ${input.userContext.trim()}`
      : null,
    input.memoryLines && input.memoryLines.length > 0
      ? `What you know about them (distilled from your own past notes — use only what fits):\n${input.memoryLines
          .slice(0, 6)
          .map((n) => `- ${n}`)
          .join('\n')}`
      : null,
    input.recentNotes && input.recentNotes.length > 0
      ? `Recent threads with this person, newest first — weave one in naturally only if it fits:\n${input.recentNotes
          .slice(0, 3)
          .map((n) => `- ${n.slice(0, 200)}`)
          .join('\n')}`
      : null,
    `The occasion for reaching out: ${tx(nudge.reason)}`,
    `The move: ${tx(nudge.suggestedAction)}`,
    `The tone: ${TONE_PROMPT[tone]}`,
    input.variant
      ? `Variation: this is take #${input.variant + 1} for the same request — the earlier takes didn't land. Choose a noticeably different angle, opener, and structure than an obvious first draft would use.`
      : null,
  ].filter(Boolean);

  return `Draft a short ${channel === 'email' ? 'email (no subject line)' : 'text message'} from me (${profile.name}) to reconnect with someone.

${lines.join('\n')}

Write the message in ${language}. Hard rules:
- Use ONLY the facts above. If where-we-met or what-we-discussed isn't listed, don't allude to it and don't invent a stand-in — write an honest short note instead. Fabricating a memory is the one unforgivable failure.
- Sound like something I'd actually type: contractions, plain words, no letter ceremony. A text may start mid-thought; only an email opens with their name and signs off with my first name. A text gets no signature.
- Banned, and everything in their family: "I hope this finds you well", "it's been a while since we last spoke", "I've been thinking about you", "would love to", "touch base", "circle back", "hope all is well", "just checking in".
- End with exactly one reason to reply: a specific, easy-to-answer question or a concrete offer drawn from the facts — or, when the facts are thin, one simple open question about them.
- Length: 1-3 sentences for a text; 3-5 short sentences for an email across 2-3 paragraphs separated by blank lines. No exclamation overload, no placeholder brackets.
Output the message only.`;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicTextBlock[];
}

/**
 * Two modes:
 *  - If EXPO_PUBLIC_DRAFTS_ENDPOINT is set, POST the draft input to your own
 *    backend proxy (the production path — no API key in the app bundle).
 *  - Else if EXPO_PUBLIC_ANTHROPIC_API_KEY is set, call the Messages API
 *    directly via fetch (dev only). We use fetch rather than the Node SDK
 *    because that SDK imports node:fs and won't bundle for React Native/web.
 *  - Else fall back to context-aware templates.
 */
/** Free-plan drafts carry a small brand line the user can simply delete —
 *  the growth loop is opt-out-per-message, never forced on paying users. */
export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const result = await generateDraftInner(input);
  if (input.profile.isPro) return result;
  return { ...result, text: `${result.text}\n\n${t('draft.poweredBy')}` };
}

async function generateDraftInner(input: DraftInput): Promise<DraftResult> {
  const endpoint = process.env.EXPO_PUBLIC_DRAFTS_ENDPOINT;
  // Direct API key is a DEV-ONLY convenience — never honored in a production
  // build, so a leaked EXPO_PUBLIC_ANTHROPIC_API_KEY can't ship a live key to
  // users. Production always routes through the JWT-authed proxy above.
  const apiKey = __DEV__ ? process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY : undefined;
  const prompt = buildPrompt(input);
  const system =
    'You ghost-write brief, warm, personal outreach messages. You write only the message, nothing else.';

  try {
    if (endpoint) {
      // The proxy (supabase/functions/drafts) requires the signed-in user's
      // JWT; without a session we fall straight through to templates.
      const session = (await getSupabase()?.auth.getSession())?.data.session;
      if (!session) return { text: templateDraft(input), source: 'template' };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text?.trim()) return { text: data.text.trim(), source: 'ai' };
      } else if (res.status === 402) {
        // Free allowance spent: serve the template and say so.
        return { text: templateDraft(input), source: 'template', limitReached: true };
      }
      return { text: templateDraft(input), source: 'template' };
    }

    if (apiKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as AnthropicResponse;
        const block = data.content?.find((b) => b.type === 'text');
        if (block?.text?.trim()) return { text: block.text.trim(), source: 'ai' };
      }
      return { text: templateDraft(input), source: 'template' };
    }

    return { text: templateDraft(input), source: 'template' };
  } catch {
    return { text: templateDraft(input), source: 'template' };
  }
}
