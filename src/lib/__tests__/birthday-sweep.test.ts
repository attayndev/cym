import { BDAY_DECK_DAILY_CAP, BDAY_SKIP_DAYS, birthdaySweepCandidates } from '@/lib/birthday-sweep';
import type { Contact, DB, Interaction } from '@/lib/types';

const contact = (over: Partial<Contact>): Contact => ({
  id: over.id ?? `c_${Math.random().toString(36).slice(2)}`,
  personaId: 'p1',
  firstName: 'Test',
  category: 'other',
  importance: 1,
  cadenceDays: 90,
  source: 'manual',
  createdAt: '2026-06-01T00:00:00.000Z',
  kind: 'person',
  status: 'active',
  ...over,
});

const db = (contacts: Contact[], interactions: Interaction[] = []): DB => ({
  profile: { name: 'Me', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
  personas: [{ id: 'p1', name: 'Personal', isDefault: true }],
  contacts,
  contexts: [],
  interactions,
  hooks: [],
  nudges: [],
  accounts: [],
  onboarded: true,
});

const NOW = new Date('2026-07-16T12:00:00');

describe('birthdaySweepCandidates', () => {
  test('excludes untracked (unevaluated import), business, archived, and has-birthday contacts', () => {
    const d = db([
      contact({ id: 'eligible' }),
      contact({ id: 'untracked-import', source: 'import' }),
      contact({ id: 'biz', kind: 'business' }),
      contact({ id: 'archived', status: 'archived' }),
      contact({ id: 'has-bday', birthday: '01-01' }),
    ]);
    expect(birthdaySweepCandidates(d, {}, NOW).map((c) => c.id)).toEqual(['eligible']);
  });

  test('an evaluated import is tracked and eligible', () => {
    const d = db([
      contact({ id: 'evaluated-import', source: 'import', evaluatedAt: '2026-07-01T00:00:00.000Z' }),
    ]);
    expect(birthdaySweepCandidates(d, {}, NOW).map((c) => c.id)).toEqual(['evaluated-import']);
  });

  test('ranks by importance desc, then most recent touch first, never-touched last', () => {
    const ints: Interaction[] = [
      { id: 'i1', contactId: 'recent', type: 'call', occurredAt: '2026-07-10T00:00:00.000Z', source: 'manual' },
      { id: 'i2', contactId: 'older', type: 'call', occurredAt: '2026-06-01T00:00:00.000Z', source: 'manual' },
    ];
    const d = db(
      [
        contact({ id: 'never-high', importance: 3 }),
        contact({ id: 'recent', importance: 2 }),
        contact({ id: 'older', importance: 2 }),
        contact({ id: 'never-low', importance: 1 }),
      ],
      ints,
    );
    expect(birthdaySweepCandidates(d, {}, NOW).map((c) => c.id)).toEqual([
      'never-high',
      'recent',
      'older',
      'never-low',
    ]);
  });

  test('caps at BDAY_DECK_DAILY_CAP', () => {
    const many = Array.from({ length: 8 }, (_, i) => contact({ id: `c${i}` }));
    const d = db(many);
    const result = birthdaySweepCandidates(d, {}, NOW);
    expect(result.length).toBe(BDAY_DECK_DAILY_CAP);
  });

  test('a recent skip excludes the contact', () => {
    const d = db([contact({ id: 'skipped' })]);
    const skippedAt = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(birthdaySweepCandidates(d, { skipped: skippedAt }, NOW)).toEqual([]);
  });

  test('a skip older than BDAY_SKIP_DAYS makes the contact eligible again', () => {
    const d = db([contact({ id: 'stale-skip' })]);
    const skippedAt = new Date(
      NOW.getTime() - (BDAY_SKIP_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(birthdaySweepCandidates(d, { 'stale-skip': skippedAt }, NOW).map((c) => c.id)).toEqual([
      'stale-skip',
    ]);
  });
});
