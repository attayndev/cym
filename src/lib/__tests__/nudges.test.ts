import { addDays, isoDate, monthDay } from '@/lib/dates';
import {
  buildHealthIndex,
  contactHealth,
  decayRatio,
  healthOf,
  lastTouchAt,
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

  test('lastTouchAt prefers most recent interaction, and is null with zero interactions (no createdAt fallback)', () => {
    const c = makeContact({ id: 'c1', createdAt: addDays(NOW, -100).toISOString() });
    const interactions: Interaction[] = [
      { id: 'i1', contactId: 'c1', type: 'text', occurredAt: addDays(NOW, -10).toISOString(), source: 'manual' },
    ];
    expect(lastTouchAt(c, interactions)).toBe(interactions[0].occurredAt);
    expect(lastTouchAt(c, [])).toBeNull();
  });

  test('decayRatio is days-since-contact over cadence; 0 when never touched', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 10, createdAt: addDays(NOW, -100).toISOString() });
    expect(decayRatio(c, [], NOW)).toBe(0);
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
    expect(lastTouchAt(c, interactions)).toBe(sixMonthsAgo);
    expect(contactHealth(c, interactions, NOW)).toBe('cold'); // 6-month silence cap
  });

  test('an unevaluated import with no history is never — the import-cold rule is repealed', () => {
    // Phase 4: "importing is not meeting" no longer forces cold. Zero
    // interactions is 'never' unconditionally, for every source.
    const justImported = makeContact({ id: 'c1', source: 'import', createdAt: NOW.toISOString() });
    expect(contactHealth(justImported, [], NOW)).toBe('never');
  });

  test('a contact with no interactions is never, regardless of source or createdAt age', () => {
    const captured = makeContact({ id: 'c1', source: 'manual', createdAt: addDays(NOW, -3).toISOString() });
    expect(contactHealth(captured, [], NOW)).toBe('never');
    // Previously this shape (evaluated import, createdAt 200 days old) forced
    // 'cold' via the createdAt-age rule — that rule is gone: no touch ever
    // logged means 'never', full stop.
    const evaluatedLongAgo = makeContact({
      id: 'c2',
      source: 'import',
      evaluatedAt: addDays(NOW, -200).toISOString(),
      createdAt: addDays(NOW, -200).toISOString(),
    });
    expect(contactHealth(evaluatedLongAgo, [], NOW)).toBe('never');
    // Even 400 days old and never touched, still 'never' — not cooling/at-risk/cold.
    const veryOldNeverTouched = makeContact({
      id: 'c3',
      source: 'manual',
      createdAt: addDays(NOW, -400).toISOString(),
    });
    expect(contactHealth(veryOldNeverTouched, [], NOW)).toBe('never');
  });

  test('six months of silence is cold even on a relaxed cadence', () => {
    // cadence 180: ratio at 200 days is ~1.1 (barely cooling) — but the
    // 6-month silence cap overrides.
    const c = makeContact({ id: 'c1', cadenceDays: 180, createdAt: addDays(NOW, -400).toISOString() });
    const interactions: Interaction[] = [
      { id: 'i1', contactId: 'c1', type: 'email', occurredAt: addDays(NOW, -200).toISOString(), source: 'email-sync' },
    ];
    expect(contactHealth(c, interactions, NOW)).toBe('cold');
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
    // c2 is an undecided import with no history — never touched, unconditionally.
    expect(index.get('c2')!.health).toBe('never');
    expect(index.get('c2')!.health).toBe(contactHealth(untouched, [], NOW));
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

describe('engine health agrees with displayed health (the override-drift rules)', () => {
  // Regression: the candidate filter used to re-derive health from the ratio
  // alone, so a long-cadence contact past 180 days of silence displayed
  // "cold" on Health but never earned a decay nudge from the engine.
  test('180-day silence earns a decay nudge even when the cadence ratio still reads warm', () => {
    const c = makeContact({ id: 'longcad', cadenceDays: 365 });
    const touch: Interaction = {
      id: 'i_longcad',
      contactId: 'longcad',
      type: 'call',
      occurredAt: addDays(NOW, -200).toISOString(),
      source: 'manual',
    };
    // Displayed health is cold via the silence override, not the ratio.
    expect(contactHealth(c, [touch], NOW)).toBe('cold');
    expect(healthOf(decayRatio(c, [touch], NOW))).toBe('warm');
    const db = refreshEngine(makeDB([c], [], [touch]), NOW);
    expect(db.nudges.filter((n) => n.kind === 'decay' && n.contactId === 'longcad')).toHaveLength(1);
  });

  test('reconnect-anniversary hooks respect tracking like the decay engine', () => {
    const sixMonthsAgo = new Date(Date.UTC(2025, 11, 13, 12)).toISOString(); // NOW minus 6 months
    const touch = (contactId: string): Interaction => ({
      id: `i_${contactId}`,
      contactId,
      type: 'text',
      occurredAt: addDays(NOW, -100).toISOString(), // drifting, not 'never'
      source: 'manual',
    });
    const untracked = makeContact({ id: 'u', source: 'import', createdAt: sixMonthsAgo });
    const tracked = makeContact({
      id: 't',
      source: 'import',
      evaluatedAt: addDays(NOW, -10).toISOString(),
      createdAt: sixMonthsAgo,
    });
    const db = refreshEngine(makeDB([untracked, tracked], [], [touch('u'), touch('t')]), NOW);
    const anniversaries = db.hooks.filter((h) => h.type === 'reconnect-anniversary');
    expect(anniversaries.map((h) => h.contactId)).toEqual(['t']);
  });
});
