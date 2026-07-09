// Shared mail-sync core for the Outlook and IMAP connectors (Gmail keeps its
// battle-tested copy). Given parsed messages, this module matches contacts
// (primary + alt emails), writes interaction rows, harvests display-name
// hints, and aggregates outbound-only correspondent suggestions — identical
// semantics across providers.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface Participant {
  email: string;
  name?: string;
}

export interface ParsedMessage {
  /** Provider-stable message id — interaction ids derive from it. */
  id: string;
  when: string; // ISO
  from: Participant[];
  toCc: Participant[];
}

const MACHINE_LOCAL_RE =
  /^(no-?reply|do-?not-?reply|donot|noreply|reply|info|support|sales|contact|hello|hi|office|admin|billing|notifications?|notify|updates?|news(letter)?s?|digest|mailer(-daemon)?|bounce|marketing|receipts?|alerts?|team|help|orders?|service|security|account|store|welcome|email|em|mail|share|sharing|invites?|events?|community|feedback|careers|jobs|press|media|legal|privacy|postmaster|abuse|customer(care|service)?|member(ship)?s?)([+._\-\d]|$)/i;
const ESP_DOMAIN_RE =
  /^(e|em\d*|mail|mailer|news|newsletters?|marketing|info|mg|email|bounce|reply|notifications?|updates?|links|click|go|hs|mta\d*)\./i;

export function isMachine(email: string): boolean {
  const [local = '', domain = ''] = email.split('@');
  return MACHINE_LOCAL_RE.test(local) || ESP_DOMAIN_RE.test(domain) || /[0-9a-f]{10,}/i.test(local);
}

export interface ContactIndex {
  byEmail: Map<string, string>;
  knownNames: Set<string>;
}

export async function loadContactIndex(
  admin: SupabaseClient,
  userId: string,
): Promise<ContactIndex> {
  const { data: contacts } = await admin
    .from('contacts')
    .select('id,email,alt_emails,first_name,last_name')
    .eq('user_id', userId);
  const byEmail = new Map<string, string>();
  const knownNames = new Set<string>();
  for (const c of contacts ?? []) {
    if (c.email) byEmail.set(String(c.email).toLowerCase(), c.id);
    for (const alt of (c.alt_emails as string[] | null) ?? []) {
      if (alt) byEmail.set(String(alt).toLowerCase(), c.id);
    }
    const f = String(c.first_name ?? '').trim().toLowerCase().replace(/[.,]/g, '').split(/\s+/)[0];
    const l = String(c.last_name ?? '').trim().toLowerCase().replace(/[.,]/g, '').split(/\s+/).filter(Boolean).pop();
    if (f && l) knownNames.add(`${f} ${l}`);
  }
  return { byEmail, knownNames };
}

export interface Harvest {
  rows: Record<string, unknown>[];
  nameHints: Map<string, Map<string, number>>;
  suggestions: Map<string, { name?: string; count: number; last: string }>;
}

export function newHarvest(): Harvest {
  return { rows: [], nameHints: new Map(), suggestions: new Map() };
}

/** Process one message: interaction rows for matched contacts, name hints
 *  from senders, outbound-only suggestions (recipients of the user's own
 *  sent mail — replying separates a relationship from a subscription). */
export function processMessage(
  h: Harvest,
  idx: ContactIndex,
  ownEmails: Set<string>,
  userId: string,
  idPrefix: string,
  msg: ParsedMessage,
): void {
  const isOutbound = msg.from.some((p) => ownEmails.has(p.email));
  const contactIds = new Set<string>();
  for (const p of [...msg.from, ...msg.toCc]) {
    const cid = idx.byEmail.get(p.email);
    if (cid) contactIds.add(cid);
  }
  for (const contactId of contactIds) {
    h.rows.push({
      id: `${idPrefix}_${msg.id}_${contactId}`,
      user_id: userId,
      contact_id: contactId,
      type: 'email',
      occurred_at: msg.when,
      source: 'email-sync',
    });
  }
  for (const p of msg.from) {
    const cid = idx.byEmail.get(p.email);
    if (!cid || !p.name || p.name.includes('@')) continue;
    const names = h.nameHints.get(cid) ?? new Map<string, number>();
    names.set(p.name, (names.get(p.name) ?? 0) + 1);
    h.nameHints.set(cid, names);
  }
  const candidates = isOutbound ? msg.toCc : [];
  for (const p of candidates) {
    if (idx.byEmail.has(p.email) || ownEmails.has(p.email) || isMachine(p.email)) continue;
    if (p.name) {
      const parts = p.name.trim().toLowerCase().replace(/[.,]/g, '').split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && idx.knownNames.has(`${parts[0]} ${parts[parts.length - 1]}`)) continue;
    }
    const cur = h.suggestions.get(p.email);
    if (cur) {
      cur.count += 1;
      if (msg.when > cur.last) cur.last = msg.when;
      if (!cur.name && p.name) cur.name = p.name;
    } else {
      h.suggestions.set(p.email, { name: p.name, count: 1, last: msg.when });
    }
  }
}

/** Persist a harvest: interactions (idempotent by id), hints, suggestions. */
export async function flushHarvest(
  admin: SupabaseClient,
  userId: string,
  h: Harvest,
): Promise<number> {
  if (h.rows.length > 0) {
    const { error } = await admin
      .from('interactions')
      .upsert(h.rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`upsert interactions: ${error.message}`);
  }
  if (h.nameHints.size > 0) {
    const hintRows = [...h.nameHints].map(([contactId, names]) => {
      let best = '';
      let bestCount = 0;
      let total = 0;
      for (const [n, c] of names) {
        total += c;
        if (c > bestCount) {
          best = n;
          bestCount = c;
        }
      }
      return {
        user_id: userId,
        contact_id: contactId,
        kind: 'name',
        value: best,
        observed: total,
        updated_at: new Date().toISOString(),
      };
    });
    await admin.from('contact_hints').upsert(hintRows, { onConflict: 'user_id,contact_id,kind' });
  }
  if (h.suggestions.size > 0) {
    const emails = [...h.suggestions.keys()].slice(0, 300);
    const existing = new Map<string, { count: number; name: string | null }>();
    for (let i = 0; i < emails.length; i += 100) {
      const { data } = await admin
        .from('suggested_contacts')
        .select('email,message_count,name')
        .eq('user_id', userId)
        .in('email', emails.slice(i, i + 100));
      for (const r of data ?? []) existing.set(r.email, { count: r.message_count, name: r.name });
    }
    const sugRows = emails.map((email) => {
      const s = h.suggestions.get(email)!;
      const prev = existing.get(email);
      return {
        user_id: userId,
        email,
        name: prev?.name ?? s.name ?? null,
        message_count: (prev?.count ?? 0) + s.count,
        last_seen_at: s.last,
      };
    });
    await admin.from('suggested_contacts').upsert(sugRows, { onConflict: 'user_id,email' });
  }
  return h.rows.length;
}
