import { getSupabase } from '@/lib/supabase';
import type { Contact, DB } from '@/lib/types';

/**
 * Living cards: contacts subscribed to the subject's own shared card
 * (contact.cardToken). The card fields — the things a person publishes about
 * THEMSELVES — refresh from the source and overwrite; everything the holder
 * wrote (category, cadence, notes, context) is never touched. A rotated
 * token means revoked: keep the last data, retire the subscription.
 */

export interface LiveCard {
  token: string;
  gone?: boolean;
  name?: string;
  tagline?: string | null;
  role?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
}

export function parseCardToken(url: string): string | null {
  const m = url.trim().match(/(?:getcym\.app)?\/c\/([A-Za-z0-9_-]{8,64})\/?$/);
  return m ? m[1] : null;
}

export async function fetchCards(tokens: string[]): Promise<LiveCard[]> {
  const supabase = getSupabase();
  if (!supabase || tokens.length === 0) return [];
  const { data, error } = await supabase.functions.invoke('card-refresh', {
    body: { tokens: tokens.slice(0, 50) },
  });
  if (error || !data) return [];
  return ((data as { cards?: LiveCard[] }).cards ?? []) as LiveCard[];
}

/** The subject's card fields overwrite (that's the feature); split() keeps
 *  the sharer's full name in firstName/lastName shape. */
export function applyCard(contact: Contact, card: LiveCard): Contact {
  if (card.gone) return { ...contact, cardToken: undefined };
  const next: Contact = { ...contact };
  if (card.name?.trim()) {
    const tokens = card.name.trim().split(/\s+/);
    next.firstName = tokens[0];
    next.lastName = tokens.length > 1 ? tokens.slice(1).join(' ') : next.lastName;
  }
  if (card.role != null) next.role = card.role || undefined;
  if (card.company != null) next.company = card.company || undefined;
  if (card.city != null) next.city = card.city || undefined;
  if (card.email) {
    if (!next.email) next.email = card.email;
    else if (
      next.email.toLowerCase() !== card.email.toLowerCase() &&
      !(next.altEmails ?? []).some((e) => e.toLowerCase() === card.email!.toLowerCase())
    ) {
      next.altEmails = [...(next.altEmails ?? []), card.email];
    }
  }
  if (card.phone) {
    const digits = (s: string) => s.replace(/\D/g, '').slice(-10);
    if (!next.phone) next.phone = card.phone;
    else if (
      digits(next.phone) !== digits(card.phone) &&
      !(next.altPhones ?? []).some((p) => digits(p) === digits(card.phone!))
    ) {
      next.altPhones = [...(next.altPhones ?? []), card.phone];
    }
  }
  return next;
}

/** Refresh every subscribed contact. Returns the same reference when nothing
 *  changed (callers skip persistence). */
export async function refreshLivingCards(db: DB): Promise<DB> {
  const subscribed = db.contacts.filter((c) => c.cardToken && c.status !== 'archived');
  if (subscribed.length === 0) return db;
  const cards = await fetchCards(subscribed.map((c) => c.cardToken!));
  if (cards.length === 0) return db;
  const byToken = new Map(cards.map((c) => [c.token, c]));
  let changed = false;
  const contacts = db.contacts.map((c) => {
    const card = c.cardToken ? byToken.get(c.cardToken) : undefined;
    if (!card) return c;
    const next = applyCard(c, card);
    if (JSON.stringify(next) !== JSON.stringify(c)) {
      changed = true;
      return next;
    }
    return c;
  });
  return changed ? { ...db, contacts } : db;
}
