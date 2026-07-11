import {
  contactsForPersona,
  personaCardFields,
  reassignContacts,
  resolveActivePersonaId,
} from '../personas';
import type { Contact, Persona } from '../types';

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

  it('name alone keeps the profile safety net so a card is never blank', () => {
    expect(personaCardFields(personas[0], profile).name).toBe('Yan');
    expect(personaCardFields(undefined, profile).name).toBe('Yan');
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
