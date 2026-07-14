import { dedupeImports, findMergeCandidates, mergePair } from '@/lib/dedupe';
import { contactHealth, lastTouchAt } from '@/lib/nudges';
import type { Contact, DB, Interaction } from '@/lib/types';

const contact = (over: Partial<Contact>): Contact => ({
  id: over.id ?? 'c1',
  personaId: 'p1',
  firstName: 'Alex',
  lastName: 'Lezhen',
  category: 'other',
  importance: 1,
  cadenceDays: 90,
  source: 'import',
  createdAt: '2026-06-01T00:00:00.000Z',
  kind: 'person',
  status: 'active',
  ...over,
});

const db = (contacts: Contact[], interactions: Interaction[] = [], extra?: Partial<DB>): DB => ({
  profile: { name: 'Me', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
  personas: [{ id: 'p1', name: 'Personal', isDefault: true }],
  contacts,
  contexts: [],
  interactions,
  hooks: [],
  nudges: [],
  accounts: [],
  onboarded: true,
  ...extra,
});

describe('dedupeImports', () => {
  test('merges same-name import pairs additively, keeper = most complete', () => {
    const d = db([
      contact({ id: 'sparse', email: 'a@x.com', createdAt: '2026-05-01T00:00:00.000Z' }),
      contact({ id: 'rich', email: 'alex@work.com', phone: '555', company: 'Acme', birthday: '03-04' }),
    ]);
    const out = dedupeImports(d);
    expect(out.contacts).toHaveLength(1);
    const kept = out.contacts[0];
    expect(kept.id).toBe('rich');
    expect(kept.email).toBe('alex@work.com');
    expect(kept.altEmails).toEqual(['a@x.com']);
    expect(kept.company).toBe('Acme');
  });

  test('drops dupe engine state and email-sync rows; manual history moves over', () => {
    const ints: Interaction[] = [
      { id: 'm1', contactId: 'b', type: 'call', occurredAt: '2026-06-01T00:00:00.000Z', source: 'manual' },
      { id: 'g1', contactId: 'b', type: 'email', occurredAt: '2026-06-02T00:00:00.000Z', source: 'email-sync' },
    ];
    const d = db(
      [contact({ id: 'a', email: 'x@y.com' }), contact({ id: 'b' })],
      ints,
      {
        hooks: [{ id: 'h1', contactId: 'b', type: 'birthday', triggerAt: '2026-07-08', label: 'bd' }],
        nudges: [
          {
            id: 'n1',
            contactId: 'b',
            kind: 'hook',
            headline: { key: 'nudgec.birthday.headline' },
            reason: { key: 'nudgec.birthday.reason' },
            suggestedAction: { key: 'nudgec.birthday.action.family' },
            state: 'pending',
            createdAt: '2026-07-07T00:00:00.000Z',
            score: 1,
          },
        ],
      },
    );
    const out = dedupeImports(d);
    expect(out.contacts.map((c) => c.id)).toEqual(['a']);
    expect(out.interactions).toEqual([{ ...ints[0], contactId: 'a' }]);
    expect(out.hooks).toHaveLength(0);
    expect(out.nudges).toHaveLength(0);
  });

  test('bare first names merge only on matching email; distinct people survive', () => {
    const d = db([
      contact({ id: 'm1', firstName: 'Mike', lastName: undefined, email: 'mike@a.com' }),
      contact({ id: 'm2', firstName: 'Mike', lastName: undefined, email: 'mike@b.com' }),
      contact({ id: 'm3', firstName: 'Mike', lastName: undefined }),
    ]);
    expect(dedupeImports(d)).toBe(d); // nothing merged, same reference
  });

  test('cross-source full-name twins merge (suggestion-added duplicates)', () => {
    const d = db([
      contact({ id: 'imp', source: 'import' }),
      contact({ id: 'man', source: 'manual', email: 'alex@x.com', category: 'friend' }),
    ]);
    const out = dedupeImports(d);
    expect(out.contacts).toHaveLength(1);
    expect(out.contacts[0].email).toBe('alex@x.com');
    expect(out.contacts[0].category).toBe('friend');
  });

  test('loose-name variants auto-merge ONLY with shared email/phone evidence', () => {
    const corroborated = db([
      contact({ id: 'a', firstName: 'Danny', lastName: 'Bibi', phone: '(555) 111-2222' }),
      contact({ id: 'b', firstName: 'Danny', lastName: 'E. Bibi', source: 'manual', email: 'danny@admedia.com', phone: '+1 555 111 2222' }),
    ]);
    expect(dedupeImports(corroborated).contacts).toHaveLength(1);

    const ambiguous = db([
      contact({ id: 'a', firstName: 'Danny', lastName: 'Bibi' }),
      contact({ id: 'b', firstName: 'Danny', lastName: 'E. Bibi', source: 'manual', email: 'danny@admedia.com' }),
    ]);
    expect(dedupeImports(ambiguous)).toBe(ambiguous); // untouched — human decides
    const cands = findMergeCandidates(ambiguous);
    expect(cands).toHaveLength(1);
    // Human says merge:
    const merged = mergePair(ambiguous, cands[0].keeperId, cands[0].dupeId);
    expect(merged.contacts).toHaveLength(1);
    expect(merged.contacts[0].email).toBe('danny@admedia.com');
  });

  test('exact-name Sarahs merge, but middle-name variants without evidence are only flagged', () => {
    const d = db([
      contact({ id: 's1', firstName: 'Sarah Jane', lastName: 'Smith' }),
      contact({ id: 's2', firstName: 'Sarah Anne', lastName: 'Smith' }),
    ]);
    expect(dedupeImports(d)).toBe(d);
    expect(findMergeCandidates(d)).toHaveLength(1);
  });

  test('bare first names with matching phones merge', () => {
    const d = db([
      contact({ id: 'g1', firstName: 'Giora', lastName: undefined, phone: '(555) 111-2222' }),
      contact({ id: 'g2', firstName: 'Giora', lastName: undefined, phone: '+1 555 111 2222' }),
    ]);
    expect(dedupeImports(d).contacts).toHaveLength(1);
  });
});

describe('mergePair — health/interactions resolve to the keeper', () => {
  test('a real touch logged against the dupe resolves under the keeper id, and keeper health reflects it', () => {
    const NOW = new Date('2026-07-13T12:00:00Z');
    const ints: Interaction[] = [
      {
        id: 'touch1',
        contactId: 'dupe',
        type: 'call',
        occurredAt: '2026-07-10T00:00:00.000Z', // 3 days before NOW
        source: 'manual',
      },
    ];
    const d = db(
      [
        contact({ id: 'keeper', firstName: 'Robin', lastName: 'Voss', cadenceDays: 30 }),
        contact({ id: 'dupe', firstName: 'Robin', lastName: 'Voss', source: 'manual', cadenceDays: 30 }),
      ],
      ints,
    );
    // Before the merge, the keeper has never been touched.
    const keeperBefore = d.contacts.find((c) => c.id === 'keeper')!;
    expect(contactHealth(keeperBefore, d.interactions, NOW)).toBe('never');

    const merged = mergePair(d, 'keeper', 'dupe');
    expect(merged.contacts).toHaveLength(1);
    expect(merged.contacts[0].id).toBe('keeper');
    // The interaction now resolves to the keeper id, not the dupe's.
    expect(merged.interactions).toHaveLength(1);
    expect(merged.interactions[0].contactId).toBe('keeper');
    expect(lastTouchAt(merged.contacts[0], merged.interactions)).toBe(ints[0].occurredAt);
    // And the keeper's health reflects the absorbed touch instead of 'never'.
    expect(contactHealth(merged.contacts[0], merged.interactions, NOW)).toBe('warm');
  });
});
