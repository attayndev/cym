import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Contact,
  ConnectedAccount,
  ContextEntry,
  DB,
  Hook,
  Interaction,
  Nudge,
  Persona,
  UserProfile,
} from '@/lib/types';

/**
 * Whole-graph sync. At MVP scale (hundreds of contacts) we treat the signed-in
 * user's local DB as the source of truth and mirror it to Supabase: pull on
 * sign-in, and "replace my graph" on push (upsert every row, delete the rest).
 * A later milestone can move to per-row diffing / realtime.
 */

export class GraphVersionConflict extends Error {
  constructor() {
    super('graph version conflict — another device pushed first');
    this.name = 'GraphVersionConflict';
  }
}

export interface GraphData {
  profile: Partial<UserProfile> | null;
  onboarded: boolean;
  /** Concurrency token — pass back to pushGraph, which refuses stale pushes. */
  graphVersion: number;
  personas: Persona[];
  contacts: Contact[];
  contexts: ContextEntry[];
  interactions: Interaction[];
  hooks: Hook[];
  nudges: Nudge[];
  accounts: ConnectedAccount[];
}

// --- row mappers: app camelCase <-> db snake_case --------------------------

const toPersonaRow = (p: Persona, userId: string) => ({
  id: p.id,
  user_id: userId,
  name: p.name,
  tagline: p.tagline ?? null,
  role: p.role ?? null,
  company: p.company ?? null,
  display_name: p.displayName ?? null,
  email: p.email ?? null,
  phone: p.phone ?? null,
  is_default: p.isDefault,
  updated_at: p.updatedAt ?? '1970-01-01T00:00:00.000Z',
});
const fromPersonaRow = (r: any): Persona => ({
  id: r.id,
  name: r.name,
  tagline: r.tagline ?? undefined,
  role: r.role ?? undefined,
  company: r.company ?? undefined,
  displayName: r.display_name ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  isDefault: r.is_default,
  updatedAt: r.updated_at ?? undefined,
});

