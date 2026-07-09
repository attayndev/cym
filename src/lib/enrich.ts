import { isActiveContact } from '@/lib/classify';
import { getSupabase } from '@/lib/supabase';
import type { Contact, DB } from '@/lib/types';

/**
 * Tier-0 enrichment: everything here derives from the user's own data —
 * harvested Gmail display names (server-owned contact_hints, read-only here)
 * and work-email domains. Application is strictly additive: only empty
 * fields are ever filled, and only with conservative matches.
 */

export interface NameHint {
  contactId: string;
  value: string;
}

export interface InboxSuggestion {
  email: string;
  name: string | null;
  messageCount: number;
  lastSeenAt: string | null;
}

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'tuta.io',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'fastmail.com', 'hey.com',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'cox.net', 'earthlink.net',
  'qq.com', '163.com', '126.com', 'yandex.ru', 'yandex.com',
  'web.de', 't-online.de', 'orange.fr', 'free.fr', 'wanadoo.fr', 'libero.it', 'mail.ru',
]);

const GENERIC_SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);

/** "julia@stripe.com" → "Stripe"; free-mail and unknown shapes → undefined. */
export function companyFromDomain(email?: string): string | undefined {
  const domain = email?.split('@')[1]?.toLowerCase();
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return undefined;
  const parts = domain.split('.');
  if (parts.length < 2) return undefined;
  const sld =
    parts.length >= 3 && GENERIC_SECOND_LEVEL.has(parts[parts.length - 2])
      ? parts[parts.length - 3]
      : parts[parts.length - 2];
  if (!sld || sld.length < 2 || /\d/.test(sld)) return undefined;
  return sld.charAt(0).toUpperCase() + sld.slice(1);
}

/** Fill a missing last name from a harvested display name — only when the
 *  hint clearly extends the first name we already have ("Mike" + hint
 *  "Mike Rowe" → "Rowe"). */
export function lastNameFromHint(contact: Contact, hint: string): string | undefined {
  if (contact.lastName) return undefined;
  const tokens = hint.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return undefined;
  if (tokens[0].toLowerCase() !== contact.firstName.trim().toLowerCase()) return undefined;
  const last = tokens.slice(1).join(' ');
  if (/[@\d<>]/.test(last)) return undefined;
  return last;
}

/** Apply hints + domain inference. Returns the same reference when nothing
 *  changed, so callers can cheaply skip persistence. */
export function applyEnrichment(db: DB, hints: NameHint[]): DB {
  const hintById = new Map(hints.map((h) => [h.contactId, h.value]));
  let changed = false;
  const contacts = db.contacts.map((c) => {
    if (!isActiveContact(c) || c.kind === 'business') return c;
    let next = c;
    const hint = hintById.get(c.id);
    if (hint) {
      const lastName = lastNameFromHint(next, hint);
      if (lastName) next = { ...next, lastName };
    }
    if (!next.company) {
      const company = companyFromDomain(next.email);
      if (company) next = { ...next, company };
    }
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...db, contacts } : db;
}

export async function fetchNameHints(): Promise<NameHint[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase.from('contact_hints').select('contact_id,value').eq('kind', 'name');
  return (data ?? []).map((r) => ({ contactId: r.contact_id as string, value: r.value as string }));
}

/** Frequent correspondents with no contact — RLS scopes to the signed-in
 *  user; callers re-filter against local contacts before showing. */
export async function fetchInboxSuggestions(limit: number): Promise<InboxSuggestion[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from('suggested_contacts')
    .select('email,name,message_count,last_seen_at')
    .is('dismissed_at', null)
    .gte('message_count', 3)
    .order('message_count', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    email: r.email as string,
    name: (r.name as string | null) ?? null,
    messageCount: r.message_count as number,
    lastSeenAt: (r.last_seen_at as string | null) ?? null,
  }));
}

export async function dismissInboxSuggestion(email: string): Promise<void> {
  await getSupabase()
    ?.from('suggested_contacts')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('email', email);
}

// --- Hunter.io enrichment (Plus) --------------------------------------------

export interface HunterResult {
  found: boolean;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  linkedinHandle?: string;
  city?: string;
}

/** Server-proxied Hunter lookup: only the email leaves the device, and the
 *  function enforces the Plus check + daily cap. Null on any failure. */
export async function enrichFromHunter(email: string): Promise<HunterResult | null> {
  const supabase = getSupabase();
  if (!supabase || !email) return null;
  const { data, error } = await supabase.functions.invoke('enrich-contact', { body: { email } });
  if (error || !data) return null;
  return data as HunterResult;
}

export interface EnrichConflict {
  field: 'role' | 'company';
  current: string;
  proposed: string;
}

/** Strip punctuation and legal suffixes so "Acme, Inc." ≈ "Acme". */
function normOrg(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'’]/g, '')
    .replace(/\s+(inc|llc|ltd|corp|co|company|gmbh|sa|srl|plc)$/i, '')
    .trim();
}

/** Where Hunter's fresher public data DISAGREES with stored details. The
 *  refresh flow shows these as diffs — overwrite only on the user's tap. */
export function hunterConflicts(contact: Contact, result: HunterResult): EnrichConflict[] {
  if (!result.found) return [];
  if (!sameHuman(contact, result)) return [];
  const out: EnrichConflict[] = [];
  if (
    contact.role &&
    result.title &&
    contact.role.trim().toLowerCase() !== result.title.trim().toLowerCase()
  ) {
    out.push({ field: 'role', current: contact.role, proposed: result.title });
  }
  if (contact.company && result.company && normOrg(contact.company) !== normOrg(result.company)) {
    out.push({ field: 'company', current: contact.company, proposed: result.company });
  }
  return out;
}

/** Identity guard: refuse to apply enrichment when the returned person's
 *  name clearly belongs to someone else (recycled address, catch-all domain,
 *  vendor error). Missing names pass — absence isn't evidence of mismatch. */
export function sameHuman(contact: Contact, result: HunterResult): boolean {
  if (!result.found) return true;
  const norm = (x?: string) => (x ?? '').trim().toLowerCase().replace(/[.,]/g, '');
  const rFirst = norm(result.firstName).split(/\s+/)[0];
  const cFirst = norm(contact.firstName).split(/\s+/)[0];
  if (rFirst && cFirst && rFirst !== cFirst) return false;
  const rLast = norm(result.lastName).split(/\s+/).pop() ?? '';
  const cLast = norm(contact.lastName).split(/\s+/).pop() ?? '';
  if (rLast && cLast && rLast !== cLast) return false;
  return true;
}

/** The additive patch a Hunter result yields for a contact: only blank
 *  fields, never overwrites. Null when there's nothing new. */
export function hunterPatch(
  contact: Contact,
  result: HunterResult,
): Partial<Pick<Contact, 'lastName' | 'role' | 'company' | 'city' | 'linkedin'>> | null {
  if (!result.found) return null;
  if (!sameHuman(contact, result)) return null;
  const patch: Record<string, string> = {};
  if (!contact.lastName && result.lastName) patch.lastName = result.lastName;
  if (!contact.role && result.title) patch.role = result.title;
  if (!contact.company && result.company) patch.company = result.company;
  if (!contact.city && result.city) patch.city = result.city;
  if (!contact.linkedin && result.linkedinHandle) patch.linkedin = result.linkedinHandle;
  return Object.keys(patch).length > 0 ? patch : null;
}
