import type { Contact, DB } from '@/lib/types';

/**
 * Merge duplicate imported contacts. The device Contacts API returns one row
 * PER ACCOUNT (an "Alex Lezhen" saved in both iCloud and Google arrives
 * twice, even though the phone displays them merged), so imports could mint
 * the same person twice. Merging is additive: the keeper absorbs any fields
 * it was missing, extra addresses become alt emails/phones, and the
 * duplicate's engine state (hooks/nudges) is dropped for regeneration.
 */

const norm = (s?: string) => (s ?? '').trim().toLowerCase();
// Last 10 digits: "+1 555 111 2222" and "(555) 111-2222" are the same line.
const phoneDigits = (s?: string) => (s ?? '').replace(/\D/g, '').slice(-10);

/** Middle-initial-proof name key: first word of the first name + last word
 *  of the last name — "Danny Bibi" and "Danny E. Bibi" are the same person.
 *  Null when there's no usable last name. */
export function looseNameKey(first?: string, last?: string): string | null {
  const f = norm(first).replace(/[.,]/g, '').split(/\s+/)[0];
  const l = norm(last).replace(/[.,]/g, '').split(/\s+/).filter(Boolean).pop();
  return f && l ? `${f} ${l}` : null;
}

/** Emails+phones of a contact, normalized — the corroboration evidence. */
function contactEvidence(c: Contact): { emails: Set<string>; phones: Set<string> } {
  return {
    emails: new Set(
      [c.email, c.workEmail, ...(c.altEmails ?? [])].filter(Boolean).map((e) => norm(e!)),
    ),
    phones: new Set(
      [c.phone, c.workPhone, ...(c.altPhones ?? [])].filter(Boolean).map((p) => phoneDigits(p!)),
    ),
  };
}

function sharesEvidence(a: Contact, b: Contact): boolean {
  const ea = contactEvidence(a);
  const eb = contactEvidence(b);
  for (const e of ea.emails) if (eb.emails.has(e)) return true;
  for (const p of ea.phones) if (eb.phones.has(p)) return true;
  return false;
}

function mergeKey(c: Contact): string | null {
  const first = norm(c.firstName);
  const last = norm(c.lastName);
  if (!first) return null;
  // EXACT full names auto-merge; bare first names ("Mike") only merge when a
  // primary email or phone also matches. Loose name matches (middle-initial
  // variants) auto-merge only with shared email/phone — see the second pass
  // in dedupeImports; anything else becomes a human-review candidate.
  if (last) return `${c.personaId}|${first} ${last}`;
  if (c.email) return `${c.personaId}|${first}|${norm(c.email)}`;
  const digits = phoneDigits(c.phone);
  return digits ? `${c.personaId}|${first}|p${digits}` : null;
}

function fieldScore(c: Contact): number {
  return [c.email, c.phone, c.company, c.role, c.city, c.birthday, c.linkedin].filter(Boolean)
    .length;
}

/** Keeper absorbs the duplicate's data, additively. */
function absorb(keeper: Contact, dupe: Contact): Contact {
  // Work address/number are resolved first (keeper wins) so they're excluded
  // from the alt-email/alt-phone sweep below like email/phone are.
  const workEmail = keeper.workEmail ?? dupe.workEmail;
  const workPhone = keeper.workPhone ?? dupe.workPhone;

  const emails = new Set(
    [keeper.email, workEmail, ...(keeper.altEmails ?? [])].filter(Boolean).map((e) => e!.toLowerCase()),
  );
  const altEmails = [...(keeper.altEmails ?? [])];
  for (const e of [dupe.email, dupe.workEmail, ...(dupe.altEmails ?? [])]) {
    if (e && !emails.has(e.toLowerCase())) {
      emails.add(e.toLowerCase());
      altEmails.push(e);
    }
  }
  const digits = (s: string) => s.replace(/\D/g, '');
  const phones = new Set(
    [keeper.phone, workPhone, ...(keeper.altPhones ?? [])].filter(Boolean).map((p) => digits(p!)),
  );
  const altPhones = [...(keeper.altPhones ?? [])];
  for (const p of [dupe.phone, dupe.workPhone, ...(dupe.altPhones ?? [])]) {
    if (p && !phones.has(digits(p))) {
      phones.add(digits(p));
      altPhones.push(p);
    }
  }
  return {
    ...keeper,
    lastName: keeper.lastName ?? dupe.lastName,
    email: keeper.email ?? dupe.email,
    phone: keeper.phone ?? dupe.phone,
    workEmail,
    workPhone,
    company: keeper.company ?? dupe.company,
    role: keeper.role ?? dupe.role,
    city: keeper.city ?? dupe.city,
    birthday: keeper.birthday ?? dupe.birthday,
    linkedin: keeper.linkedin ?? dupe.linkedin,
    altEmails: altEmails.length > 0 ? altEmails : undefined,
    altPhones: altPhones.length > 0 ? altPhones : undefined,
    evaluatedAt: keeper.evaluatedAt ?? dupe.evaluatedAt,
    importance: Math.max(keeper.importance, dupe.importance) as Contact['importance'],
    // A deliberate categorization beats the import default.
    category: keeper.category !== 'other' ? keeper.category : dupe.category,
  };
}

