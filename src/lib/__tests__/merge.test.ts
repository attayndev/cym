import { mergeGraphs, type GraphData } from '@/lib/sync';
import type { Contact, DB, Interaction, Nudge } from '@/lib/types';

const T0 = '2026-07-01T00:00:00.000Z';
const T1 = '2026-07-09T10:00:00.000Z';
const T2 = '2026-07-09T11:00:00.000Z';

const contact = (over: Partial<Contact>): Contact => ({
  id: over.id ?? 'c1',
  personaId: 'p1',
  firstName: 'T',
  category: 'other',
  importance: 1,
  cadenceDays: 90,
  source: 'import',
  createdAt: T0,
  kind: 'person',
  status: 'active',
  ...over,
});

const interaction = (id: string, source: Interaction['source'] = 'manual'): Interaction => ({
  id,
  contactId: 'c1',
  type: 'call',
  occurredAt: T1,
  source,
});

const nudge = (id: string, state: Nudge['state']): Nudge => ({
  id,
  contactId: 'c1',
  kind: 'decay',
  headline: { key: 'nudgec.decay.headline' },
  reason: { key: 'nudgec.decay.reason' },
  suggestedAction: { key: 'nudgec.decay.action.pro' },
  state,
  createdAt: T0,
  score: 1,
});

const localDB = (over: Partial<DB>): DB => ({
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

const remoteData = (over: Partial<GraphData>): GraphData => ({
  profile: { name: 'Remote Name', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
  onboarded: true,
  graphVersion: 5,
  personas: [{ id: 'p1', name: 'P', isDefault: true }],
  contacts: [],
  contexts: [],
  interactions: [],
  hooks: [],
  nudges: [],
  accounts: [],
  ...over,
});

describe('mergeGraphs — the data-loss fix', () => {
  test('an unpushed local interaction SURVIVES a pull (the reported bug)', () => {
    const local = localDB({ interactions: [interaction('int_local_touch')] });
    const remote = remoteData({ interactions: [] });
    const merged = mergeGraphs(local, remote);
    expect(merged.interactions.map((i) => i.id)).toContain('int_local_touch');
  });

  test('manual interactions union from both sides; email-sync is remote-owned', () => {
    const local = localDB({
      interactions: [interaction('int_a'), interaction('int_stale_email', 'email-sync')],
    });
    const remote = remoteData({
      interactions: [interaction('int_b'), interaction('int_fresh_email', 'email-sync')],
    });
    const ids = mergeGraphs(local, remote).interactions.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['int_a', 'int_b', 'int_fresh_email']));
    expect(ids).not.toContain('int_stale_email');
  });

  test('newest updatedAt wins per contact; unknown rows union from both sides', () => {
    const local = localDB({
      contacts: [
        contact({ id: 'both', role: 'Local Edit', updatedAt: T2 }),
        contact({ id: 'local-only', updatedAt: T1 }),
      ],
    });
    const remote = remoteData({
      contacts: [
        contact({ id: 'both', role: 'Remote Edit', updatedAt: T1 }),
        contact({ id: 'remote-only' }),
      ],
    });
    const merged = mergeGraphs(local, remote);
    expect(merged.contacts.find((c) => c.id === 'both')!.role).toBe('Local Edit');
    expect(merged.contacts.map((c) => c.id).sort()).toEqual(['both', 'local-only', 'remote-only']);
  });

  test('remote newer beats local older on the same row', () => {
    const local = localDB({ contacts: [contact({ id: 'x', role: 'Old Local', updatedAt: T1 })] });
    const remote = remoteData({ contacts: [contact({ id: 'x', role: 'New Remote', updatedAt: T2 })] });
    expect(mergeGraphs(local, remote).contacts[0].role).toBe('New Remote');
  });

  test('nudge verdicts survive from either side (acted beats pending)', () => {
    const local = localDB({ nudges: [nudge('n1', 'acted')] });
    const remote = remoteData({ nudges: [nudge('n1', 'pending'), nudge('n2', 'dismissed')] });
    const merged = mergeGraphs(local, remote);
    expect(merged.nudges.find((n) => n.id === 'n1')!.state).toBe('acted');
    expect(merged.nudges.find((n) => n.id === 'n2')!.state).toBe('dismissed');
  });

  test('server owns isPro; device owns notifications + timezone', () => {
    const merged = mergeGraphs(localDB({}), remoteData({}));
    expect(merged.profile.isPro).toBe(true); // remote (webhook-written)
    expect(merged.profile.notificationsEnabled).toBe(true); // local device
    expect(merged.profile.timezone).toBe('America/New_York'); // local device
  });
});
