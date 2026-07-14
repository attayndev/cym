import {
  contactsForPersona,
  personaCardFields,
  reassignContacts,
  removePersona,
  resolveActivePersonaId,
} from '../personas';
import type { Contact, DB, Persona } from '../types';

const personas: Persona[] = [
  { id: 'psn_a', name: 'Personal', isDefault: true },
  { id: 'psn_b', name: 'Founder', tagline: 'Building CYM', role: 'CEO', isDefault: false },
];

function contact(id: string, personaId: string): Contact {
  return {
    id,
    personaId,
    firstName: id,
    category: 'friend',
    importance: 2,
    cadenceDays: 30,
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('resolveActivePersonaId', () => {
  it('keeps a stored id that still exists', () => {
    expect(resolveActivePersonaId('psn_b', personas, 'psn_a')).toBe('psn_b');
  });
  it('falls back to the default when the stored id dangles', () => {
    expect(resolveActivePersonaId('psn_gone', personas, 'psn_a')).toBe('psn_a');
  });
  it('falls back to the first persona when the default dangles too', () => {
    expect(resolveActivePersonaId(null, personas, 'psn_gone')).toBe('psn_a');
  });
  it('returns the default id when there are no personas at all', () => {
    expect(resolveActivePersonaId(null, [], 'psn_x')).toBe('psn_x');
  });
});

describe('contactsForPersona', () => {
  it('filters to the given persona', () => {
    const list = [contact('c1', 'psn_a'), contact('c2', 'psn_b'), contact('c3', 'psn_a')];
    expect(contactsForPersona(list, 'psn_a').map((c) => c.id)).toEqual(['c1', 'c3']);
  });
});

describe('personaCardFields', () => {
  const profile = {
    name: 'Yan',
    role: 'Engineer',
    company: 'Dayjob Inc',
    email: 'yan@example.com',
    phone: '+1 555',
  };

  it('cards own their fields — nothing inherits from the profile', () => {
    const f = personaCardFields(personas[0], profile);
    expect(f.role).toBeUndefined();
    expect(f.company).toBeUndefined();
    expect(f.email).toBeUndefined();
    expect(f.phone).toBeUndefined();
    expect(f.tagline).toBeUndefined();
  });

  it('persona fields are the card', () => {
    const proPersona: Persona = {
      id: 'psn_c',
      name: 'Professional',
      isDefault: false,
      displayName: 'Yan T.',
      email: 'yan@work.example.com',
      phone: '+1 999',
      role: 'CEO',
      company: 'CYM',
      tagline: 'Building CYM',
    };
    const f = personaCardFields(proPersona, profile);
    expect(f).toEqual({
      name: 'Yan T.',
      role: 'CEO',
      company: 'CYM',
      tagline: 'Building CYM',
      email: 'yan@work.example.com',
      phone: '+1 999',
    });
  });

  it('name does not inherit either — no base layer anywhere', () => {
    expect(personaCardFields(undefined, profile).name).toBe('');
  });
});

describe('reassignContacts', () => {
  it('moves contacts between personas', () => {
    const list = [contact('c1', 'psn_a'), contact('c2', 'psn_b')];
    const moved = reassignContacts(list, 'psn_b', 'psn_a');
    expect(moved.every((c) => c.personaId === 'psn_a')).toBe(true);
    expect(moved.find((c) => c.id === 'c1')).toBe(list[0]);
  });
});

describe('removePersona', () => {
  const db = (over: Partial<Pick<DB, 'personas' | 'contacts' | 'profile'>> = {}): Pick<
    DB,
    'personas' | 'contacts' | 'profile'
  > => ({
    personas: [
      { id: 'psn_1', name: 'Default', isDefault: true },
      { id: 'psn_2', name: 'Second', isDefault: false },
      { id: 'psn_3', name: 'Third', isDefault: false },
    ],
    contacts: [contact('c1', 'psn_1'), contact('c2', 'psn_2'), contact('c3', 'psn_3')],
    profile: {
      name: 'Owner',
      isPro: false,
      notificationsEnabled: true,
      defaultPersonaId: 'psn_1',
    },
    ...over,
  });

  const blank = { id: 'psn_blank', name: 'Personal' };

  it('deleting a non-default card reassigns its contacts to the default', () => {
    const result = removePersona(db(), 'psn_2', 'psn_2', blank);
    expect(result).not.toBeNull();
    expect(result!.defaultPersonaId).toBe('psn_1');
    expect(result!.personas.map((p) => p.id)).toEqual(['psn_1', 'psn_3']);
    expect(result!.personas.find((p) => p.id === 'psn_1')!.isDefault).toBe(true);
    expect(result!.contacts.find((c) => c.id === 'c2')!.personaId).toBe('psn_1');
  });

  it('deleting the default promotes the active surviving card', () => {
    const result = removePersona(db(), 'psn_1', 'psn_3', blank);
    expect(result).not.toBeNull();
    expect(result!.defaultPersonaId).toBe('psn_3');
    expect(result!.personas.find((p) => p.id === 'psn_3')!.isDefault).toBe(true);
    expect(result!.personas.find((p) => p.id === 'psn_2')!.isDefault).toBe(false);
    expect(result!.contacts.find((c) => c.id === 'c1')!.personaId).toBe('psn_3');
    expect(result!.nextActiveId).toBeNull();
  });

  it('deleting the default active card promotes the first remaining card', () => {
    const result = removePersona(db(), 'psn_1', 'psn_1', blank);
    expect(result).not.toBeNull();
    expect(result!.defaultPersonaId).toBe('psn_2');
    expect(result!.personas.find((p) => p.id === 'psn_2')!.isDefault).toBe(true);
    expect(result!.nextActiveId).toBe('psn_2');
  });

  it('deleting the last card replaces it with a single blank default', () => {
    const single = db({
      personas: [{ id: 'psn_1', name: 'Default', isDefault: true }],
      contacts: [contact('c1', 'psn_1')],
      profile: {
        name: 'Owner',
        isPro: false,
        notificationsEnabled: true,
        defaultPersonaId: 'psn_1',
      },
    });
    const result = removePersona(single, 'psn_1', 'psn_1', blank);
    expect(result).toEqual({
      personas: [{ id: 'psn_blank', name: 'Personal', isDefault: true }],
      contacts: [{ ...single.contacts[0], personaId: 'psn_blank' }],
      defaultPersonaId: 'psn_blank',
      nextActiveId: 'psn_blank',
    });
  });

  it('returns null for an unknown persona id', () => {
    expect(removePersona(db(), 'psn_gone', 'psn_1', blank)).toBeNull();
  });
});

describe('removePersona — stale ids never inherit', () => {
  test('a stale active id (not in the roster) is never promoted', () => {
    const personas = [
      { id: 'p1', name: 'A', isDefault: true },
      { id: 'p2', name: 'B', isDefault: false },
    ];
    const db = {
      personas,
      contacts: [],
      profile: { name: '', isPro: false, notificationsEnabled: false, defaultPersonaId: 'p1' },
    };
    const result = removePersona(db, 'p1', 'p_ghost', { id: 'pb', name: 'Personal' });
    expect(result?.defaultPersonaId).toBe('p2');
    expect(result?.personas.every((p) => p.id !== 'p_ghost')).toBe(true);
  });

  test('a stale default id falls back to a surviving card on non-default delete', () => {
    const personas = [
      { id: 'p1', name: 'A', isDefault: false },
      { id: 'p2', name: 'B', isDefault: false },
    ];
    const db = {
      personas,
      contacts: [{ id: 'c1', personaId: 'p2', firstName: 'X', category: 'other' as const, importance: 1 as const, cadenceDays: 30, source: 'manual' as const, createdAt: '2026-01-01T00:00:00Z' }],
      profile: { name: '', isPro: false, notificationsEnabled: false, defaultPersonaId: 'p_gone' },
    };
    const result = removePersona(db, 'p2', 'p1', { id: 'pb', name: 'Personal' });
    expect(result?.defaultPersonaId).toBe('p1');
    expect(result?.contacts[0]?.personaId).toBe('p1');
  });
});