const toContactRow = (c: Contact, userId: string) => ({
  id: c.id,
  user_id: userId,
  persona_id: c.personaId,
  first_name: c.firstName,
  last_name: c.lastName ?? null,
  email: c.email ?? null,
  phone: c.phone ?? null,
  work_email: c.workEmail ?? null,
  work_phone: c.workPhone ?? null,
  company: c.company ?? null,
  role: c.role ?? null,
  city: c.city ?? null,
  birthday: c.birthday ?? null,
  category: c.category,
  importance: c.importance,
  cadence_days: c.cadenceDays,
  source: c.source,
  created_at: c.createdAt,
  kind: c.kind ?? null,
  status: c.status ?? null,
  evaluated_at: c.evaluatedAt ?? null,
  alt_emails: c.altEmails ?? null,
  alt_phones: c.altPhones ?? null,
  linkedin: c.linkedin ?? null,
  card_token: c.cardToken ?? null,
  updated_at: c.updatedAt ?? c.createdAt,
});
const fromContactRow = (r: any): Contact => ({
  id: r.id,
  personaId: r.persona_id,
  firstName: r.first_name,
  lastName: r.last_name ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  workEmail: r.work_email ?? undefined,
  workPhone: r.work_phone ?? undefined,
  company: r.company ?? undefined,
  role: r.role ?? undefined,
  city: r.city ?? undefined,
  birthday: r.birthday ?? undefined,
  category: r.category,
  importance: r.importance,
  cadenceDays: r.cadence_days,
  source: r.source,
  createdAt: r.created_at,
  kind: r.kind ?? undefined,
  status: r.status ?? undefined,
  evaluatedAt: r.evaluated_at ?? undefined,
  altEmails: r.alt_emails ?? undefined,
  altPhones: r.alt_phones ?? undefined,
  linkedin: r.linkedin ?? undefined,
  cardToken: r.card_token ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

const toContextRow = (c: ContextEntry, userId: string) => ({
  id: c.id,
  user_id: userId,
  contact_id: c.contactId,
  where_met: c.whereMet ?? null,
  discussed: c.discussed ?? null,
  why_matters: c.whyMatters ?? null,
  commitment: c.commitment ?? null,
  commitment_due_at: c.commitmentDueAt ?? null,
  created_at: c.createdAt,
  updated_at: c.updatedAt ?? c.createdAt,
});
const fromContextRow = (r: any): ContextEntry => ({
  id: r.id,
  contactId: r.contact_id,
  whereMet: r.where_met ?? undefined,
  discussed: r.discussed ?? undefined,
  whyMatters: r.why_matters ?? undefined,
  commitment: r.commitment ?? undefined,
  commitmentDueAt: r.commitment_due_at ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? undefined,
});

const toInteractionRow = (i: Interaction, userId: string) => ({
  id: i.id,
  user_id: userId,
  contact_id: i.contactId,
  type: i.type,
  occurred_at: i.occurredAt,
  note: i.note ?? null,
  source: i.source,
});
const fromInteractionRow = (r: any): Interaction => ({
  id: r.id,
  contactId: r.contact_id,
  type: r.type,
  occurredAt: r.occurred_at,
  note: r.note ?? undefined,
  source: r.source,
});

const toHookRow = (h: Hook, userId: string) => ({
  id: h.id,
  user_id: userId,
  contact_id: h.contactId,
  type: h.type,
  trigger_at: h.triggerAt,
  label: h.label,
  source_context_id: h.sourceContextId ?? null,
  consumed_at: h.consumedAt ?? null,
});
const fromHookRow = (r: any): Hook => ({
  id: r.id,
  contactId: r.contact_id,
  type: r.type,
  triggerAt: r.trigger_at,
  label: r.label,
  sourceContextId: r.source_context_id ?? undefined,
  consumedAt: r.consumed_at ?? undefined,
});

const toNudgeRow = (n: Nudge, userId: string) => ({
  id: n.id,
  user_id: userId,
  contact_id: n.contactId,
  hook_id: n.hookId ?? null,
  kind: n.kind,
  headline: n.headline,
  reason: n.reason,
  suggested_action: n.suggestedAction,
  state: n.state,
  snoozed_until: n.snoozedUntil ?? null,
  created_at: n.createdAt,
  score: n.score,
});
const fromNudgeRow = (r: any): Nudge => ({
  id: r.id,
  contactId: r.contact_id,
  hookId: r.hook_id ?? undefined,
  kind: r.kind,
  headline: r.headline,
  reason: r.reason,
  suggestedAction: r.suggested_action,
  state: r.state,
  snoozedUntil: r.snoozed_until ?? undefined,
  createdAt: r.created_at,
  score: r.score,
});

const fromAccountRow = (r: any): ConnectedAccount => ({
  id: r.id,
  provider: r.provider,
  email: r.email,
  status: r.status,
  lastSyncAt: r.last_sync_at ?? undefined,
});

const toProfileRow = (p: UserProfile, userId: string) => ({
  user_id: userId,
  name: p.name,
  role: p.role ?? null,
  company: p.company ?? null,
  email: p.email ?? null,
  phone: p.phone ?? null,
  city: p.city ?? null,
  is_pro: p.isPro,
  timezone: p.timezone ?? null,
  notifications_enabled: p.notificationsEnabled,
  default_persona_id: p.defaultPersonaId,
  onboarded: false, // set by caller via pushGraph(db) below
});

// --- merge -------------------------------------------------------------------

const rowTime = (x: { updatedAt?: string; createdAt?: string }): number =>
  new Date(x.updatedAt ?? x.createdAt ?? 0).getTime();

function newestById<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  remote: T[],
  local: T[],
): T[] {
  const out = new Map<string, T>();
  for (const r of remote) out.set(r.id, r);
  for (const l of local) {
    const r = out.get(l.id);
    if (!r || rowTime(l) > rowTime(r)) out.set(l.id, l);
  }
  return [...out.values()];
}

/** How settled a nudge is — a verdict beats pending, whichever device saw it. */
const NUDGE_RANK: Record<Nudge['state'], number> = {
  pending: 0,
  snoozed: 1,
  dismissed: 2,
  acted: 3,
};

/**
 * True merge of the local and remote graphs — the fix for "the app keeps
 * losing my interactions". Rules:
 *  - contacts/contexts/personas: union by id, NEWEST updatedAt wins;
 *  - manual interactions: UNION by id (append-only in practice — a logged
 *    touchpoint can never be erased by a pull again);
 *  - email-sync interactions + accounts: server-owned, remote wins;
 *  - nudges: union; on collision the more-settled state wins (acted >
 *    dismissed > snoozed > pending) so verdicts survive from any device;
 *  - hooks: union, remote preferred (engine regenerates);
 *  - profile: remote wins for server-written fields (isPro), local wins
 *    otherwise (it is the device in the user's hand).
 */
export function mergeGraphs(local: DB, remote: GraphData): DB {
  const remoteEmailInts = remote.interactions.filter((i) => i.source === 'email-sync');
  const remoteManualInts = remote.interactions.filter((i) => i.source !== 'email-sync');
  const localManualInts = local.interactions.filter((i) => i.source !== 'email-sync');
  const manualById = new Map<string, Interaction>();
  for (const i of remoteManualInts) manualById.set(i.id, i);
  for (const i of localManualInts) manualById.set(i.id, i);

  const nudgeById = new Map<string, Nudge>();
  for (const n of remote.nudges) nudgeById.set(n.id, n);
  for (const n of local.nudges) {
    const r = nudgeById.get(n.id);
    if (!r || NUDGE_RANK[n.state] > NUDGE_RANK[r.state]) nudgeById.set(n.id, n);
  }

  const hookById = new Map<string, Hook>();
  for (const h of local.hooks) hookById.set(h.id, h);
  for (const h of remote.hooks) {
    const l = hookById.get(h.id);
    // consumed beats unconsumed, whichever side saw it
    if (!l || (h.consumedAt && !l.consumedAt)) hookById.set(h.id, h);
  }

  return {
    ...local,
    profile: {
      ...local.profile,
      ...(remote.profile ?? {}),
      // Local wins for what the user just did on THIS device…
      ...(local.onboarded ? { name: local.profile.name || remote.profile?.name || '' } : {}),
      notificationsEnabled: local.profile.notificationsEnabled,
      timezone: local.profile.timezone ?? remote.profile?.timezone,
      defaultPersonaId: local.profile.defaultPersonaId || remote.profile?.defaultPersonaId || '',
      // …but the server owns billing state (RevenueCat webhook writes it).
      isPro: remote.profile?.isPro ?? local.profile.isPro,
    },
    onboarded: remote.onboarded || local.onboarded,
    personas: newestById(remote.personas, local.personas),
    // Archived is a one-way latch: a device that hadn't heard about the
    // archive yet can stamp the row (enrichment fill, deck pre-enrich) with a
    // newer updatedAt and win the merge — resurrecting someone the user
    // removed. Whoever wins the row, an archive on EITHER side sticks.
    // (Revisit if an unarchive control ever ships.)
    contacts: (() => {
      const archived = new Set(
        [...remote.contacts, ...local.contacts]
          .filter((c) => c.status === 'archived')
          .map((c) => c.id),
      );
      return newestById(remote.contacts, local.contacts).map((c) =>
        archived.has(c.id) && c.status !== 'archived'
          ? { ...c, status: 'archived' as const }
          : c,
      );
    })(),
    contexts: newestById(remote.contexts, local.contexts),
    interactions: [...remoteEmailInts, ...manualById.values()],
    hooks: [...hookById.values()],
    nudges: [...nudgeById.values()],
    accounts: remote.accounts,
  };
}

// --- pull ------------------------------------------------------------------

export async function pullGraph(
  client: SupabaseClient,
  userId: string,
): Promise<GraphData> {
  const [profile, personas, contacts, contexts, interactions, hooks, nudges, accounts] =
    await Promise.all([
      client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      client.from('personas').select('*').eq('user_id', userId),
      client.from('contacts').select('*').eq('user_id', userId),
      client.from('contexts').select('*').eq('user_id', userId),
      client.from('interactions').select('*').eq('user_id', userId),
      client.from('hooks').select('*').eq('user_id', userId),
      client.from('nudges').select('*').eq('user_id', userId),
      client.from('connected_accounts').select('*').eq('user_id', userId),
    ]);

  const p = profile.data;
  return {
    onboarded: Boolean(p?.onboarded),
    graphVersion: Number(p?.graph_version ?? 0),
    profile: p
      ? {
          name: p.name ?? '',
          role: p.role ?? undefined,
          company: p.company ?? undefined,
          email: p.email ?? undefined,
          phone: p.phone ?? undefined,
          city: p.city ?? undefined,
          isPro: p.is_pro,
          timezone: p.timezone ?? undefined,
          notificationsEnabled: p.notifications_enabled,
          defaultPersonaId: p.default_persona_id ?? '',
        }
      : null,
    personas: (personas.data ?? []).map(fromPersonaRow),
    contacts: (contacts.data ?? []).map(fromContactRow),
    contexts: (contexts.data ?? []).map(fromContextRow),
    interactions: (interactions.data ?? []).map(fromInteractionRow),
    hooks: (hooks.data ?? []).map(fromHookRow),
    nudges: (nudges.data ?? []).map(fromNudgeRow),
    accounts: (accounts.data ?? []).map(fromAccountRow),
  };
}

// --- push ("replace my graph": upsert all, delete the rest) ----------------

// Address books run 10k+ contacts, so pushes must be chunked: upserts in
// batches (request-body size) and delete-missing via select→diff→delete-by-id
// (a `not in (…10k ids)` filter would blow the request URL).
const CHUNK = 500;
const SELECT_PAGE = 1000;

async function upsertChunked(
  client: SupabaseClient,
  table: string,
  rows: { id: string }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`push ${table} (rows ${i}-${i + CHUNK}): ${error.message}`);
  }
}

