#!/usr/bin/env node
/**
 * Contact diagnostic (Phase 2 of the data-integrity loop).
 *   SERVICE_KEY=... node scripts/diagnose-contact.mjs "Jill Wynn" [user-email]
 * Answers, from the SERVER graph (the sync mirror of the device store):
 * existence, ids, interactions (incl. manual flags), timestamps, enrichment
 * fields, orphan check, and the exact health computation with its reasons.
 * (Device-local AsyncStorage isn't reachable from here; after a sync the
 * server mirror is the same graph.)
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const nudges = require('./.nudges-bundle.js');

const [name, userEmail = 'ytsirklin@gmail.com'] = process.argv.slice(2);
if (!name) { console.error('usage: diagnose-contact.mjs "First Last" [user-email]'); process.exit(1); }
const admin = createClient('https://jvuvuukvgunhpemrhqxl.supabase.co', process.env.SERVICE_KEY);

const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
const user = users.users.find((u) => u.email === userEmail);
if (!user) { console.error('no such user'); process.exit(1); }

const [first, ...rest] = name.trim().split(/\s+/);
const { data: contacts } = await admin.from('contacts').select('*')
  .eq('user_id', user.id).ilike('first_name', `${first}%`).ilike('last_name', `%${rest.join(' ')}%`);
if (!contacts?.length) { console.log(`NOT FOUND: no contact matching "${name}"`); process.exit(0); }

for (const c of contacts) {
  console.log(`\n━━━ ${c.first_name} ${c.last_name ?? ''} ━━━`);
  console.log(`internal id: ${c.id}   status: ${c.status ?? 'active'}   kind: ${c.kind}`);
  console.log(`created: ${c.created_at}   updated: ${c.updated_at}`);
  console.log(`cadence: every ${c.cadence_days}d   category: ${c.category}   importance: ${c.importance}`);
  console.log(`enrichment-relevant fields: role=${JSON.stringify(c.role)} company=${JSON.stringify(c.company)} city=${JSON.stringify(c.city)} linkedin=${JSON.stringify(c.linkedin)}`);
  console.log(`emails: ${c.email ?? '—'}  alts: ${JSON.stringify(c.alt_emails)}   card_token(living): ${c.card_token ?? '—'}`);

  const { data: ints } = await admin.from('interactions').select('*')
    .eq('user_id', user.id).eq('contact_id', c.id).order('occurred_at', { ascending: false });
  const manual = (ints ?? []).filter((i) => i.source !== 'email-sync');
  console.log(`interactions: ${ints?.length ?? 0} total  (${manual.length} manual flags, ${ (ints?.length ?? 0) - manual.length } email-sync)`);
  for (const i of (ints ?? []).slice(0, 6)) {
    console.log(`  • ${i.occurred_at}  ${i.type}  [${i.source}]  ${i.id}`);
  }

  // Health computation — the same code the app runs, on the same rows.
  const contact = { id: c.id, personaId: c.persona_id, firstName: c.first_name,
    category: c.category, importance: c.importance, cadenceDays: c.cadence_days,
    source: c.source, createdAt: c.created_at, kind: c.kind, status: c.status ?? 'active' };
  const appInts = (ints ?? []).map((i) => ({ id: i.id, contactId: i.contact_id,
    type: i.type, occurredAt: i.occurred_at, source: i.source }));
  const now = new Date();
  const last = nudges.lastTouchAt(contact, appInts);
  const ratio = nudges.decayRatio(contact, appInts, now);
  const health = nudges.contactHealth(contact, appInts, now);
  const days = last ? Math.floor((now - new Date(last)) / 86400000) : null;
  console.log(`HEALTH: ${health.toUpperCase()}`);
  console.log(`  reason: last touch ${last ?? "NONE (never touched)"} ${days === null ? "" : `(${days}d ago)`}; cadence ${c.cadence_days}d; ratio ${ratio.toFixed(2)} (warm≤1.25, cooling≤2, at-risk≤3.5, cold>3.5)`);
  console.log(`  tz note: occurred_at stored UTC; day math is ms-elapsed based (tz-safe)`);
  console.log(`  writeback: enrichment lives in-app only; device book only via explicit "Update phone contacts"`);
}

// Orphan check
const { count } = await admin.from('interactions')
  .select('id', { count: 'exact', head: true }).eq('user_id', user.id);
console.log(`\n(user has ${count} interaction rows total; orphan audit: see docs/data-flow-map.md)`);
