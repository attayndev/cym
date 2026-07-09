import { isActiveContact } from '@/lib/classify';
import type { Contact, DB } from '@/lib/types';

/**
 * The evaluate deck: a bounded daily selection of unevaluated imported
 * contacts. Contacts with real correspondence signal (Gmail-matched
 * interactions) always rank first; the zero-signal tail rotates
 * deterministically by day so skipped people resurface organically instead
 * of the same ten nagging forever.
 */

export const DECK_SIZE = 10;

export interface EvaluateCandidate {
  contact: Contact;
  emailCount: number;
  lastEmailAt?: string;
}

/** Local calendar day (not UTC) — the deck should roll over at midnight. */
export function localDayKey(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** FNV-1a over day+id: stable within a day, reshuffles across days. */
function dayHash(id: string, day: string): number {
  const s = `${day}|${id}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function completeness(c: Contact): number {
  return (c.email ? 1 : 0) + (c.phone ? 1 : 0) + (c.birthday ? 1 : 0);
}

/** Everyone still awaiting a verdict: active imported people, unevaluated. */
export function evaluatePool(db: DB): EvaluateCandidate[] {
  const email = new Map<string, { count: number; last: string }>();
  for (const i of db.interactions) {
    if (i.source !== 'email-sync') continue;
    const cur = email.get(i.contactId);
    if (!cur) email.set(i.contactId, { count: 1, last: i.occurredAt });
    else {
      cur.count += 1;
      if (i.occurredAt > cur.last) cur.last = i.occurredAt;
    }
  }
  return db.contacts
    .filter(
      (c) =>
        isActiveContact(c) &&
        c.source === 'import' &&
        !c.evaluatedAt &&
        (c.kind ?? 'unclear') === 'person',
    )
    .map((c) => ({
      contact: c,
      emailCount: email.get(c.id)?.count ?? 0,
      lastEmailAt: email.get(c.id)?.last,
    }));
}

/**
 * The full ranked order for a given day (callers slice to DECK_SIZE after
 * filtering out same-day skips): correspondence count, then recency, then
 * contact completeness, then the daily rotation hash.
 */
export function evaluateRanked(db: DB, now: Date, personaId?: string): EvaluateCandidate[] {
  const day = localDayKey(now);
  return evaluatePool(db)
    .filter((e) => !personaId || e.contact.personaId === personaId)
    .sort(
      (a, b) =>
        b.emailCount - a.emailCount ||
        (b.lastEmailAt ?? '').localeCompare(a.lastEmailAt ?? '') ||
        completeness(b.contact) - completeness(a.contact) ||
        dayHash(a.contact.id, day) - dayHash(b.contact.id, day),
    );
}