async function selectAllIds(
  client: SupabaseClient,
  table: string,
  userId: string,
  clientOwnedOnly = false,
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += SELECT_PAGE) {
    let query = client.from(table).select('id').eq('user_id', userId);
    if (clientOwnedOnly) query = query.neq('source', 'email-sync');
    const { data, error } = await query.range(from, from + SELECT_PAGE - 1);
    if (error) throw new Error(`select ${table} ids: ${error.message}`);
    if (!data || data.length === 0) break;
    ids.push(...data.map((r: { id: string }) => r.id));
    if (data.length < SELECT_PAGE) break;
  }
  return ids;
}

async function deleteByIds(
  client: SupabaseClient,
  table: string,
  userId: string,
  ids: string[],
): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await client
      .from(table)
      .delete()
      .eq('user_id', userId)
      .in('id', ids.slice(i, i + CHUNK));
    if (error) throw new Error(`delete stale ${table}: ${error.message}`);
  }
}

async function replaceTable(
  client: SupabaseClient,
  table: string,
  userId: string,
  rows: { id: string }[],
): Promise<void> {
  await upsertChunked(client, table, rows);
  const keep = new Set(rows.map((r) => r.id));
  const stale = (await selectAllIds(client, table, userId)).filter((id) => !keep.has(id));
  await deleteByIds(client, table, userId, stale);
}

