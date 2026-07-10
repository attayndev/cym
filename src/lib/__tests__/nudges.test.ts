import { addDays, isoDate, monthDay } from '@/lib/dates';
import {
  buildHealthIndex,
  contactHealth,
  decayRatio,
  healthOf,
  lastContactAt,
  pendingNudges,
  refreshEngine,
  roleChangeHook,
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
    const interactions: Interaction[] = [
      { id: 'i1', contactId: 'c1', type: 'text', occurredAt: addDays(NOW, -100).toISOString(), source: 'manual' },
    ];
    expect(contactHealth(c, interactions, NOW)).toBe('cold');
  });

  test('old interactions beat a recent createdAt — adding is not touching', () => {
    // The Steven Quintano case: contact created 2 days ago, real email
    // history 6 months old. Last touch must be the emails, not the add.
    const c = makeContact({ id: 'c1', cadenceDays: 90, createdAt: addDays(NOW, -2).toISOString() });
    const sixMonthsAgo = addDays(NOW, -180).toISOString();
    const interactions: Interaction[] = [
      { id: 'i1', contactId: 'c1', type: 'email', occurredAt: sixMonthsAgo, source: 'email-sync' },
    ];
    expect(lastContactAt(c, interactions)).toBe(sixMonthsAgo);
    expect(contactHealth(c, interactions, NOW)).toBe('at-risk');
  });

  test('a contact with no logged interactions is new, never warm', () => {
    const justImported = makeContact({ id: 'c1', source: 'import', createdAt: NOW.toISOString() });
    expect(contactHealth(justImported, [], NOW)).toBe('new');
  });

  test('buildHealthIndex matches contactHealth/decayRatio per contact', () => {
    const touched = makeContact({ id: 'c1', cadenceDays: 10 });
    const untouched = makeContact({ id: 'c2', source: 'import', createdAt: NOW.toISOString() });
    const interactions: Interaction[] = [
      { id: 'i1', contactId: 'c1', type: 'call', occurredAt: addDays(NOW, -25).toISOString(), source: 'manual' },
      { id: 'i2', contactId: 'c1', type: 'text', occurredAt: addDays(NOW, -5).toISOString(), source: 'manual' },
    ];
    const index = buildHealthIndex([touched, untouched], interactions, NOW);
    expect(index.get('c1')!.health).toBe(contactHealth(touched, interactions, NOW));
    expect(index.get('c1')!.ratio).toBeCloseTo(decayRatio(touched, interactions, NOW));
    expect(index.get('c2')!.health).toBe('new');
  });
});

