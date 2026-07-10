#!/usr/bin/env node
/**
 * LinkedIn Connections.csv import — first-party title/company data for people
 * you actually know, matched against the server graph.
 *
 *   SERVICE_KEY=... node scripts/import-linkedin.mjs Connections.csv [--apply] [user-email]
 *
 * Dry-run by default: prints exactly what WOULD happen, writes nothing.
 * With --apply it writes only the safe tier — additive fills of BLANK fields
 * (role, company, linkedin URL) on confidently-matched contacts — stamping
 * updated_at and bumping profiles.graph_version so devices pull-merge cleanly.
 * Conflicts (LinkedIn disagrees with a stored value) and ambiguous name
 * matches are NEVER auto-applied; they're printed for human judgment.
 * Unmatched connections are ignored — this enriches people you already
 * track, it does not import 2,000 strangers.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
// --trust-linkedin: also apply conflicts — LinkedIn is the contact's own
// self-reported current position, which outranks third-party enrichment.
const trustConflicts = args.includes('--trust-linkedin');
const [csvPath, userEmail = 'ytsirklin@gmail.com'] = args.filter((a) => !a.startsWith('--'));
if (!csvPath) { console.error('usage: import-linkedin.mjs Connections.csv [--apply] [user-email]'); process.exit(1); }
if (!process.env.SERVICE_KEY) { console.error('SERVICE_KEY env var required'); process.exit(1); }

// ---------- CSV parsing (RFC 4180: quoted fields, embedded commas/newlines) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

// LinkedIn prepends a "Notes:" preamble before the real header — skip to it.
const raw = readFileSync(csvPath, 'utf8');
const allRows = parseCsv(raw);
const headerIdx = allRows.findIndex((r) => r.some((c) => /first name/i.test(c)));
if (headerIdx === -1) { console.error('No "First Name" header found — is this Connections.csv?'); process.exit(1); }
const header = allRows[headerIdx].map((h) => h.trim().toLowerCase());
const col = (name) => header.findIndex((h) => h === name);
const F = col('first name'), L = col('last name'), U = col('url'),
      E = col('email address'), C = col('company'), P = col('position');
const connections = allRows.slice(headerIdx + 1).map((r) => ({
  firstName: (r[F] ?? '').trim(),
  lastName: (r[L] ?? '').trim(),
  url: (r[U] ?? '').trim(),
  email: (r[E] ?? '').trim().toLowerCase(),
  company: (r[C] ?? '').trim(),
  position: (r[P] ?? '').trim(),
})).filter((c) => c.firstName || c.lastName);

// ---------- match against the server graph ----------
// Same loose key as src/lib/dedupe.ts: first word of first name + last word
// of last name, punctuation stripped — "Danny E. Bibi" == "Danny Bibi".
const looseKey = (first, last) => {
  const f = String(first ?? '').trim().toLowerCase().replace(/[.,]/g, '').split(/\s+/)[0] ?? '';
  const l = String(last ?? '').trim().toLowerCase().replace(/[.,]/g, '').split(/\s+/).filter(Boolean).pop() ?? '';
  return f && l ? `${f} ${l}` : '';
};

const admin = createClient('https://jvuvuukvgunhpemrhqxl.supabase.co', process.env.SERVICE_KEY);
const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
const user = users.users.find((u) => u.email === userEmail);
if (!user) { console.error(`no such user: ${userEmail}`); process.exit(1); }

const { data: contacts, error } = await admin.from('contacts').select('*')
  .eq('user_id', user.id).neq('status', 'archived');
if (error) { console.error(error.message); process.exit(1); }
const people = contacts.filter((c) => c.kind !== 'business');

const byEmail = new Map();
for (const c of people) {
  if (c.email) byEmail.set(c.email.toLowerCase(), c);
  for (const alt of c.alt_emails ?? []) if (alt) byEmail.set(alt.toLowerCase(), c);
}
const byName = new Map();
for (const c of people) {
  const k = looseKey(c.first_name, c.last_name);
  if (k) byName.set(k, [...(byName.get(k) ?? []), c]);
}

const fills = [];      // blank field <- LinkedIn value (safe, auto-appliable)
const conflicts = [];  // stored value disagrees (human decides)
const ambiguous = [];  // >1 contact shares the loose name (human decides)
let matched = 0, unmatched = 0;

for (const conn of connections) {
  let contact = conn.email ? byEmail.get(conn.email) : undefined;
  const how = contact ? 'email' : 'name';
  if (!contact) {
    const candidates = byName.get(looseKey(conn.firstName, conn.lastName)) ?? [];
    if (candidates.length > 1) { ambiguous.push({ conn, candidates }); continue; }
    contact = candidates[0];
  }
  if (!contact) { unmatched++; continue; }
  matched++;

  const patch = {};
  const conflict = [];
  for (const [field, value] of [['role', conn.position], ['company', conn.company], ['linkedin', conn.url]]) {
    if (!value) continue;
    const current = (contact[field] ?? '').trim();
    if (!current) patch[field] = value;
    else if (field !== 'linkedin' && current.toLowerCase() !== value.toLowerCase()) {
      conflict.push({ field, current, proposed: value });
    }
  }
  if (Object.keys(patch).length) fills.push({ contact, patch, how });
  if (conflict.length) conflicts.push({ contact, conflict, how });
}

// ---------- report ----------
const name = (c) => `${c.first_name} ${c.last_name ?? ''}`.trim();
console.log(`\nLinkedIn connections parsed: ${connections.length}`);
console.log(`Matched to your contacts: ${matched} (ignored ${unmatched} connections not in Call Your Mom)`);

console.log(`\n━━━ FILLS — blank fields LinkedIn can complete: ${fills.length} contacts ━━━`);
for (const f of fills) {
  const parts = Object.entries(f.patch).map(([k, v]) => `${k}="${v}"`).join('  ');
  console.log(`  + ${name(f.contact)} [${f.how}]  ${parts}`);
}

console.log(`\n━━━ CONFLICTS — LinkedIn disagrees with stored data: ${conflicts.length} (never auto-applied) ━━━`);
for (const c of conflicts) {
  for (const d of c.conflict) {
    console.log(`  ? ${name(c.contact)} [${c.how}]  ${d.field}: "${d.current}" vs LinkedIn "${d.proposed}"`);
  }
}

console.log(`\n━━━ AMBIGUOUS — multiple contacts share the name: ${ambiguous.length} (skipped) ━━━`);
for (const a of ambiguous) {
  console.log(`  ~ ${a.conn.firstName} ${a.conn.lastName} could be: ${a.candidates.map(name).join(' | ')}`);
}

if (!apply) {
  console.log(`\nDry run — nothing written. Re-run with --apply to write the ${fills.length} fills.`);
  process.exit(0);
}

// ---------- apply ----------
if (trustConflicts) {
  // Fold conflict values into per-contact patches so each row updates once.
  const byId = new Map(fills.map((f) => [f.contact.id, f]));
  for (const c of conflicts) {
    const entry = byId.get(c.contact.id) ?? { contact: c.contact, patch: {}, how: c.how };
    for (const d of c.conflict) entry.patch[d.field] = d.proposed;
    if (!byId.has(c.contact.id)) {
      byId.set(c.contact.id, entry);
      fills.push(entry);
    }
  }
}

let written = 0;
for (const f of fills) {
  const { error: e } = await admin.from('contacts')
    .update({ ...f.patch, updated_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('id', f.contact.id);
  if (e) console.error(`  FAILED ${name(f.contact)}: ${e.message}`);
  else written++;
}
// Bump the graph version so a device holding unpushed edits conflicts on
// push and pull-merges these rows instead of clobbering them.
const { data: prof } = await admin.from('profiles').select('graph_version').eq('user_id', user.id).single();
await admin.from('profiles').update({ graph_version: (prof?.graph_version ?? 0) + 1 }).eq('user_id', user.id);
console.log(`\nApplied ${written}/${fills.length} contact updates; graph_version bumped. Devices will merge on next pull.`);
