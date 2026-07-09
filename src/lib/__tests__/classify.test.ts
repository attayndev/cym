import { classifyContact, ensureClassified, isActiveContact } from '@/lib/classify';
import type { Contact, DB } from '@/lib/types';

const base = (over: Partial<Contact>): Contact => ({
  id: over.id ?? 'c1',
  personaId: 'p1',
  firstName: 'Test',
  category: 'friend',
  importance: 2,
  cadenceDays: 90,
  source: 'import',
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

describe('classifyContact', () => {
  test('normal first+last name is a person', () => {
    expect(classifyContact(base({ firstName: 'Julia', lastName: 'Chen' }))).toBe('person');
    expect(
      classifyContact(base({ firstName: 'Sal', lastName: 'Costa', company: "Joe's Pizza" })),
    ).toBe('person'); // works AT a business, still a person
  });

  test('business words in the name are a business', () => {
    expect(classifyContact(base({ firstName: "Tony's Pizza" }))).toBe('business');
    expect(classifyContact(base({ firstName: 'Uptown', lastName: 'Barber Shop' }))).toBe(
      'business',
    );
    expect(classifyContact(base({ firstName: 'Acme Plumbing LLC' }))).toBe('business');
  });

  test('business-style email locals are a business', () => {
    expect(classifyContact(base({ firstName: 'Bella', email: 'info@bellasalon.com' }))).toBe(
      'business',
    );
    expect(
      classifyContact(base({ firstName: 'Front', lastName: 'Desk', email: 'frontdesk@hotel.com' })),
    ).toBe('business');
  });

  test('digits in a single-field name are a business', () => {
    expect(classifyContact(base({ firstName: '24/7 Locksmith' }))).toBe('business');
  });

  test('three-plus-word single-field names are a business', () => {
    expect(classifyContact(base({ firstName: 'Ace Heating And Cooling' }))).toBe('business');
  });

  test('a lone first name stays unclear', () => {
    expect(classifyContact(base({ firstName: 'Mike' }))).toBe('unclear');
  });

  test('word boundaries do not false-positive on substrings', () => {
    expect(classifyContact(base({ firstName: 'Shopna', lastName: 'Rahman' }))).toBe('person');
    expect(classifyContact(base({ firstName: 'Cole', lastName: 'Salomon' }))).toBe('person');
  });
});

describe('ensureClassified', () => {
  const db = (contacts: Contact[]): DB => ({
    profile: { name: 'Me', isPro: false, notificationsEnabled: false, defaultPersonaId: 'p1' },
    personas: [{ id: 'p1', name: 'Personal', isDefault: true }],
    contacts,
    contexts: [],
    interactions: [],
    hooks: [],
    nudges: [],
    accounts: [],
    onboarded: true,
  });

  test('returns the same reference when everything is classified', () => {
    const d = db([base({ kind: 'person', status: 'active' })]);
    expect(ensureClassified(d)).toBe(d);
  });

  test('classifies legacy imports and defaults status to active', () => {
    const d = db([
      base({ id: 'a', firstName: "Tony's Pizza" }),
      base({ id: 'b', firstName: 'Julia', lastName: 'Chen' }),
    ]);
    const out = ensureClassified(d);
    expect(out).not.toBe(d);
    expect(out.contacts[0].kind).toBe('business');
    expect(out.contacts[1].kind).toBe('person');
    expect(out.contacts.every((c) => c.status === 'active')).toBe(true);
  });

  test('captured contacts are people without running heuristics', () => {
    const captured = base({ firstName: "Tony's Pizza", source: 'manual' });
    const out = ensureClassified(db([captured]));
    expect(out.contacts[0].kind).toBe('person');
  });
});

describe('isActiveContact', () => {
  test('archived contacts are inactive; everything else is active', () => {
    expect(isActiveContact(base({ status: 'archived' }))).toBe(false);
    expect(isActiveContact(base({ status: 'active' }))).toBe(true);
    expect(isActiveContact(base({}))).toBe(true);
  });
});
