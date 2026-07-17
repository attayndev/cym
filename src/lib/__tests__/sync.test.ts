import type { SupabaseClient } from '@supabase/supabase-js';

import { GraphVersionConflict, mergeGraphs, pullGraph, pushGraph, type GraphData } from '@/lib/sync';
import type { Contact, DB, Interaction, Nudge } from '@/lib/types';

// --- fixtures ----------------------------------------------------------------

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-06-01T00:00:00.000Z';
const T2 = '2026-06-01T01:00:00.000Z';

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: over.id ?? 'c1',
  personaId: 'p1',
  firstName: 'Test',
  category: 'other',
  importance: 1,
  cadenceDays: 30,
  source: 'manual',
  createdAt: T0,
  kind: 'person',
  status: 'active',
  ...over,
});

const interaction = (id: string, over: Partial<Interaction> = {}): Interaction => ({
  id,
  contactId: 'c1',
  type: 'call',
  occurredAt: T1,
  source: 'manual',
  ...over,
});

const nudge = (id: string, state: Nudge['state'], over: Partial<Nudge> = {}): Nudge => ({
  id,
  contactId: 'c1',
  kind: 'decay',
  headline: { key: 'nudgec.decay.headline' },
  reason: { key: 'nudgec.decay.reason' },
  suggestedAction: { key: 'nudgec.decay.action.pro' },
  state,
  createdAt: T0,
  score: 1,
  ...over,
});

const baseDB = (over: Partial<DB> = {}): DB => ({
  profile: {
    name: 'Local Name',
    isPro: false,
    notificationsEnabled: true,
    defaultPersonaId: 'p1',
    timezone: 'America/New_York',
  },
  personas: [{ id: 'p1', name: 'P', isDefault: true }],
  contacts: [],
  contexts: [],
  interactions: [],
  hooks: [],
  nudges: [],
  accounts: [],
  onboarded: true,
  ...over,
});

