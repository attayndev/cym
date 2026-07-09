import { canTrackMore, FREE_TRACK_LIMIT, isTracked, trackedContacts } from '@/lib/tier';
import type { Contact, DB } from '@/lib/types';

const contact = (over: Partial<Contact>): Contact => ({
  id: over.id ?? `c${Math.random()}`,
  personaId: 'p1',
  firstName: 'T',
  category: 'other',
  importance: 1,
  cadenceDays: 90,
  source: 'import',
  createdAt: '2026-06-01T00:00:00.000Z',
  kind: 'person',
  status: 'active',
  ...over,
});

const db = (contacts: Contact[], isPro = false): DB => ({
  profile: { name: 'Me', isPro, notificationsEnabled: false, defaultPersonaId: 'p1' },
  personas: [{ id: 'p1', name: 'P', isDefault: true }],
  contacts, contexts: [], interactions: [], hooks: [], nudges: [], accounts: [], onboarded: true,
});

describe('tier', () => {
  test('tracked = captured or Track-verdict; imports/archived/business are not', () => {
    expect(isTracked(contact({ source: 'manual' }))).toBe(true);
    expect(isTracked(contact({ evaluatedAt: '2026-07-01T00:00:00.000Z' }))).toBe(true);
    expect(isTracked(contact({}))).toBe(false);
    expect(isTracked(contact({ source: 'manual', status: 'archived' }))).toBe(false);
    expect(isTracked(contact({ source: 'manual', kind: 'business' }))).toBe(false);
  });

  test('free caps at FREE_TRACK_LIMIT; Plus never caps', () => {
    const nine = Array.from({ length: FREE_TRACK_LIMIT - 1 }, (_, i) =>
      contact({ id: `m${i}`, source: 'manual' }));
    expect(canTrackMore(db(nine))).toBe(true);
    const ten = [...nine, contact({ id: 'last', source: 'manual' })];
    expect(canTrackMore(db(ten))).toBe(false);
    expect(canTrackMore(db(ten, true))).toBe(true);
    expect(trackedContacts(db(ten)).length).toBe(FREE_TRACK_LIMIT);
  });
});