/**
 * Replace only the interactions the client owns. Rows written by the Gmail sync
 * function (source = 'email-sync') are server-owned — we never upsert or delete
 * them here, so a client push can't wipe synced email history.
 */
async function replaceClientInteractions(
  client: SupabaseClient,
  userId: string,
  rows: { id: string }[],
): Promise<void> {
  await upsertChunked(client, 'interactions', rows);
  const keep = new Set(rows.map((r) => r.id));
  const stale = (await selectAllIds(client, 'interactions', userId, true)).filter(
    (id) => !keep.has(id),
  );
  await deleteByIds(client, 'interactions', userId, stale);
}

/**
 * Replace the server graph — but ONLY when this device's view is current.
 * The version claim (compare-and-bump) runs first; a stale device gets a
 * GraphVersionConflict instead of silently deleting rows newer devices wrote.
 * Returns the new version to carry into the next push.
 */
export async function pushGraph(
  client: SupabaseClient,
  userId: string,
  db: DB,
  expectedVersion: number,
): Promise<number> {
  // Claim the version FIRST: writing profile fields before the compare-and-
  // bump let a stale device overwrite server-side edits and then "merge" its
  // own poison back in on the conflict retry. Nothing may write until the
  // claim succeeds.
  const claim = await client
    .from('profiles')
    .update({ graph_version: expectedVersion + 1 })
    .eq('user_id', userId)
    .eq('graph_version', expectedVersion)
    .select('graph_version');
  if (claim.error) throw new Error(`claim graph version: ${claim.error.message}`);
  if (!claim.data || claim.data.length === 0) throw new GraphVersionConflict();

  const { error } = await client
    .from('profiles')
    .upsert({
      ...toProfileRow(db.profile, userId),
      onboarded: db.onboarded,
      graph_version: expectedVersion + 1, // keep the claimed version through the upsert
    });
  if (error) throw new Error(`push profile: ${error.message}`);

  const manualInteractions = db.interactions
    .filter((i) => i.source !== 'email-sync')
    .map((x) => toInteractionRow(x, userId));

  await Promise.all([
    replaceTable(client, 'personas', userId, db.personas.map((x) => toPersonaRow(x, userId))),
    replaceTable(client, 'contacts', userId, db.contacts.map((x) => toContactRow(x, userId))),
    replaceTable(client, 'contexts', userId, db.contexts.map((x) => toContextRow(x, userId))),
    replaceClientInteractions(client, userId, manualInteractions),
    replaceTable(client, 'hooks', userId, db.hooks.map((x) => toHookRow(x, userId))),
    replaceTable(client, 'nudges', userId, db.nudges.map((x) => toNudgeRow(x, userId))),
    // connected_accounts is server-owned (written by the Gmail functions) — never
    // touched by a client push.
  ]);
  return expectedVersion + 1;
}
