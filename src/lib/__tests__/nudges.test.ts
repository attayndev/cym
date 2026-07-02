import { addDays, isoDate, monthDay } from '@/lib/dates';
import {
  contactHealth,
  decayRatio,
  healthOf,
  lastContactAt,
  pendingNudges,
  refreshEngine,
} from '@/lib/nudges';
import type { Contact, ContextEntry, DB, Interaction } from '@/lib/types';

const NOW = new Date('2026-06-13T12:00:00Z');

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: over.id ?? `c_${Math.random().toString(36).slice(2)}`,
    personaId: 'p1',
    firstName: 'Test',
    category: 'professional',
    importance: 2,
    cadenceDays: 30,
    source: 'manual',
    createdAt: addDays(NOW, -200).toISOString(),
    ...over,
  };
}

function makeDB(
  contacts: Contact[],
  contexts: ContextEntry[] = [],
  interactions: Interaction[] = [],
): DB {
  return {
    profile: { name: 'Me', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
    personas: [{ id: 'p1', name: 'Personal', isDefault: true }],
    contacts,
    contexts,
    interactions,
    hooks: [],
    nudges: [],
    accounts: [],
    onboarded: true,
  };
}

describe('decay scoring', () => {
  test('healthOf thresholds', () => {
    expect(healthOf(0.5)).toBe('warm');
    expect(healthOf(1)).toBe('warm');
    expect(healthOf(1.5)).toBe('cooling');
    expect(healthOf(2.5)).toBe('at-risk');
    expect(healthOf(5)).toBe('cold');
  });

  test('lastContactAt prefers most recent interaction over createdAt', () => {
    const c = makeContact({ id: 'c1', createdAt: addDays(NOW, -100).toISOString() });
    const interactions: Interaction[] = [
      { id: 'i1', contactId: 'c1', type: 'text', occurredAt: addDays(NOW, -10).toISOString(), source: 'manual' },
    ];
    expect(lastContactAt(c, interactions)).toBe(interactions[0].occurredAt);
  });

  test('decayRatio is days-since-contact over cadence', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 10, createdAt: addDays(NOW, -100).toISOString() });
    expect(decayRatio(c, [], NOW)).toBeCloseTo(10, 0);
    expect(contactHealth(c, [], NOW)).toBe('cold');
  });
});

describe('refreshEngine — hooks', () => {
  test('creates a birthday nudge for a contact whose birthday is days away', () => {
    const c = makeContact({ id: 'c1', firstName: 'Maya', birthday: monthDay(addDays(NOW, 3)) });
    const db = refreshEngine(makeDB([c]), NOW);
    const birthday = db.nudges.find((n) => n.headline.key === 'nudgec.birthday.headline');
    expect(birthday).toBeDefined();
    expect(birthday?.kind).toBe('hook');
    expect(birthday?.headline.params?.name).toBe('Maya');
  });

  test('creates a commitment-due nudge from captured context', () => {
    const c = makeContact({ id: 'c1', createdAt: addDays(NOW, -2).toISOString() });
    const ctx: ContextEntry = {
      id: 'x1',
      contactId: 'c1',
      commitment: 'Intro to Sarah',
      commitmentDueAt: isoDate(addDays(NOW, 1)),
      createdAt: addDays(NOW, -2).toISOString(),
    };
    const db = refreshEngine(makeDB([c], [ctx]), NOW);
    const commitment = db.nudges.find((n) => n.headline.key === 'nudgec.commitment.headline');
    expect(commitment).toBeDefined();
    expect(commitment?.suggestedAction.params?.commitment).toBe('Intro to Sarah');
  });

  test('is idempotent — running twice does not duplicate nudges', () => {
    const c = makeContact({ id: 'c1', firstName: 'Maya', birthday: monthDay(addDays(NOW, 3)) });
    const once = refreshEngine(makeDB([c]), NOW);
    const twice = refreshEngine(once, NOW);
    expect(twice.nudges.length).toBe(once.nudges.length);
  });
});

describe('refreshEngine — decay nudges are capped', () => {
  test('never surfaces more than 3 bare decay nudges at once', () => {
    const contacts = Array.from({ length: 8 }, (_, i) =>
      makeContact({
        id: `c${i}`,
        cadenceDays: 10,
        createdAt: addDays(NOW, -200).toISOString(),
      }),
    );
    const db = refreshEngine(makeDB(contacts), NOW);
    const decay = db.nudges.filter((n) => n.kind === 'decay' && n.state === 'pending');
    expect(decay.length).toBeLessThanOrEqual(3);
  });

  test('pendingNudges lists hook nudges before decay nudges', () => {
    const birthday = makeContact({ id: 'b', firstName: 'B', birthday: monthDay(addDays(NOW, 2)) });
    const drifting = Array.from({ length: 4 }, (_, i) =>
      makeContact({ id: `d${i}`, cadenceDays: 10, createdAt: addDays(NOW, -200).toISOString() }),
    );
    const db = refreshEngine(makeDB([birthday, ...drifting]), NOW);
    const ordered = pendingNudges(db);
    const firstDecayIndex = ordered.findIndex((n) => n.kind === 'decay');
    const lastHookIndex = ordered.map((n) => n.kind).lastIndexOf('hook');
    if (firstDecayIndex !== -1 && lastHookIndex !== -1) {
      expect(lastHookIndex).toBeLessThan(firstDecayIndex);
    }
  });
});
