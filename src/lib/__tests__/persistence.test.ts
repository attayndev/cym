import { loadDB, saveDB } from '@/lib/store';
import type { DB } from '@/lib/types';

const db: DB = {
  profile: { name: 'Me', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
  personas: [{ id: 'p1', name: 'P', isDefault: true }],
  contacts: [{ id: 'jill', personaId: 'p1', firstName: 'Jill', lastName: 'Wynn', category: 'other', importance: 2, cadenceDays: 90, source: 'import', createdAt: '2026-07-01T00:00:00.000Z', kind: 'person', status: 'active' }],
  contexts: [],
  interactions: [{ id: 'f1', contactId: 'jill', type: 'call', occurredAt: '2026-07-08T20:00:00.000Z', source: 'manual' }],
  hooks: [], nudges: [], accounts: [], onboarded: true,
};

test('app restart: interactions survive a save/load roundtrip', async () => {
  await saveDB(db);
  const loaded = await loadDB();
  expect(loaded?.interactions).toHaveLength(1);
  expect(loaded?.interactions[0].id).toBe('f1');
  expect(loaded?.contacts[0].id).toBe('jill');
});