const baseRemote = (over: Partial<GraphData> = {}): GraphData => ({
  profile: { name: 'Remote Name', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
  onboarded: true,
  graphVersion: 3,
  personas: [{ id: 'p1', name: 'P', isDefault: true }],
  contacts: [],
  contexts: [],
  interactions: [],
  hooks: [],
  nudges: [],
  accounts: [],
  ...over,
});

const byId = <T extends { id: string }>(arr: T[]): T[] => [...arr].sort((a, b) => a.id.localeCompare(b.id));

// --- minimal in-memory mock SupabaseClient ------------------------------------
//
// Models each table as an array of snake_case row objects and supports just
// the query-builder surface sync.ts actually calls: select/eq/neq/range/
// upsert/delete/in/maybeSingle/update. Every builder call is chainable and
// the builder itself is a thenable, so `await client.from(t).select(...)...`
// works whether or not a terminal method like .maybeSingle()/.range() is used.

type Row = Record<string, any>;

class MockQueryBuilder implements PromiseLike<{ data: any; error: any }> {
  private opType: 'select' | 'upsert' | 'delete' | 'update' | null = null;
  private filters: Array<['eq' | 'neq' | 'in', string, any]> = [];
  private selectCols: string | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private payload: Row | Row[] | null = null;
  private single = false;

  constructor(
    private readonly tables: Record<string, Row[]>,
    private readonly table: string,
  ) {}

  select(cols: string) {
    this.opType = this.opType ?? 'select';
    this.selectCols = cols;
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push(['eq', col, val]);
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push(['neq', col, val]);
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push(['in', col, vals]);
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  upsert(rows: Row | Row[]) {
    this.opType = 'upsert';
    this.payload = rows;
    return this;
  }
  delete() {
    this.opType = 'delete';
    return this;
  }
  update(payload: Row) {
    this.opType = 'update';
    this.payload = payload;
    return this;
  }

  private rows(): Row[] {
    return this.tables[this.table] ?? (this.tables[this.table] = []);
  }

  private matches(row: Row): boolean {
    return this.filters.every(([kind, col, val]) => {
      if (kind === 'eq') return row[col] === val;
      if (kind === 'neq') return row[col] !== val;
      return Array.isArray(val) && val.includes(row[col]);
    });
  }

  private narrow(rows: Row[]): Row[] {
    if (!this.selectCols || this.selectCols === '*') return rows;
    const cols = this.selectCols.split(',').map((c) => c.trim());
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
  }

  private exec(): { data: any; error: any } {
    const table = this.rows();

    if (this.opType === 'upsert') {
      const incoming = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
      for (const row of incoming) {
        const key = row.id !== undefined ? 'id' : 'user_id';
        const idx = table.findIndex((r) => r[key] === row[key]);
        if (idx >= 0) table[idx] = { ...table[idx], ...row };
        else table.push({ ...row });
      }
      return { data: null, error: null };
    }

    if (this.opType === 'delete') {
      this.tables[this.table] = table.filter((r) => !this.matches(r));
      return { data: null, error: null };
    }

    if (this.opType === 'update') {
      const matched = table.filter((r) => this.matches(r));
      for (const r of matched) Object.assign(r, this.payload);
      return { data: this.narrow(matched), error: null };
    }

    // select
    let result = table.filter((r) => this.matches(r));
    if (this.rangeFrom != null && this.rangeTo != null) {
      result = result.slice(this.rangeFrom, this.rangeTo + 1);
    }
    result = this.narrow(result);
    if (this.single) return { data: result[0] ?? null, error: null };
    return { data: result, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
}

function createMockClient(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  const client = {
    from(table: string) {
      return new MockQueryBuilder(tables, table);
    },
    auth: {},
  };
  return { client: client as unknown as SupabaseClient, tables };
}

// --- mergeGraphs ---------------------------------------------------------------

describe('mergeGraphs — interaction preservation (the data-loss bug)', () => {
  test('a local manual interaction not present in remote survives the merge', () => {
    const local = baseDB({ interactions: [interaction('int_local_touch')] });
    const remote = baseRemote({ interactions: [] });
    const merged = mergeGraphs(local, remote);
    expect(merged.interactions.map((i) => i.id)).toContain('int_local_touch');
  });
});

describe('mergeGraphs — relationship-status inputs survive a merge (Phase 4 safety)', () => {
  test('a manual interaction and its contact cadence_days both survive, from either side', () => {
    const local = baseDB({
      contacts: [contact({ id: 'c1', cadenceDays: 45, updatedAt: T2 })],
      interactions: [interaction('int_manual_touch')],
    });
    const remote = baseRemote({ contacts: [contact({ id: 'c1', cadenceDays: 90, updatedAt: T1 })] });
    const merged = mergeGraphs(local, remote);
    expect(merged.interactions.map((i) => i.id)).toContain('int_manual_touch');
    // Local is newer here, so local's cadence wins — the point is that
    // cadenceDays is carried through the merge like any other contact field,
    // not dropped or reset to an import default.
    expect(merged.contacts.find((c) => c.id === 'c1')!.cadenceDays).toBe(45);
  });
});

describe('mergeGraphs — idempotency', () => {
  test('merging an already-merged graph against the same remote is a no-op', () => {
    const local = baseDB({
      contacts: [
        contact({ id: 'both', role: 'Local Edit', updatedAt: T2 }),
        contact({ id: 'local-only', updatedAt: T1 }),
      ],
      interactions: [
        interaction('int_local'),
        interaction('int_local_email', { source: 'email-sync' }),
      ],
      nudges: [nudge('n1', 'acted'), nudge('n2', 'pending')],
    });
    const remote = baseRemote({
      contacts: [
        contact({ id: 'both', role: 'Remote Edit', updatedAt: T1 }),
        contact({ id: 'remote-only' }),
      ],
      interactions: [
        interaction('int_remote'),
        interaction('int_remote_email', { source: 'email-sync' }),
      ],
      nudges: [nudge('n1', 'pending'), nudge('n2', 'dismissed'), nudge('n3', 'snoozed')],
    });

    const once = mergeGraphs(local, remote);
    const twice = mergeGraphs(once, remote);

    expect(byId(twice.interactions)).toEqual(byId(once.interactions));
    expect(byId(twice.contacts)).toEqual(byId(once.contacts));
    expect(byId(twice.nudges)).toEqual(byId(once.nudges));
  });
});

describe('mergeGraphs — email-sync interactions are server-owned', () => {
  test('remote email-sync interactions appear in the merge even if local never saw them', () => {
    const local = baseDB({ interactions: [] });
    const remote = baseRemote({ interactions: [interaction('int_email', { source: 'email-sync' })] });
    const merged = mergeGraphs(local, remote);
    expect(merged.interactions.map((i) => i.id)).toContain('int_email');
  });

  test('a local graph missing a remote email-sync row never deletes it, and a stale local email-sync copy never wins', () => {
    const local = baseDB({ interactions: [interaction('int_stale_email', { source: 'email-sync' })] });
    const remote = baseRemote({ interactions: [interaction('int_fresh_email', { source: 'email-sync' })] });
    const ids = mergeGraphs(local, remote).interactions.map((i) => i.id);
    expect(ids).toEqual(['int_fresh_email']);
    expect(ids).not.toContain('int_stale_email');
  });
});

describe('mergeGraphs — newest wins for contacts/contexts/personas', () => {
  test('contacts: newer updatedAt wins per id; unmatched rows union from both sides', () => {
    const local = baseDB({
      contacts: [
        contact({ id: 'both', role: 'Local Edit', updatedAt: T2 }),
        contact({ id: 'local-only', updatedAt: T1 }),
      ],
    });
    const remote = baseRemote({
      contacts: [
        contact({ id: 'both', role: 'Remote Edit', updatedAt: T1 }),
        contact({ id: 'remote-only' }),
      ],
    });
    const merged = mergeGraphs(local, remote);
    expect(merged.contacts.find((c) => c.id === 'both')!.role).toBe('Local Edit');
    expect(merged.contacts.map((c) => c.id).sort()).toEqual(['both', 'local-only', 'remote-only']);
  });

  test('contexts: newer updatedAt wins per id', () => {
    const local = baseDB({
      contexts: [{ id: 'ctx1', contactId: 'c1', whyMatters: 'Local', createdAt: T0, updatedAt: T2 }],
    });
    const remote = baseRemote({
      contexts: [{ id: 'ctx1', contactId: 'c1', whyMatters: 'Remote', createdAt: T0, updatedAt: T1 }],
    });
    expect(mergeGraphs(local, remote).contexts[0].whyMatters).toBe('Local');
  });

  test('personas: newer updatedAt wins per id', () => {
    const local = baseDB({
      personas: [{ id: 'p1', name: 'Local Name', isDefault: true, updatedAt: T1 }],
    });
    const remote = baseRemote({
      personas: [{ id: 'p1', name: 'Remote Name', isDefault: true, updatedAt: T2 }],
    });
    expect(mergeGraphs(local, remote).personas[0].name).toBe('Remote Name');
  });
});

describe('mergeGraphs — archived is a one-way latch', () => {
  test('remote archived beats a newer local non-archived stamp', () => {
    const remote = baseRemote({ contacts: [contact({ status: 'archived', updatedAt: T1 })] });
    const local = baseDB({ contacts: [contact({ company: 'Acme', updatedAt: T2 })] });
    const merged = mergeGraphs(local, remote);
    const c = merged.contacts.find((x) => x.id === 'c1')!;
    expect(c.status).toBe('archived');
    expect(c.company).toBe('Acme'); // newest fields still win — only status latches
  });

  test('local archived beats a newer remote non-archived stamp', () => {
    const local = baseDB({ contacts: [contact({ status: 'archived', updatedAt: T1 })] });
    const remote = baseRemote({ contacts: [contact({ company: 'Acme Remote', updatedAt: T2 })] });
    const merged = mergeGraphs(local, remote);
    const c = merged.contacts.find((x) => x.id === 'c1')!;
    expect(c.status).toBe('archived');
    expect(c.company).toBe('Acme Remote');
  });
});

describe('mergeGraphs — nudge state precedence', () => {
  test('acted beats pending, regardless of which side is more settled', () => {
    const local = baseDB({ nudges: [nudge('n1', 'acted')] });
    const remote = baseRemote({ nudges: [nudge('n1', 'pending')] });
    expect(mergeGraphs(local, remote).nudges.find((n) => n.id === 'n1')!.state).toBe('acted');
    // and the reverse: remote settled, local pending
    const local2 = baseDB({ nudges: [nudge('n1', 'pending')] });
    const remote2 = baseRemote({ nudges: [nudge('n1', 'acted')] });
    expect(mergeGraphs(local2, remote2).nudges.find((n) => n.id === 'n1')!.state).toBe('acted');
  });

  test('dismissed beats snoozed beats pending', () => {
    const local = baseDB({ nudges: [nudge('n1', 'dismissed'), nudge('n2', 'pending')] });
    const remote = baseRemote({ nudges: [nudge('n1', 'snoozed'), nudge('n2', 'snoozed')] });
    const merged = mergeGraphs(local, remote);
    expect(merged.nudges.find((n) => n.id === 'n1')!.state).toBe('dismissed');
    expect(merged.nudges.find((n) => n.id === 'n2')!.state).toBe('snoozed');
  });
});

describe('mergeGraphs — profile merge', () => {
  test('remote.isPro wins (server owns billing); local notificationsEnabled wins', () => {
    const merged = mergeGraphs(baseDB({}), baseRemote({}));
    expect(merged.profile.isPro).toBe(true); // remote, webhook-written
    expect(merged.profile.notificationsEnabled).toBe(true); // local device
  });

  test('local device wins even when remote isPro is false and local is true (server truth still wins)', () => {
    const local = baseDB({ profile: { name: 'L', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' } });
    const remote = baseRemote({ profile: { name: 'R', isPro: false, notificationsEnabled: true, defaultPersonaId: 'p1' } });
    const merged = mergeGraphs(local, remote);
    expect(merged.profile.isPro).toBe(false); // remote's billing state wins either direction
    expect(merged.profile.notificationsEnabled).toBe(false); // local's device setting wins either direction
  });
});

// --- pullGraph -------------------------------------------------------------

describe('pullGraph', () => {
  test('maps snake_case rows back into the camelCase GraphData shape', async () => {
    const { client } = createMockClient({
      profiles: [
        {
          user_id: 'u1',
          graph_version: 7,
          name: 'Remote Name',
          role: null,
          company: null,
          email: null,
          phone: null,
          city: null,
          is_pro: true,
          timezone: 'UTC',
          notifications_enabled: false,
          default_persona_id: 'p1',
          onboarded: true,
        },
      ],
      personas: [
        {
          id: 'p1',
          user_id: 'u1',
          name: 'P',
          tagline: null,
          role: null,
          company: null,
          display_name: null,
          email: null,
          phone: null,
          is_default: true,
          updated_at: T1,
        },
      ],
      contacts: [
        {
          id: 'c1',
          user_id: 'u1',
          persona_id: 'p1',
          first_name: 'A',
          last_name: null,
          email: null,
          phone: null,
          work_email: 'a.work@example.com',
          work_phone: '555-0100',
          company: null,
          role: null,
          city: null,
          birthday: null,
          category: 'friend',
          importance: 2,
          cadence_days: 30,
          source: 'manual',
          created_at: T0,
          kind: 'person',
          status: 'active',
          evaluated_at: null,
          alt_emails: null,
          alt_phones: null,
          linkedin: null,
          card_token: null,
          updated_at: T1,
        },
      ],
      contexts: [],
      interactions: [
        { id: 'int1', user_id: 'u1', contact_id: 'c1', type: 'call', occurred_at: T1, note: null, source: 'manual' },
      ],
      hooks: [],
      nudges: [],
      connected_accounts: [],
    });

    const data = await pullGraph(client, 'u1');
    expect(data.graphVersion).toBe(7);
    expect(data.onboarded).toBe(true);
    expect(data.profile).toMatchObject({ name: 'Remote Name', isPro: true, timezone: 'UTC' });
    expect(data.personas[0]).toMatchObject({ id: 'p1', name: 'P', isDefault: true });
    expect(data.contacts[0]).toMatchObject({
      id: 'c1',
      firstName: 'A',
      cadenceDays: 30,
      category: 'friend',
      workEmail: 'a.work@example.com',
      workPhone: '555-0100',
    });
    expect(data.interactions[0]).toMatchObject({ id: 'int1', contactId: 'c1', occurredAt: T1, source: 'manual' });
  });

  test('a missing profile row yields onboarded=false, graphVersion=0, profile=null', async () => {
    const { client } = createMockClient({});
    const data = await pullGraph(client, 'u1');
    expect(data).toMatchObject({ onboarded: false, graphVersion: 0, profile: null });
  });
});

// --- pushGraph ---------------------------------------------------------------

describe('pushGraph — version claim (compare-and-bump)', () => {
  test('claims the expected version and returns it bumped by one', async () => {
    const { client, tables } = createMockClient({
      profiles: [
        {
          user_id: 'u1',
          graph_version: 3,
          name: 'Old',
          is_pro: false,
          notifications_enabled: false,
          default_persona_id: 'p1',
          onboarded: false,
        },
      ],
    });
    const db = baseDB({ profile: { name: 'New', isPro: false, notificationsEnabled: true, defaultPersonaId: 'p1' } });
    const newVersion = await pushGraph(client, 'u1', db, 3);
    expect(newVersion).toBe(4);
    expect(tables.profiles[0].graph_version).toBe(4);
    expect(tables.profiles[0].name).toBe('New');
  });

  test('throws GraphVersionConflict when expectedVersion is stale, and writes nothing', async () => {
    const { client, tables } = createMockClient({
      profiles: [
        {
          user_id: 'u1',
          graph_version: 5,
          name: 'Server Truth',
          is_pro: false,
          notifications_enabled: false,
          default_persona_id: 'p1',
          onboarded: false,
        },
      ],
    });
    const db = baseDB({});
    await expect(pushGraph(client, 'u1', db, 3)).rejects.toThrow(GraphVersionConflict);
    expect(tables.profiles[0].graph_version).toBe(5); // untouched
    expect(tables.profiles[0].name).toBe('Server Truth'); // untouched
  });
});

describe('pushGraph — email-sync interactions are server-owned', () => {
  test('a push never upserts or deletes email-sync rows, and still deletes stale client rows', async () => {
    const { client, tables } = createMockClient({
      profiles: [
        {
          user_id: 'u1',
          graph_version: 0,
          name: 'X',
          is_pro: false,
          notifications_enabled: false,
          default_persona_id: 'p1',
          onboarded: false,
        },
      ],
      interactions: [
        {
          id: 'int_email_1',
          user_id: 'u1',
          contact_id: 'c1',
          type: 'email',
          occurred_at: T1,
          note: null,
          source: 'email-sync',
        },
        {
          id: 'int_manual_stale',
          user_id: 'u1',
          contact_id: 'c1',
          type: 'call',
          occurred_at: T0,
          note: null,
          source: 'manual',
        },
      ],
    });
    const db = baseDB({ interactions: [interaction('int_manual_new')] });

    await pushGraph(client, 'u1', db, 0);

    const ids = tables.interactions.map((r) => r.id).sort();
    expect(ids).toEqual(['int_email_1', 'int_manual_new']); // stale manual row deleted, email row kept
    const emailRow = tables.interactions.find((r) => r.id === 'int_email_1');
    expect(emailRow).toMatchObject({ source: 'email-sync', type: 'email' }); // never touched by the push
  });
});

describe('pushGraph — replaces client tables (upsert + delete-missing)', () => {
  test('a contact missing from the pushed graph is deleted server-side', async () => {
    const { client, tables } = createMockClient({
      profiles: [
        {
          user_id: 'u1',
          graph_version: 0,
          name: 'X',
          is_pro: false,
          notifications_enabled: false,
          default_persona_id: 'p1',
          onboarded: false,
        },
      ],
      contacts: [
        {
          id: 'stale',
          user_id: 'u1',
          persona_id: 'p1',
          first_name: 'Old',
          category: 'other',
          importance: 1,
          cadence_days: 30,
          source: 'manual',
          created_at: T0,
        },
      ],
    });
    const db = baseDB({ contacts: [contact({ id: 'kept' })] });

    await pushGraph(client, 'u1', db, 0);

    expect(tables.contacts.map((r) => r.id)).toEqual(['kept']);
  });

  test('work_email/work_phone round-trip through toContactRow, and are null (not omitted) when unset', async () => {
    const { client, tables } = createMockClient({
      profiles: [
        {
          user_id: 'u1',
          graph_version: 0,
          name: 'X',
          is_pro: false,
          notifications_enabled: false,
          default_persona_id: 'p1',
          onboarded: false,
        },
      ],
    });
    const db = baseDB({
      contacts: [
        contact({ id: 'has-work', workEmail: 'w@example.com', workPhone: '555-0100' }),
        contact({ id: 'no-work' }),
      ],
    });

    await pushGraph(client, 'u1', db, 0);

    const withWork = tables.contacts.find((r) => r.id === 'has-work');
    expect(withWork).toMatchObject({ work_email: 'w@example.com', work_phone: '555-0100' });
    const withoutWork = tables.contacts.find((r) => r.id === 'no-work');
    // Every row in a push payload must have uniform keys (PostgREST) — the
    // key must be present with a null value, not missing.
    expect(withoutWork).toHaveProperty('work_email', null);
    expect(withoutWork).toHaveProperty('work_phone', null);
  });

  test('draftMeta/draft_meta round-trips through toInteractionRow, and is null (not omitted) when unset', async () => {
    const { client, tables } = createMockClient({
      profiles: [
        {
          user_id: 'u1',
          graph_version: 0,
          name: 'X',
          is_pro: false,
          notifications_enabled: false,
          default_persona_id: 'p1',
          onboarded: false,
        },
      ],
    });
    const db = baseDB({
      contacts: [contact({ id: 'c1' })],
      interactions: [
        interaction('int-with-meta', {
          draftMeta: { tone: 'sincere', channel: 'text', edited: true },
        }),
        interaction('int-without-meta'),
      ],
    });

    await pushGraph(client, 'u1', db, 0);

    const withMeta = tables.interactions.find((r) => r.id === 'int-with-meta');
    expect(withMeta).toMatchObject({
      draft_meta: { tone: 'sincere', channel: 'text', edited: true },
    });
    const withoutMeta = tables.interactions.find((r) => r.id === 'int-without-meta');
    // Every row in a push payload must have uniform keys (PostgREST) — the
    // key must be present with a null value, not missing.
    expect(withoutMeta).toHaveProperty('draft_meta', null);
  });
});
