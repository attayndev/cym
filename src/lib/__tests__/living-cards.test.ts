import { applyCard, parseCardToken } from '@/lib/living-cards';
import type { Contact } from '@/lib/types';

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  personaId: 'p1',
  firstName: 'Sam',
  category: 'professional',
  importance: 2,
  cadenceDays: 90,
  source: 'qr',
  createdAt: '2026-06-01T00:00:00.000Z',
  kind: 'person',
  status: 'active',
  cardToken: 'tok_abc12345',
  ...over,
});

describe('parseCardToken', () => {
  test('accepts full URLs and bare paths, rejects junk', () => {
    expect(parseCardToken('https://getcym.app/c/AbC123_xyz9')).toBe('AbC123_xyz9');
    expect(parseCardToken('getcym.app/c/AbC123_xyz9/')).toBe('AbC123_xyz9');
    expect(parseCardToken('/c/AbC123_xyz9')).toBe('AbC123_xyz9');
    expect(parseCardToken('https://evil.com/x/AbC123')).toBeNull();
    expect(parseCardToken('hello')).toBeNull();
  });
});

describe('applyCard', () => {
  test('subject card fields overwrite; holder-owned fields untouched', () => {
    const c = contact({ role: 'Old Title', company: 'Old Co', category: 'friend', cadenceDays: 30 });
    const next = applyCard(c, {
      token: c.cardToken!,
      name: 'Samir Ahmed',
      role: 'CTO',
      company: 'ZissouTheDog',
      email: 'samir@zissouthedog.com',
      phone: null,
      city: 'Brooklyn',
      tagline: null,
    });
    expect(next.firstName).toBe('Samir');
    expect(next.lastName).toBe('Ahmed');
    expect(next.role).toBe('CTO');
    expect(next.company).toBe('ZissouTheDog');
    expect(next.city).toBe('Brooklyn');
    expect(next.category).toBe('friend'); // holder's — untouched
    expect(next.cadenceDays).toBe(30);
  });

  test('new email becomes alt when a different primary exists', () => {
    const c = contact({ email: 'personal@gmail.com' });
    const next = applyCard(c, { token: c.cardToken!, email: 'work@x.com' });
    expect(next.email).toBe('personal@gmail.com');
    expect(next.altEmails).toEqual(['work@x.com']);
  });

  test('gone card retires the subscription but keeps the data', () => {
    const c = contact({ role: 'CTO' });
    const next = applyCard(c, { token: c.cardToken!, gone: true });
    expect(next.cardToken).toBeUndefined();
    expect(next.role).toBe('CTO');
  });
});
