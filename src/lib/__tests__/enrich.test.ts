import { applyEnrichment, companyFromDomain, hunterConflicts, hunterPatch, lastNameFromHint, sameHuman } from '@/lib/enrich';
import type { Contact, DB } from '@/lib/types';

const contact = (over: Partial<Contact>): Contact => ({
  id: over.id ?? 'c1',
  personaId: 'p1',
  firstName: 'Mike',
  category: 'other',
  importance: 1,
  cadenceDays: 90,
  source: 'import',
  createdAt: '2026-06-01T00:00:00.000Z',
  kind: 'person',
  status: 'active',
  ...over,
});

const db = (contacts: Contact[]): DB => ({
  profile: { name: 'Me', isPro: true, notificationsEnabled: false, defaultPersonaId: 'p1' },
  personas: [{ id: 'p1', name: 'Personal', isDefault: true }],
  contacts,
  contexts: [],
  interactions: [],
  hooks: [],
  nudges: [],
  accounts: [],
  onboarded: true,
});

describe('companyFromDomain', () => {
  test('work domains become companies; free mail does not', () => {
    expect(companyFromDomain('julia@stripe.com')).toBe('Stripe');
    expect(companyFromDomain('sam@bbc.co.uk')).toBe('Bbc');
    expect(companyFromDomain('mike@gmail.com')).toBeUndefined();
    expect(companyFromDomain('a@icloud.com')).toBeUndefined();
    expect(companyFromDomain(undefined)).toBeUndefined();
  });
});

describe('lastNameFromHint', () => {
  test('extends a lone first name when the hint clearly matches', () => {
    expect(lastNameFromHint(contact({}), 'Mike Rowe')).toBe('Rowe');
    expect(lastNameFromHint(contact({}), 'mike de la Cruz')).toBe('de la Cruz');
  });
  test('never overwrites, never guesses on mismatch or junk', () => {
    expect(lastNameFromHint(contact({ lastName: 'Smith' }), 'Mike Rowe')).toBeUndefined();
    expect(lastNameFromHint(contact({}), 'Michael Rowe')).toBeUndefined();
    expect(lastNameFromHint(contact({}), 'Mike')).toBeUndefined();
    expect(lastNameFromHint(contact({}), 'Mike mike@x.com')).toBeUndefined();
  });
});

describe('applyEnrichment', () => {
  test('fills last name from hint and company from domain, additively', () => {
    const d = db([contact({ id: 'a', email: 'mike@stripe.com' })]);
    const out = applyEnrichment(d, [{ contactId: 'a', value: 'Mike Rowe' }]);
    expect(out.contacts[0].lastName).toBe('Rowe');
    expect(out.contacts[0].company).toBe('Stripe');
  });
  test('skips archived/business contacts and returns same ref when unchanged', () => {
    const d = db([
      contact({ id: 'a', status: 'archived', email: 'x@stripe.com' }),
      contact({ id: 'b', kind: 'business', email: 'x@acme.com' }),
      contact({ id: 'c', email: 'x@gmail.com', lastName: 'Done', company: 'Set' }),
    ]);
    expect(applyEnrichment(d, [])).toBe(d);
  });
});

describe('hunterConflicts', () => {
  test('flags changed role and company, ignoring legal-suffix noise', () => {
    const c = contact({ role: 'PM', company: 'Acme, Inc.' });
    const out = hunterConflicts(c, {
      found: true,
      title: 'Director of Product',
      company: 'NewCo',
    });
    expect(out).toEqual([
      { field: 'role', current: 'PM', proposed: 'Director of Product' },
      { field: 'company', current: 'Acme, Inc.', proposed: 'NewCo' },
    ]);
    expect(hunterConflicts(c, { found: true, title: 'pm', company: 'Acme Inc' })).toEqual([]);
  });
  test('blank fields are fills, not conflicts', () => {
    expect(hunterConflicts(contact({}), { found: true, title: 'CEO', company: 'X' })).toEqual([]);
  });
});

describe('enrichment identity + null safety', () => {
  test('a different human never enriches this contact (identity guard)', () => {
    const c = contact({ firstName: 'Jill', lastName: 'Wynn', role: 'Therapist' });
    const wrongPerson = { found: true, firstName: 'Jill', lastName: 'Malone', title: 'Marketing Director', company: 'ShockWatch' };
    expect(sameHuman(c, wrongPerson)).toBe(false);
    expect(hunterPatch(c, wrongPerson)).toBeNull();
    expect(hunterConflicts(c, wrongPerson)).toEqual([]);
  });

  test('missing names in the result still enrich (absence is not mismatch)', () => {
    const c = contact({ firstName: 'Jill', lastName: 'Wynn' });
    const r = { found: true, title: 'LCSW', company: 'Rappore' };
    expect(sameHuman(c, r)).toBe(true);
    expect(hunterPatch(c, r)).toEqual({ role: 'LCSW', company: 'Rappore' });
  });

  test('null/absent enrichment values never overwrite good data', () => {
    const c = contact({ firstName: 'Jill', lastName: 'Wynn', role: 'Keeper', company: 'KeepCo', city: 'NYC' });
    expect(hunterPatch(c, { found: true })).toBeNull();
  });
});
