import { addDays } from '@/lib/dates';
import { observedGapDays, rhythmProposals, suggestedCadence } from '@/lib/rhythm';
import type { Contact, DB, Interaction } from '@/lib/types';

const NOW = new Date('2026-06-13T12:00:00Z');

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: over.id ?? `c_${Math.random().toString(36).slice(2)}`,
    personaId: 'p1',
    firstName: 'Test',
    category: 'professional',
    importance: 2,
    cadenceDays: 90,
    source: 'manual',
    createdAt: addDays(NOW, -400).toISOString(),
    ...over,
  };
}

/** Interactions every `gap` days ending `endAgo` days before NOW. */
function touches(contactId: string, count: number, gap: number, endAgo = 2): Interaction[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `i_${contactId}_${i}`,
    contactId,
    type: 'text' as const,
    occurredAt: addDays(NOW, -(endAgo + i * gap)).toISOString(),
    source: 'manual' as const,
  }));
}

function makeDB(contacts: Contact[], interactions: Interaction[]): DB {
  return {
    profile: { name: 'Me', isPro: false, notificationsEnabled: false, defaultPersonaId: 'p1' },
    personas: [{ id: 'p1', name: 'Personal', isDefault: true }],
    contacts,
    contexts: [],
    interactions,
    hooks: [],
    nudges: [],
    accounts: [],
    onboarded: true,
  };
}

describe('observedGapDays', () => {
  test('needs at least 5 distinct days to claim a rhythm', () => {
    expect(observedGapDays('c1', touches('c1', 4, 14), NOW)).toBeNull();
    expect(observedGapDays('c1', touches('c1', 5, 14), NOW)).toEqual({ gap: 14, touches: 5 });
  });

  test('same-day interactions collapse to one touch day', () => {
    const doubled = [...touches('c1', 4, 14), ...touches('c1', 4, 14).map((i) => ({ ...i, id: `${i.id}b` }))];
    expect(observedGapDays('c1', doubled, NOW)).toBeNull();
  });

  test('median resists one long outlier gap', () => {
    // Gaps 14,14,14,14 + one 100-day silence: median stays 14.
    const regular = touches('c1', 5, 14);
    const older: Interaction = {
      id: 'i_old', contactId: 'c1', type: 'text',
      occurredAt: addDays(NOW, -(2 + 4 * 14 + 100)).toISOString(), source: 'manual',
    };
    expect(observedGapDays('c1', [...regular, older], NOW)?.gap).toBe(14);
  });

  test('history older than a year is ignored', () => {
    const stale = touches('c1', 6, 30, 400);
    expect(observedGapDays('c1', stale, NOW)).toBeNull();
  });
});

describe('suggestedCadence', () => {
  test('suggests tightening when you actually talk far more often than set', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 90 });
    expect(suggestedCadence(c, touches('c1', 6, 13), NOW)).toEqual({ cadence: 14, observed: 13 });
  });

  test('suggests loosening when the set cadence is wishful thinking', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 30 });
    expect(suggestedCadence(c, touches('c1', 5, 80), NOW)).toEqual({ cadence: 90, observed: 80 });
  });

  test('stays silent when observed rhythm roughly matches the set cadence', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 30 });
    expect(suggestedCadence(c, touches('c1', 6, 35), NOW)).toBeNull();
  });

  test('stays silent when snapping lands on the already-set cadence', () => {
    // 20-day gaps vs 14-day cadence: ratio 1.43 < 1.5 threshold — silent.
    const c = makeContact({ id: 'c1', cadenceDays: 14 });
    expect(suggestedCadence(c, touches('c1', 6, 20), NOW)).toBeNull();
  });
});

describe('rhythmProposals', () => {
  test('proposes for active people, skips business and archived contacts', () => {
    const person = makeContact({ id: 'p', cadenceDays: 90 });
    const biz = makeContact({ id: 'b', cadenceDays: 90, kind: 'business' });
    const archived = makeContact({ id: 'a', cadenceDays: 90, status: 'archived' });
    const interactions = [...touches('p', 6, 13), ...touches('b', 6, 13), ...touches('a', 6, 13)];
    const proposals = rhythmProposals(makeDB([person, biz, archived], interactions), NOW);
    expect(proposals).toEqual([
      {
        contactId: 'p',
        field: 'cadenceDays',
        current: '90',
        proposed: '14',
        observed: 13,
        foundAt: NOW.toISOString(),
      },
    ]);
  });
});
