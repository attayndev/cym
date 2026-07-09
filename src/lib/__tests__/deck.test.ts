import { evaluatePool, evaluateRanked, localDayKey } from '@/lib/deck';
import type { Contact, DB, Interaction } from '@/lib/types';

const contact = (over: Partial<Contact>): Contact => ({
  id: over.id ?? `c_${Math.random().toString(36).slice(2)}`,
  personaId: 'p1',
  firstName: 'Test',
  category: 'other',
  importance: 1,
  cadenceDays: 90,
  source: 'import',
  createdAt: '2026-06-01T00:00:00.000Z',
  kind: 'person',
  status: 'active',
  ...over,
});

const db = (contacts: Contact[], interactions: Interaction[] = []): DB => ({
  profile: { name: 'Me', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
  personas: [{ id: 'p1', name: 'Personal', isDefault: true }],
  contacts,
  contexts: [],
  interactions,
  hooks: [],
  nudges: [],
  accounts: [],
  onboarded: true,
});

const NOW = new Date('2026-07-06T12:00:00');

describe('evaluatePool', () => {
  test('includes only active, unevaluated, imported people', () => {
    const d = db([
      contact({ id: 'in' }),
      contact({ id: 'captured', source: 'manual' }),
      contact({ id: 'evaluated', evaluatedAt: '2026-07-01T00:00:00.000Z' }),
      contact({ id: 'archived', status: 'archived' }),
      contact({ id: 'biz', kind: 'business' }),
      contact({ id: 'unclear', kind: 'unclear' }),
    ]);
    expect(evaluatePool(d).map((e) => e.contact.id)).toEqual(['in']);
  });

  test('aggregates email-sync signal per contact', () => {
    const ints: Interaction[] = [
      { id: 'i1', contactId: 'a', type: 'email', occurredAt: '2026-05-01T00:00:00.000Z', source: 'email-sync' },
      { id: 'i2', contactId: 'a', type: 'email', occurredAt: '2026-06-15T00:00:00.000Z', source: 'email-sync' },
      { id: 'i3', contactId: 'a', type: 'call', occurredAt: '2026-06-20T00:00:00.000Z', source: 'manual' },
    ];
    const [e] = evaluatePool(db([contact({ id: 'a' })], ints));
    expect(e.emailCount).toBe(2);
    expect(e.lastEmailAt).toBe('2026-06-15T00:00:00.000Z');
  });
});

describe('evaluateRanked', () => {
  test('correspondence outranks everything', () => {
    const ints: Interaction[] = [
      { id: 'i1', contactId: 'busy', type: 'email', occurredAt: '2026-06-01T00:00:00.000Z', source: 'email-sync' },
    ];
    const d = db(
      [contact({ id: 'complete', email: 'x@y.com', phone: '1', birthday: '01-01' }), contact({ id: 'busy' })],
      ints,
    );
    expect(evaluateRanked(d, NOW).map((e) => e.contact.id)).toEqual(['busy', 'complete']);
  });

  test('deterministic within a day, rotates across days', () => {
    const many = Array.from({ length: 30 }, (_, i) => contact({ id: `c${i}` }));
    const d = db(many);
    const today1 = evaluateRanked(d, NOW).map((e) => e.contact.id);
    const today2 = evaluateRanked(d, NOW).map((e) => e.contact.id);
    const tomorrow = evaluateRanked(d, new Date('2026-07-07T12:00:00')).map((e) => e.contact.id);
    expect(today1).toEqual(today2);
    expect(tomorrow).not.toEqual(today1); // 30 zero-signal ids: astronomically unlikely to match
  });

  test('filters by persona when given', () => {
    const d = db([contact({ id: 'p1c' }), contact({ id: 'p2c', personaId: 'p2' })]);
    expect(evaluateRanked(d, NOW, 'p2').map((e) => e.contact.id)).toEqual(['p2c']);
  });
});

describe('localDayKey', () => {
  test('uses local calendar date', () => {
    expect(localDayKey(new Date(2026, 6, 6, 23, 59))).toBe('2026-07-06');
  });
});
