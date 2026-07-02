import type { Contact, Persona, UserProfile } from '@/lib/types';

/** Resolve which persona is active: the stored device preference if it still
 *  exists, else the profile default, else the first persona. */
export function resolveActivePersonaId(
  stored: string | null,
  personas: Persona[],
  defaultPersonaId: string,
): string {
  if (stored && personas.some((p) => p.id === stored)) return stored;
  if (personas.some((p) => p.id === defaultPersonaId)) return defaultPersonaId;
  return personas[0]?.id ?? defaultPersonaId;
}

export function contactsForPersona(contacts: Contact[], personaId: string): Contact[] {
  return contacts.filter((c) => c.personaId === personaId);
}

export interface PersonaCardFields {
  name: string;
  role?: string;
  company?: string;
  tagline?: string;
  email?: string;
  phone?: string;
}

/** The sharing card for a persona: identity (name/email/phone) always comes
 *  from the profile; role/company fall back persona → profile. */
export function personaCardFields(
  persona: Persona | undefined,
  profile: Pick<UserProfile, 'name' | 'role' | 'company' | 'email' | 'phone'>,
): PersonaCardFields {
  return {
    name: profile.name,
    role: persona?.role ?? profile.role,
    company: persona?.company ?? profile.company,
    tagline: persona?.tagline,
    email: profile.email,
    phone: profile.phone,
  };
}

export function reassignContacts(
  contacts: Contact[],
  fromPersonaId: string,
  toPersonaId: string,
): Contact[] {
  return contacts.map((c) =>
    c.personaId === fromPersonaId ? { ...c, personaId: toPersonaId } : c,
  );
}