describe('refreshEngine — hooks', () => {
  test('creates a birthday nudge for a contact whose birthday is days away', () => {
    const c = makeContact({ id: 'c1', firstName: 'Maya', birthday: monthDay(addDays(NOW, 3)) });
    const db = refreshEngine(makeDB([c]), NOW);
    const birthday = db.nudges.find((n) => n.headline.key.startsWith('nudgec.birthday.headline'));
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

function staleTouch(contactId: string): Interaction {
  return {
    id: `i_${contactId}`,
    contactId,
    type: 'text',
    occurredAt: addDays(NOW, -200).toISOString(),
    source: 'manual',
  };
}

describe('refreshEngine — decay nudges are capped', () => {
  test('never surfaces more than 10 bare decay nudges at once (keep-warm deck)', () => {
    const contacts = Array.from({ length: 25 }, (_, i) =>
      makeContact({
        id: `c${i}`,
        cadenceDays: 10,
        createdAt: addDays(NOW, -200).toISOString(),
      }),
    );
    const interactions = contacts.map((c) => staleTouch(c.id));
    const db = refreshEngine(makeDB(contacts, [], interactions), NOW);
    const decay = db.nudges.filter((n) => n.kind === 'decay' && n.state === 'pending');
    expect(decay.length).toBeLessThanOrEqual(10);
    expect(decay.length).toBeGreaterThan(0);
  });

  test('never targets contacts with no logged interactions (fresh imports)', () => {
    const imports = Array.from({ length: 8 }, (_, i) =>
      makeContact({
        id: `c${i}`,
        source: 'import',
        cadenceDays: 10,
        createdAt: addDays(NOW, -200).toISOString(),
      }),
    );
    const db = refreshEngine(makeDB(imports), NOW);
    expect(db.nudges.filter((n) => n.kind === 'decay')).toHaveLength(0);
  });

  test('pendingNudges lists hook nudges before decay nudges', () => {
    const birthday = makeContact({ id: 'b', firstName: 'B', birthday: monthDay(addDays(NOW, 2)) });
    const drifting = Array.from({ length: 4 }, (_, i) =>
      makeContact({ id: `d${i}`, cadenceDays: 10, createdAt: addDays(NOW, -200).toISOString() }),
    );
    const interactions = drifting.map((c) => staleTouch(c.id));
    const db = refreshEngine(makeDB([birthday, ...drifting], [], interactions), NOW);
    const ordered = pendingNudges(db);
    const firstDecayIndex = ordered.findIndex((n) => n.kind === 'decay');
    const lastHookIndex = ordered.map((n) => n.kind).lastIndexOf('hook');
    if (firstDecayIndex !== -1 && lastHookIndex !== -1) {
      expect(lastHookIndex).toBeLessThan(firstDecayIndex);
    }
  });
});

describe('flagged interactions and warmth (the Jill Wynn rules)', () => {
  test('a manual flag is a real touchpoint that keeps a contact warm', () => {
    const c = makeContact({ id: 'jill', cadenceDays: 90, createdAt: addDays(NOW, -300).toISOString() });
    const flags: Interaction[] = [
      { id: 'f1', contactId: 'jill', type: 'call', occurredAt: addDays(NOW, -2).toISOString(), source: 'manual' },
    ];
    expect(contactHealth(c, flags, NOW)).toBe('warm');
  });

  test('date boundaries: a flag from 47.9 hours ago is not skipped', () => {
    const c = makeContact({ id: 'jill', cadenceDays: 3, createdAt: addDays(NOW, -300).toISOString() });
    const almostTwoDays = new Date(NOW.getTime() - 47.9 * 3600 * 1000).toISOString();
    const flags: Interaction[] = [
      { id: 'f1', contactId: 'jill', type: 'text', occurredAt: almostTwoDays, source: 'manual' },
    ];
    // 1 full day elapsed by floor; cadence 3 → ratio ~0.33 → warm
    expect(contactHealth(c, flags, NOW)).toBe('warm');
  });

  test('without the flags she cools; with them she does not (regression of the loss bug)', () => {
    const c = makeContact({ id: 'jill', cadenceDays: 10, createdAt: addDays(NOW, -300).toISOString() });
    const old: Interaction[] = [
      { id: 'o', contactId: 'jill', type: 'email', occurredAt: addDays(NOW, -40).toISOString(), source: 'email-sync' },
    ];
    expect(contactHealth(c, old, NOW)).toBe('cold');
    const withFlag: Interaction[] = [
      ...old,
      { id: 'f', contactId: 'jill', type: 'call', occurredAt: addDays(NOW, -1).toISOString(), source: 'manual' },
    ];
    expect(contactHealth(c, withFlag, NOW)).toBe('warm');
  });
});

describe('role-change hooks', () => {
  test('confirmed job change yields a congrats nudge with the new details', () => {
    const c = makeContact({ id: 'c1', firstName: 'Dana', role: 'VP Design', company: 'Meridian' });
    const db = makeDB([c]);
    const hook = roleChangeHook(db, 'c1', NOW);
    expect(hook).toMatchObject({ contactId: 'c1', type: 'role-change' });
    const refreshed = refreshEngine({ ...db, hooks: [hook!] }, NOW);
    const nudge = refreshed.nudges.find((n) => n.hookId === hook!.id);
    expect(nudge?.state).toBe('pending');
    expect(nudge?.headline).toEqual({ key: 'nudgec.role.headline', params: { name: 'Dana' } });
    expect(nudge?.reason).toEqual({
      key: 'nudgec.role.reason',
      params: { detail: 'VP Design · Meridian' },
    });
  });

  test('deduped per contact per day; archived contacts never celebrated', () => {
    const c = makeContact({ id: 'c1' });
    const db = makeDB([c]);
    const first = roleChangeHook(db, 'c1', NOW)!;
    expect(roleChangeHook({ ...db, hooks: [first] }, 'c1', NOW)).toBeNull();
    const archived = makeContact({ id: 'c2', status: 'archived' });
    expect(roleChangeHook(makeDB([archived]), 'c2', NOW)).toBeNull();
  });
});
