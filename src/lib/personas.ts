import type { Contact, DB, Persona, UserProfile } from '@/lib/types';

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

/** The sharing card for a persona: name/email/phone/role/company all fall
 *  back persona → profile, so a new persona inherits the profile's identity
 *  until it's customized with its own card fields. */
export function personaCardFields(
  persona: Persona | undefined,
  profile: Pick<UserProfile, 'name' | 'role' | 'company' | 'email' | 'phone'>,
): PersonaCardFields {
  // Cards own their fields — no inheritance, no base layer, no exceptions.
  // The profile is account identity; personas are the only card storage.
  return {
    name: persona?.displayName ?? '',
    role: persona?.role,
    company: persona?.company,
    tagline: persona?.tagline,
    email: persona?.email,
    phone: persona?.phone,
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

/** Delete a persona with auto-promotion. The default's heir is the active
 *  persona when it survives, else the first remaining; deleting the last
 *  card replaces it with a single blank default so the app always has one.
 *  Returns the personas/contacts/defaultPersonaId slice plus the id the
 *  active persona should move to (null = keep current). */
export function removePersona(
  db: Pick<DB, 'personas' | 'contacts' | 'profile'>,
  personaId: string,
  activePersonaId: string | null,
  blank: { id: string; name: string },
): {
  personas: Persona[];
  contacts: Contact[];
  defaultPersonaId: string;
  nextActiveId: string | null;
} | null {
  if (!db.personas.some((p) => p.id === personaId)) return null;

  const remaining = db.personas.filter((p) => p.id !== personaId);

  if (remaining.length === 0) {
    return {
      personas: [{ id: blank.id, name: blank.name, isDefault: true }],
      contacts: reassignContacts(db.contacts, personaId, blank.id),
      defaultPersonaId: blank.id,
      nextActiveId: activePersonaId === personaId ? blank.id : null,
    };
  }

  const wasDefault = db.profile.defaultPersonaId === personaId;
  // The heir must be a card that actually survives — guards against a stale
  // active/default id (e.g. a persona deleted on another device before sync).
  const survives = (pid: string | null) => remaining.some((p) => p.id === pid);
  const heir = wasDefault
    ? survives(activePersonaId)
      ? (activePersonaId as string)
      : remaining[0].id
    : survives(db.profile.defaultPersonaId)
      ? db.profile.defaultPersonaId
      : remaining[0].id;

  return {
    personas: remaining.map((p) => ({ ...p, isDefault: p.id === heir })),
    contacts: reassignContacts(db.contacts, personaId, heir),
    defaultPersonaId: heir,
    nextActiveId: activePersonaId === personaId ? heir : null,
  };
}
