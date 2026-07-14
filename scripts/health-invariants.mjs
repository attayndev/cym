#!/usr/bin/env node
// Read-only production invariant check for relationship health.
// Usage: SERVICE_KEY=... node scripts/health-invariants.mjs [user_email_prefix]
// Requires scripts/.nudges-bundle.js (npx esbuild src/lib/nudges.ts --bundle
// --platform=node --format=cjs --outfile=scripts/.nudges-bundle.js).
// Prints counts only — never names, emails, phones, or note content.

import https from 'node:https';
import { createRequire } from 'node:module';

const KEY = process.env.SERVICE_KEY;
if (!KEY) {
  console.error('SERVICE_KEY required');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const nudges = require('./.nudges-bundle.js');

function get(path) {
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          host: 'jvuvuukvgunhpemrhqxl.supabase.co',
          path,
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
        },
        (r) => {
          let d = '';
          r.on('data', (c) => (d += c));
          r.on('end', () => {
            if (r.statusCode >= 300) return reject(new Error(`${r.statusCode} ${path}: ${d.slice(0, 200)}`));
            resolve(JSON.parse(d));
          });
        },
      )
      .on('error', reject);
  });
}

async function getAll(table, select, filter = '') {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await get(`/rest/v1/${table}?select=${select}${filter}&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const now = new Date();
const contacts = (
  await getAll(
    'contacts',
    'id,user_id,source,evaluated_at,status,kind,cadence_days,created_at',
    '&status=eq.active',
  )
).map((c) => ({
  id: c.id,
  userId: c.user_id,
  source: c.source,
  evaluatedAt: c.evaluated_at,
  status: c.status,
  kind: c.kind,
  cadenceDays: c.cadence_days,
  createdAt: c.created_at,
}));
const interactions = (await getAll('interactions', 'contact_id,occurred_at')).map((i) => ({
  contactId: i.contact_id,
  occurredAt: i.occurred_at,
}));

const byContact = new Map();
for (const i of interactions) {
  if (!byContact.has(i.contactId)) byContact.set(i.contactId, []);
  byContact.get(i.contactId).push(i);
}

const violations = [];
const buckets = { never: 0, warm: 0, cooling: 0, 'at-risk': 0, cold: 0 };
for (const c of contacts) {
  const ints = byContact.get(c.id) ?? [];
  const last = nudges.lastTouchAt(c, ints);
  const health = nudges.contactHealth(c, ints, now);
  buckets[health] = (buckets[health] ?? 0) + 1;
  // I1: zero interactions ⟺ health 'never' ⟺ null last-touch
  if (ints.length === 0 && (health !== 'never' || last !== null))
    violations.push(`I1 ${c.id}: untouched but health=${health} last=${last}`);
  if (ints.length > 0 && (health === 'never' || last === null))
    violations.push(`I1' ${c.id}: touched (${ints.length}) but health=${health} last=${last}`);
  // I2: only the five statuses exist
  if (!['never', 'warm', 'cooling', 'at-risk', 'cold'].includes(health))
    violations.push(`I2 ${c.id}: unknown health '${health}'`);
}
// I3: no interaction dated >24 h in the future (would silently freshen decay)
const horizon = now.getTime() + 24 * 3600 * 1000;
const future = interactions.filter((i) => new Date(i.occurredAt).getTime() > horizon).length;
if (future > 0) violations.push(`I3: ${future} interactions dated >24h in the future`);
// I4: no unparseable timestamps
const bad = interactions.filter((i) => Number.isNaN(new Date(i.occurredAt).getTime())).length;
if (bad > 0) violations.push(`I4: ${bad} interactions with unparseable occurred_at`);

console.log(`contacts(active)=${contacts.length} interactions=${interactions.length}`);
console.log('health distribution:', JSON.stringify(buckets));
if (violations.length === 0) {
  console.log('ALL INVARIANTS HOLD');
} else {
  console.log(`${violations.length} VIOLATIONS:`);
  for (const v of violations.slice(0, 20)) console.log(' ', v);
  process.exit(1);
}
