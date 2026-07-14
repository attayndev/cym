import { addDays } from '@/lib/dates';
import {
  buildHealthIndex,
  contactHealth,
  lastTouchAt,
  refreshEngine,
} from '@/lib/nudges';
import { healthEligibleContacts, isTracked } from '@/lib/tier';
import { loadDB, saveDB } from '@/lib/store';
import type { Contact, DB, Interaction } from '@/lib/types';

/**
 * Phase 4: "never touched" is its own relationship status, not a flavor of
 * cold. These tests exercise the lib-layer semantics described in
 * docs/investigations/relationship-data/PHASE3-ROOT-CAUSE.md (root cause)
 * extended by the Phase 4 product-rule change — fixtures are anonymized,
 * not the production records the investigation was run against.
 */

const NOW = new Date('2026-07-13T12:00:00Z');

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: over.id ?? `c_${Math.random().toString(36).slice(2)}`,
    personaId: 'p1',
    firstName: 'Sample',
    category: 'professional',
    importance: 2,
    cadenceDays: 90,
    source: 'manual',
    createdAt: addDays(NOW, -5).toISOString(),
    kind: 'person',
    status: 'active',
    ...over,
  };
}

function makeInteraction(contactId: string, daysAgo: number, over: Partial<Interaction> = {}): Interaction {
  return {
    id: `i_${contactId}_${daysAgo}_${Math.random().toString(36).slice(2)}`,
    contactId,
    type: 'call',
    occurredAt: addDays(NOW, -daysAgo).toISOString(),
    source: 'manual',
    ...over,
  };
}

