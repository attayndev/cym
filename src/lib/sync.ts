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

export interface GraphData {
  profile: Partial<UserProfile> | null;
  onboarded: boolean;
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
  is_default: p.isDefault,
});
const fromPersonaRow = (r: any): Persona => ({
  id: r.id,
  name: r.name,
  tagline: r.tagline ?? undefined,
  role: r.role ?? undefined,
  company: r.company ?? undefined,
  isDefault: r.is_default,
});

const toContactRow = (c: Contact, userId: string) => ({
  id: c.id,
  user_id: userId,
  persona_id: c.personaId,
  first_name: c.firstName,
  last_name: c.lastName ?? null,
  email: c.email ?? null,
  phone: c.phone ?? null,
  company: c.company ?? null,
  role: c.role ?? null,
  city: c.city ?? null,
  birthday: c.birthday ?? null,
  category: c.category,
  importance: c.importance,
  cadence_days: c.cadenceDays,
  source: c.source,
  created_at: c.createdAt,
});
const fromContactRow = (r: any): Contact => ({
  id: r.id,
  personaId: r.persona_id,
  firstName: r.first_name,
  lastName: r.last_name ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  company: r.company ?? undefined,
  role: r.role ?? undefined,
  city: r.city ?? undefined,
  birthday: r.birthday ?? undefined,
  category: r.category,
  importance: r.importance,
  cadenceDays: r.cadence_days,
  source: r.source,
  createdAt: r.created_at,
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
  notifications_enabled: p.notificationsEnabled,
  default_persona_id: p.defaultPersonaId,
  onboarded: false, // set by caller via pushGraph(db) below
});

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
    profile: p
      ? {
          name: p.name ?? '',
          role: p.role ?? undefined,
          company: p.company ?? undefined,
          email: p.email ?? undefined,
          phone: p.phone ?? undefined,
          city: p.city ?? undefined,
          isPro: p.is_pro,
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

async function replaceTable(
  client: SupabaseClient,
  table: string,
  userId: string,
  rows: { id: string }[],
): Promise<void> {
  if (rows.length > 0) {
    await client.from(table).upsert(rows);
    const ids = rows.map((r) => r.id);
    await client.from(table).delete().eq('user_id', userId).not('id', 'in', `(${ids.join(',')})`);
  } else {
    await client.from(table).delete().eq('user_id', userId);
  }
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
  if (rows.length > 0) {
    await client.from('interactions').upsert(rows);
    const ids = rows.map((r) => r.id);
    await client
      .from('interactions')
      .delete()
      .eq('user_id', userId)
      .neq('source', 'email-sync')
      .not('id', 'in', `(${ids.join(',')})`);
  } else {
    await client.from('interactions').delete().eq('user_id', userId).neq('source', 'email-sync');
  }
}

export async function pushGraph(
  client: SupabaseClient,
  userId: string,
  db: DB,
): Promise<void> {
  await client
    .from('profiles')
    .upsert({ ...toProfileRow(db.profile, userId), onboarded: db.onboarded });

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
}
