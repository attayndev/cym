import { getLocale, LOCALES, t, tx } from '@/i18n';
import { shortDate } from '@/lib/dates';
import type { Channel, Contact, ContextEntry, Nudge, UserProfile } from '@/lib/types';

export interface DraftInput {
  contact: Contact;
  context?: ContextEntry;
  nudge: Nudge;
  channel: Channel;
  profile: UserProfile;
}

export interface DraftResult {
  text: string;
  source: 'ai' | 'template';
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

function buildPrompt(input: DraftInput): string {
  const { contact, context, nudge, channel, profile } = input;
  const language = LOCALES[getLocale()];
  const lines = [
    `Recipient: ${[contact.firstName, contact.lastName].filter(Boolean).join(' ')}`,
    `Relationship: ${contact.category}${contact.role ? `, their role: ${contact.role} at ${contact.company ?? 'their company'}` : ''}`,
    context?.whereMet ? `Where we met: ${context.whereMet}` : null,
    context?.discussed ? `What we discussed: ${context.discussed}` : null,
    context?.whyMatters ? `Why they matter to me: ${context.whyMatters}` : null,
    context?.commitment
      ? `What I committed to: ${context.commitment}${context.commitmentDueAt ? ` (due ${shortDate(context.commitmentDueAt)})` : ''}`
      : null,
    `The occasion for reaching out: ${tx(nudge.reason)}`,
    `The move: ${tx(nudge.suggestedAction)}`,
  ].filter(Boolean);

  return `Draft a short ${channel === 'email' ? 'email (no subject line)' : 'text message'} from me (${profile.name}) to reconnect with someone.

${lines.join('\n')}

Write the message in ${language}. Requirements: warm and specific, sounds like a real person, references our shared context naturally, 2-4 sentences for text / 3-5 for email, no placeholder brackets, no exclamation overload. Output the message only.`;
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
export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const endpoint = process.env.EXPO_PUBLIC_DRAFTS_ENDPOINT;
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  const prompt = buildPrompt(input);
  const system =
    'You ghost-write brief, warm, personal outreach messages. You write only the message, nothing else.';

  try {
    if (endpoint) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, system, channel: input.channel }),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text?.trim()) return { text: data.text.trim(), source: 'ai' };
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
          model: 'claude-opus-4-8',
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