function makeDB(
  contacts: Contact[],
  interactions: Interaction[] = [],
  over: Partial<DB> = {},
): DB {
  return {
    profile: { name: 'Me', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
    personas: [{ id: 'p1', name: 'Personal', isDefault: true }],
    contacts,
    contexts: [],
    interactions,
    hooks: [],
    nudges: [],
    accounts: [],
    onboarded: true,
    ...over,
  };
}

// --- 1 & 2: zero interactions -> 'never', for every source; lastTouchAt null ---

describe('zero interactions is never, for every source', () => {
  test('import (unevaluated), import (evaluated), manual, and qr all read never', () => {
    const unevaluatedImport = makeContact({ id: 'imp-unevaluated', source: 'import' });
    const evaluatedImport = makeContact({
      id: 'imp-evaluated',
      source: 'import',
      evaluatedAt: addDays(NOW, -1).toISOString(),
    });
    const manual = makeContact({ id: 'manual', source: 'manual' });
    const qr = makeContact({ id: 'qr', source: 'qr' });

    for (const c of [unevaluatedImport, evaluatedImport, manual, qr]) {
      expect(contactHealth(c, [], NOW)).toBe('never');
      expect(lastTouchAt(c, [])).toBeNull();
    }
  });
});

// --- 3: never-touched is not cooling/at-risk/cold even when very old ---

describe('never-touched contacts never read as cooling/at-risk/cold', () => {
  test('a contact created 400 days ago with zero interactions is still never', () => {
    const veryOld = makeContact({ id: 'old', createdAt: addDays(NOW, -400).toISOString() });
    const health = contactHealth(veryOld, [], NOW);
    expect(health).toBe('never');
    expect(health).not.toBe('cooling');
    expect(health).not.toBe('at-risk');
    expect(health).not.toBe('cold');
  });
});

// --- 4: touch 5 days ago + 90-day cadence -> warm ---

describe('a recent touch reads warm regardless of createdAt (the Alec counterfactual)', () => {
  test('touched 5 days ago on a 90-day cadence is warm, not cold', () => {
    const c = makeContact({ id: 'recent', cadenceDays: 90, createdAt: addDays(NOW, -5).toISOString() });
    const interactions = [makeInteraction('recent', 5)];
    expect(contactHealth(c, interactions, NOW)).toBe('warm');
  });
});

// --- 5: lastTouchAt is traceable to the contact's own interactions, no cross-contact bleed ---

describe('lastTouchAt is traceable and never bleeds across contacts', () => {
  test('every non-null lastTouchAt equals one of that contact\'s own occurredAt values', () => {
    const contacts = Array.from({ length: 6 }, (_, i) => makeContact({ id: `c${i}` }));
    const interactions: Interaction[] = [];
    for (const c of contacts) {
      // Some contacts have zero interactions, some have several, deliberately
      // interleaved with other contacts' rows to catch bleed.
      const count = contacts.indexOf(c) % 3;
      for (let k = 0; k < count; k++) {
        interactions.push(makeInteraction(c.id, k * 10 + 1));
      }
    }
    for (const c of contacts) {
      const own = interactions.filter((i) => i.contactId === c.id).map((i) => i.occurredAt);
      const touched = lastTouchAt(c, interactions);
      if (own.length === 0) {
        expect(touched).toBeNull();
      } else {
        expect(own).toContain(touched);
        expect(touched).toBe(own.slice().sort().pop()); // must be the max, not just any
      }
    }
  });
});

// --- 6: contactHealth === buildHealthIndex output, across a fixture matrix ---

describe('contactHealth and buildHealthIndex never diverge', () => {
  test('agree across touched-fresh, touched-stale, touched-180d+, and untouched (import/manual)', () => {
    const touchedFresh = makeContact({ id: 'fresh', cadenceDays: 30 });
    const touchedStale = makeContact({ id: 'stale', cadenceDays: 30 });
    const touchedVeryStale = makeContact({ id: 'very-stale', cadenceDays: 30 });
    const untouchedImport = makeContact({ id: 'untouched-import', source: 'import' });
    const untouchedManual = makeContact({ id: 'untouched-manual', source: 'manual' });

    const contacts = [touchedFresh, touchedStale, touchedVeryStale, untouchedImport, untouchedManual];
    const interactions: Interaction[] = [
      makeInteraction('fresh', 2),
      makeInteraction('stale', 50),
      makeInteraction('very-stale', 200),
    ];

    const index = buildHealthIndex(contacts, interactions, NOW);
    for (const c of contacts) {
      expect(index.get(c.id)!.health).toBe(contactHealth(c, interactions, NOW));
    }
    // Sanity: the matrix actually spans the classes it claims to.
    expect(index.get('fresh')!.health).toBe('warm');
    expect(index.get('very-stale')!.health).toBe('cold');
    expect(index.get('untouched-import')!.health).toBe('never');
    expect(index.get('untouched-manual')!.health).toBe('never');
  });
});

// --- 7: healthEligibleContacts excludes unevaluated imports/businesses, includes captured+evaluated ---

describe('healthEligibleContacts', () => {
  test('excludes unevaluated imports and businesses; includes captured and evaluated contacts', () => {
    const unevaluatedImport = makeContact({ id: 'imp', source: 'import' });
    const business = makeContact({ id: 'biz', source: 'manual', kind: 'business' });
    const captured = makeContact({ id: 'captured', source: 'manual' });
    const evaluatedImport = makeContact({
      id: 'evaluated',
      source: 'import',
      evaluatedAt: addDays(NOW, -1).toISOString(),
    });
    const archived = makeContact({ id: 'archived', source: 'manual', status: 'archived' });

    const db = makeDB([unevaluatedImport, business, captured, evaluatedImport, archived]);
    const eligible = healthEligibleContacts(db).map((c) => c.id).sort();
    expect(eligible).toEqual(['captured', 'evaluated'].sort());
  });
});

// --- 8: refreshEngine decay nudges respect isTracked ---

describe('refreshEngine decay nudges never target untracked contacts', () => {
  test('an untracked but touched at-risk contact gets no decay nudge; a tracked one does', () => {
    const untracked = makeContact({
      id: 'untracked',
      source: 'import', // no evaluatedAt -> isTracked() false
      cadenceDays: 10,
    });
    const tracked = makeContact({
      id: 'tracked',
      source: 'manual',
      cadenceDays: 10,
    });
    expect(isTracked(untracked)).toBe(false);
    expect(isTracked(tracked)).toBe(true);

    // Both at-risk: touched 25 days ago on a 10-day cadence (ratio 2.5).
    const interactions = [makeInteraction('untracked', 25), makeInteraction('tracked', 25)];
    const db = refreshEngine(makeDB([untracked, tracked], interactions), NOW);
    const decayContactIds = db.nudges.filter((n) => n.kind === 'decay').map((n) => n.contactId);
    expect(decayContactIds).not.toContain('untracked');
    expect(decayContactIds).toContain('tracked');
  });
});

// --- 9: interaction lifecycle recomputation (add / edit / remove) ---

describe('interaction lifecycle recomputes health and lastTouchAt from scratch every time', () => {
  const contact = makeContact({ id: 'lifecycle', cadenceDays: 30 });

  test('adding an interaction flips never -> warm and lastTouchAt to its date', () => {
    expect(contactHealth(contact, [], NOW)).toBe('never');
    expect(lastTouchAt(contact, [])).toBeNull();

    const firstTouch = makeInteraction('lifecycle', 1);
    expect(contactHealth(contact, [firstTouch], NOW)).toBe('warm');
    expect(lastTouchAt(contact, [firstTouch])).toBe(firstTouch.occurredAt);
  });

  test('editing the latest occurredAt older shifts ratio/health accordingly', () => {
    const original = makeInteraction('lifecycle', 1);
    expect(contactHealth(contact, [original], NOW)).toBe('warm');

    const edited = { ...original, occurredAt: addDays(NOW, -200).toISOString() };
    expect(contactHealth(contact, [edited], NOW)).toBe('cold'); // 200d >= 180d silence floor
    expect(lastTouchAt(contact, [edited])).toBe(edited.occurredAt);
  });

  test('removing the only interaction returns never + null', () => {
    const touch = makeInteraction('lifecycle', 1);
    expect(contactHealth(contact, [touch], NOW)).toBe('warm');

    const afterRemoval: Interaction[] = [];
    expect(contactHealth(contact, afterRemoval, NOW)).toBe('never');
    expect(lastTouchAt(contact, afterRemoval)).toBeNull();
  });
});

// --- 12: hydration roundtrip never persists health/lastTouch ---

describe('hydration: health and last-touch are recomputation-only, never persisted', () => {
  test('saveDB/loadDB roundtrip contains no health or lastTouch field on contacts or interactions', async () => {
    const contact = makeContact({ id: 'roundtrip' });
    const interaction = makeInteraction('roundtrip', 3);
    const db = makeDB([contact], [interaction]);

    await saveDB(db);
    const loaded = await loadDB();

    expect(loaded).not.toBeNull();
    const loadedContact = loaded!.contacts.find((c) => c.id === 'roundtrip')!;
    const loadedInteraction = loaded!.interactions.find((i) => i.id === interaction.id)!;
    for (const key of Object.keys(loadedContact)) {
      expect(key.toLowerCase()).not.toBe('health');
      expect(key.toLowerCase()).not.toBe('lasttouch');
      expect(key.toLowerCase()).not.toBe('lasttouchat');
    }
    for (const key of Object.keys(loadedInteraction)) {
      expect(key.toLowerCase()).not.toBe('health');
    }
  });
});
