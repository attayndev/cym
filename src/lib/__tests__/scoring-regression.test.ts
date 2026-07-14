import { addDays } from '@/lib/dates';
import {
  buildHealthIndex,
  contactHealth,
  decayRatio,
  lastTouchAt,
} from '@/lib/nudges';
import { observedGapDays, suggestedCadence } from '@/lib/rhythm';
import type { Contact, Interaction } from '@/lib/types';

const NOW = new Date('2026-06-13T12:00:00Z');

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: over.id ?? 'c1',
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

function touch(id: string, contactId: string, daysAgo: number, over: Partial<Interaction> = {}): Interaction {
  return {
    id,
    contactId,
    type: 'call',
    occurredAt: addDays(NOW, -daysAgo).toISOString(),
    source: 'manual',
    ...over,
  };
}

describe('THE named regression — recent interaction must not read as going cold', () => {
  test('a contact with cadenceDays=30 and an interaction logged right now is warm, not cooling/at-risk/cold', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 30 });
    const interactions: Interaction[] = [touch('i1', 'c1', 0)];
    expect(contactHealth(c, interactions, NOW)).toBe('warm');
    expect(decayRatio(c, interactions, NOW)).toBeCloseTo(0, 5);
  });
});

describe('rhythm.observedGapDays — same-day dedupe', () => {
  test('multiple interactions on the same calendar day count as one touch day', () => {
    const days = [56, 42, 28, 14, 0]; // 5 distinct days, 14 apart
    const single: Interaction[] = days.map((d, i) => touch(`s${i}`, 'c1', d));
    // add a second touch on the same calendar day as the most recent one, a
    // different hour later — must not create a 6th distinct day.
    const sameDayLater: Interaction = {
      id: 'dup',
      contactId: 'c1',
      type: 'text',
      occurredAt: new Date(new Date(single[4].occurredAt).getTime() + 3600_000).toISOString(),
      source: 'manual',
    };
    const withDuplicate = [...single, sameDayLater];

    const a = observedGapDays('c1', single, NOW);
    const b = observedGapDays('c1', withDuplicate, NOW);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    expect(b!.touches).toBe(5);
  });
});

describe('backdated interactions do not resurrect a stale contact', () => {
  test('lastTouchAt uses the max occurredAt — a backdated-only touch on a cold contact stays cold', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 30, createdAt: addDays(NOW, -400).toISOString() });
    const staleTouch = touch('stale', 'c1', 200, { source: 'email-sync', type: 'email' });
    expect(contactHealth(c, [staleTouch], NOW)).toBe('cold');

    // Now log an interaction with an occurredAt further in the past than the
    // existing touch — it must not move lastTouchAt backwards or forwards.
    const backdated = touch('backdated', 'c1', 300, { source: 'manual' });
    const withBackdated = [staleTouch, backdated];
    expect(lastTouchAt(c, withBackdated)).toBe(staleTouch.occurredAt);
    expect(contactHealth(c, withBackdated, NOW)).toBe('cold');
  });
});

describe('buildHealthIndex parity with per-contact contactHealth/decayRatio', () => {
  test('agrees across contacts spanning never, warm, cooling, at-risk, and cold', () => {
    // Zero interactions is 'never' unconditionally (Phase 4) — even a decided
    // (manual) contact created recently, which used to read 'new'.
    const neverTouched = makeContact({ id: 'never', source: 'manual', createdAt: addDays(NOW, -3).toISOString() });
    const warm = makeContact({ id: 'warm', cadenceDays: 30 });
    const cooling = makeContact({ id: 'cooling', cadenceDays: 30 });
    const atRisk = makeContact({ id: 'at-risk', cadenceDays: 30 });
    const cold = makeContact({ id: 'cold', cadenceDays: 30 });

    const contacts = [neverTouched, warm, cooling, atRisk, cold];
    const interactions: Interaction[] = [
      touch('i_warm', 'warm', 5),
      touch('i_cooling', 'cooling', 40),
      touch('i_at-risk', 'at-risk', 70),
      touch('i_cold', 'cold', 200),
    ];

    const index = buildHealthIndex(contacts, interactions, NOW);
    for (const c of contacts) {
      expect(index.get(c.id)!.health).toBe(contactHealth(c, interactions, NOW));
      expect(index.get(c.id)!.ratio).toBeCloseTo(decayRatio(c, interactions, NOW), 5);
    }
    // sanity: the fixture actually spans every bucket, so parity is meaningful
    expect(index.get('never')!.health).toBe('never');
    expect(index.get('warm')!.health).toBe('warm');
    expect(index.get('cooling')!.health).toBe('cooling');
    expect(index.get('at-risk')!.health).toBe('at-risk');
    expect(index.get('cold')!.health).toBe('cold');
  });
});

describe('determinism', () => {
  test('contactHealth is a pure function of (contact, interactions, now) — same inputs, same output', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 21 });
    const interactions: Interaction[] = [touch('i1', 'c1', 10), touch('i2', 'c1', 40)];
    const interactionsSnapshot = JSON.parse(JSON.stringify(interactions));

    const first = contactHealth(c, interactions, NOW);
    const second = contactHealth(c, interactions, NOW);
    expect(second).toBe(first);
    expect(decayRatio(c, interactions, NOW)).toBeCloseTo(decayRatio(c, interactions, NOW), 10);
    // purity: inputs must not be mutated as a side effect of scoring
    expect(interactions).toEqual(interactionsSnapshot);
  });
});

describe('cold-silence floor', () => {
  test('180+ days of silence is cold even on a matching long cadence', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 180 });
    const justOverFloor = [touch('i1', 'c1', 181)];
    expect(contactHealth(c, justOverFloor, NOW)).toBe('cold');
  });

  test('boundary sanity: one day inside the floor on the same cadence is not cold', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 180 });
    const justUnderFloor = [touch('i1', 'c1', 179)];
    expect(contactHealth(c, justUnderFloor, NOW)).not.toBe('cold');
  });
});

describe('rhythm.suggestedCadence', () => {
  test('returns null when the observed rhythm agrees with the set cadence', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 14 });
    const days = [56, 42, 28, 14, 0]; // every 14 days, matches cadence
    const interactions = days.map((d, i) => touch(`i${i}`, 'c1', d));
    expect(suggestedCadence(c, interactions, NOW)).toBeNull();
  });

  test('proposes a snapped cadence when observed and set rhythm deviate by >=1.5x with >=5 touch days', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 7 });
    const days = [120, 90, 60, 30, 0]; // every 30 days, cadence is set to 7
    const interactions = days.map((d, i) => touch(`i${i}`, 'c1', d));
    expect(suggestedCadence(c, interactions, NOW)).toEqual({ cadence: 30, observed: 30 });
  });

  test('stays silent with fewer than 5 distinct touch days even under heavy deviation', () => {
    const c = makeContact({ id: 'c1', cadenceDays: 7 });
    const days = [90, 60, 30, 0]; // only 4 distinct days
    const interactions = days.map((d, i) => touch(`i${i}`, 'c1', d));
    expect(suggestedCadence(c, interactions, NOW)).toBeNull();
  });
});