function applyMerges(
  db: DB,
  keeperFor: Map<string, string>,
  merged: Map<string, Contact>,
): DB {

  if (keeperFor.size === 0) return db;
  const keeperHasContext = new Set(
    db.contexts.filter((x) => !keeperFor.has(x.contactId)).map((x) => x.contactId),
  );
  return {
    ...db,
    contacts: db.contacts
      .filter((c) => !keeperFor.has(c.id))
      .map((c) => merged.get(c.id) ?? c),
    // Manual history moves to the keeper; email-sync rows are dropped — the
    // next Gmail sync recreates them under the keeper's id (server-owned).
    interactions: db.interactions
      .filter((i) => !(keeperFor.has(i.contactId) && i.source === 'email-sync'))
      .map((i) =>
        keeperFor.has(i.contactId) ? { ...i, contactId: keeperFor.get(i.contactId)! } : i,
      ),
    // A duplicate's context moves over only when the keeper has none.
    contexts: db.contexts
      .map((x) => {
        const keeperId = keeperFor.get(x.contactId);
        if (!keeperId) return x;
        if (keeperHasContext.has(keeperId)) return null;
        keeperHasContext.add(keeperId);
        return { ...x, contactId: keeperId };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    // Engine state is regenerable — drop the duplicate's to avoid twin nudges.
    hooks: db.hooks.filter((h) => !keeperFor.has(h.contactId)),
    nudges: db.nudges.filter((n) => !keeperFor.has(n.contactId)),
  };
}

/** Returns the same reference when there was nothing to merge. Two passes:
 *  exact-name (and evidence-keyed bare-name) groups merge outright; loose
 *  name variants merge only when they share an email or phone. Ambiguous
 *  loose pairs are left alone — findMergeCandidates surfaces them for a
 *  human verdict. */
export function dedupeImports(db: DB): DB {
  const groups = new Map<string, Contact[]>();
  for (const c of db.contacts) {
    if (c.status === 'archived') continue;
    const key = mergeKey(c);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const keeperFor = new Map<string, string>();
  const merged = new Map<string, Contact>();
  const absorbGroup = (list: Contact[]) => {
    const sorted = [...list].sort(
      (a, b) => fieldScore(b) - fieldScore(a) || a.createdAt.localeCompare(b.createdAt),
    );
    let keeper = merged.get(sorted[0].id) ?? sorted[0];
    for (const dupe of sorted.slice(1)) {
      keeper = absorb(keeper, dupe);
      keeperFor.set(dupe.id, keeper.id);
    }
    merged.set(keeper.id, keeper);
  };
  for (const list of groups.values()) {
    if (list.length >= 2) absorbGroup(list);
  }

  // Pass 2: loose-name variants, corroborated by shared email/phone only.
  const survivors = db.contacts
    .filter((c) => c.status !== 'archived' && !keeperFor.has(c.id))
    .map((c) => merged.get(c.id) ?? c);
  const byLoose = new Map<string, Contact[]>();
  for (const c of survivors) {
    const key = looseNameKey(c.firstName, c.lastName);
    if (!key) continue;
    const k = `${c.personaId}|${key}`;
    byLoose.set(k, [...(byLoose.get(k) ?? []), c]);
  }
  for (const list of byLoose.values()) {
    if (list.length < 2) continue;
    // Merge evidence-connected subsets; leave the rest for human review.
    const pool = [...list];
    while (pool.length > 1) {
      const head = pool.shift()!;
      const connected = [head, ...pool.filter((c) => sharesEvidence(head, c))];
      if (connected.length >= 2) {
        for (const c of connected.slice(1)) pool.splice(pool.indexOf(c), 1);
        absorbGroup(connected);
      }
    }
  }

  return applyMerges(db, keeperFor, merged);
}

export interface MergeCandidate {
  keeperId: string;
  dupeId: string;
  /** Stable identity for "keep separate" dismissals. */
  pairKey: string;
}

/** Loose-name pairs WITHOUT shared evidence — the human-review queue. */
export function findMergeCandidates(db: DB): MergeCandidate[] {
  const byLoose = new Map<string, Contact[]>();
  for (const c of db.contacts) {
    if (c.status === 'archived') continue;
    const key = looseNameKey(c.firstName, c.lastName);
    if (!key) continue;
    const k = `${c.personaId}|${key}`;
    byLoose.set(k, [...(byLoose.get(k) ?? []), c]);
  }
  const out: MergeCandidate[] = [];
  for (const list of byLoose.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) => fieldScore(b) - fieldScore(a) || a.createdAt.localeCompare(b.createdAt),
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        // Exact same names would have auto-merged already; evidence-sharing
        // pairs likewise. What's left is genuinely ambiguous.
        out.push({
          keeperId: sorted[i].id,
          dupeId: sorted[j].id,
          pairKey: [sorted[i].id, sorted[j].id].sort().join('|'),
        });
      }
    }
  }
  return out;
}

/** One user-approved merge (from the review card). */
export function mergePair(db: DB, keeperId: string, dupeId: string): DB {
  const keeper = db.contacts.find((c) => c.id === keeperId);
  const dupe = db.contacts.find((c) => c.id === dupeId);
  if (!keeper || !dupe) return db;
  const keeperFor = new Map([[dupeId, keeperId]]);
  const merged = new Map([[keeperId, absorb(keeper, dupe)]]);
  return applyMerges(db, keeperFor, merged);
}
