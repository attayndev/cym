import { addDays, isoDate, monthDay } from '@/lib/dates';
import { id } from '@/lib/ids';
import type { Contact, ContextEntry, DB, Interaction } from '@/lib/types';

interface SeedSpec {
  contact: Omit<Contact, 'id' | 'personaId' | 'createdAt'> & { metDaysAgo: number };
  context?: Omit<ContextEntry, 'id' | 'contactId' | 'createdAt'>;
  lastTouchDaysAgo?: number;
  lastTouchType?: Interaction['type'];
}

/** A brand-new account: one default persona, no contacts, not yet onboarded. */
export function emptyDB(): DB {
  const personaId = id('psn');
  return {
    profile: {
      name: '',
      isPro: false,
      notificationsEnabled: false,
      defaultPersonaId: personaId,
    },
    personas: [{ id: personaId, name: 'Personal', isDefault: true }],
    contacts: [],
    contexts: [],
    interactions: [],
    hooks: [],
    nudges: [],
    accounts: [],
    onboarded: false,
  };
}

export function buildSeedDB(now: Date): DB {
  const personaId = id('psn');

  const specs: SeedSpec[] = [
    {
      contact: {
        firstName: 'Mom',
        phone: '+1 (555) 010-1955',
        city: 'Evanston, IL',
        birthday: monthDay(addDays(now, 3)),
        category: 'family',
        importance: 3,
        cadenceDays: 7,
        source: 'manual',
        metDaysAgo: 4000,
      },
      context: {
        whyMatters: "She's your mom.",
        discussed: 'Her garden, the neighbors, when you last ate a vegetable',
      },
      lastTouchDaysAgo: 16,
      lastTouchType: 'call',
    },
    {
      contact: {
        firstName: 'Maya',
        lastName: 'Chen',
        email: 'maya@looplight.io',
        company: 'Looplight',
        role: 'Founder',
        city: 'San Francisco',
        category: 'professional',
        importance: 2,
        cadenceDays: 30,
        source: 'qr',
        metDaysAgo: 12,
      },
      context: {
        whereMet: 'the First Round founder dinner',
        discussed: 'Hiring her first designer; the pain of design-founder fit',
        whyMatters: 'Sharp operator, great future collaborator or customer',
        commitment: 'Intro her to Sarah about design hiring',
        commitmentDueAt: isoDate(addDays(now, 1)),
      },
      lastTouchDaysAgo: 12,
      lastTouchType: 'met',
    },
    {
      contact: {
        firstName: 'James',
        lastName: 'Okafor',
        email: 'james@meridiancap.example',
        company: 'Meridian Capital',
        role: 'Partner',
        city: 'New York',
        category: 'mentor',
        importance: 3,
        cadenceDays: 60,
        source: 'manual',
        metDaysAgo: 900,
      },
      context: {
        whereMet: 'your first job — he ran the team',
        whyMatters: 'Best career advice you ever got. Opens doors.',
        discussed: 'Leaving operating roles for investing',
      },
      lastTouchDaysAgo: 240,
      lastTouchType: 'coffee',
    },
    {
      contact: {
        firstName: 'Priya',
        lastName: 'Nair',
        email: 'priya.nair@halcyon.com',
        company: 'Halcyon',
        role: 'VP Engineering',
        category: 'client',
        importance: 2,
        cadenceDays: 30,
        source: 'manual',
        metDaysAgo: 400,
      },
      context: {
        whereMet: 'the Halcyon vendor eval',
        whyMatters: 'Champion for the renewal; trusts you',
        discussed: 'Platform migration timelines',
      },
      lastTouchDaysAgo: 55,
      lastTouchType: 'email',
    },
    {
      contact: {
        firstName: 'Tom',
        lastName: 'Alvarez',
        phone: '+1 (555) 010-8841',
        city: 'Chicago',
        category: 'friend',
        importance: 2,
        cadenceDays: 21,
        source: 'manual',
        metDaysAgo: 3000,
      },
      context: {
        whyMatters: 'College roommate. Keeps you honest.',
      },
      lastTouchDaysAgo: 2,
      lastTouchType: 'text',
    },
    {
      contact: {
        firstName: 'Lena',
        lastName: 'Fischer',
        email: 'lena@northstar.partners',
        company: 'Northstar Partners',
        role: 'Principal',
        city: 'Berlin',
        category: 'professional',
        importance: 2,
        cadenceDays: 90,
        source: 'qr',
        metDaysAgo: 183,
      },
      context: {
        whereMet: 'SaaStr — the espresso line, of all places',
        discussed: 'European GTM; she offered intros to two design partners',
        whyMatters: 'Future fundraise. Genuinely kind.',
      },
      lastTouchDaysAgo: 150,
      lastTouchType: 'email',
    },
    {
      contact: {
        firstName: 'Sam',
        lastName: 'Rivera',
        phone: '+1 (555) 010-3327',
        category: 'friend',
        importance: 1,
        cadenceDays: 45,
        source: 'manual',
        metDaysAgo: 2000,
      },
      lastTouchDaysAgo: 75,
      lastTouchType: 'text',
    },
    {
      contact: {
        firstName: 'Nina',
        lastName: 'Park',
        email: 'nina.park@vantagehealth.co',
        company: 'Vantage Health',
        role: 'Head of Product',
        birthday: monthDay(addDays(now, 5)),
        category: 'professional',
        importance: 2,
        cadenceDays: 60,
        source: 'manual',
        metDaysAgo: 300,
      },
      context: {
        whereMet: 'a product leaders dinner',
        whyMatters: 'Thoughtful PM voice; possible advisor',
        discussed: 'Roadmap rituals that actually work',
      },
      lastTouchDaysAgo: 30,
      lastTouchType: 'coffee',
    },
  ];

  const contacts: Contact[] = [];
  const contexts: ContextEntry[] = [];
  const interactions: Interaction[] = [];

  for (const spec of specs) {
    const { metDaysAgo, ...rest } = spec.contact;
    const contactId = id('ctc');
    const createdAt = addDays(now, -metDaysAgo).toISOString();
    contacts.push({ ...rest, id: contactId, personaId, createdAt });

    if (spec.context) {
      contexts.push({
        ...spec.context,
        id: id('ctx'),
        contactId,
        createdAt,
      });
    }

    if (spec.lastTouchDaysAgo !== undefined) {
      interactions.push({
        id: id('int'),
        contactId,
        type: spec.lastTouchType ?? 'text',
        occurredAt: addDays(now, -spec.lastTouchDaysAgo).toISOString(),
        source: 'manual',
      });
    }
  }

  return {
    // Only the relationship entities below are used (see sampleEntities); this
    // profile is a neutral placeholder and never written to a real account.
    profile: {
      name: 'Sample',
      role: 'Founder',
      company: 'Call Your Mom',
      isPro: false,
      notificationsEnabled: false,
      defaultPersonaId: personaId,
    },
    personas: [{ id: personaId, name: 'Personal', isDefault: true }],
    contacts,
    contexts,
    interactions,
    hooks: [],
    nudges: [],
    accounts: [],
    onboarded: true,
    seededAt: now.toISOString(),
  };
}

/**
 * Sample relationships for an existing account (the "load sample data" action
 * in settings). Reuses the seed builder but keeps the caller's persona/profile.
 */
export function sampleEntities(
  now: Date,
  personaId: string,
): Pick<DB, 'contacts' | 'contexts' | 'interactions'> {
  const seeded = buildSeedDB(now);
  return {
    contacts: seeded.contacts.map((c) => ({ ...c, personaId })),
    contexts: seeded.contexts,
    interactions: seeded.interactions,
  };
}
