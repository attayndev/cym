import { liveMemory, memoryLines } from '@/lib/memory';
import type { ContactMemory } from '@/lib/types';

const row = (over: Partial<ContactMemory> = {}): ContactMemory => ({
  id: over.id ?? 'm1',
  contactId: 'c1',
  kind: 'fact',
  theme: 'some-theme',
  content: 'Some content',
  weight: 1,
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

const NOW = new Date('2026-07-01T00:00:00.000Z');

describe('liveMemory', () => {
  test('drops an expired thread', () => {
    const expired = row({
      id: 'thread-old',
      kind: 'thread',
      content: 'Planning the move',
      expiresAt: '2026-06-15T00:00:00.000Z',
    });
    const fresh = row({ id: 'fact-1', kind: 'fact', content: 'Daughter is named Maya' });
    expect(liveMemory([expired, fresh], NOW)).toEqual([fresh]);
  });

  test('keeps a fact with no expiresAt', () => {
    const fact = row({ id: 'fact-1', kind: 'fact', expiresAt: undefined });
    expect(liveMemory([fact], NOW)).toEqual([fact]);
  });

  test('keeps a thread that has not expired yet', () => {
    const thread = row({
      id: 'thread-fresh',
      kind: 'thread',
      expiresAt: '2026-07-15T00:00:00.000Z',
    });
    expect(liveMemory([thread], NOW)).toEqual([thread]);
  });

  test('events are always live regardless of expiresAt', () => {
    const event = row({ id: 'event-1', kind: 'event' });
    expect(liveMemory([event], NOW)).toEqual([event]);
  });

  test('preserves input order', () => {
    const a = row({ id: 'a', kind: 'fact' });
    const b = row({ id: 'b', kind: 'fact' });
    const c = row({ id: 'c', kind: 'fact' });
    expect(liveMemory([a, b, c], NOW)).toEqual([a, b, c]);
  });
});

describe('memoryLines', () => {
  test('facts/events by weight desc come before threads, threads prefixed', () => {
    const low = row({ id: 'low', kind: 'fact', content: 'Low weight fact', weight: 1 });
    const high = row({ id: 'high', kind: 'fact', content: 'High weight fact', weight: 5 });
    const event = row({ id: 'evt', kind: 'event', content: 'Started a new job', weight: 3 });
    const thread = row({ id: 'thr', kind: 'thread', content: 'The Austin move' });

    const lines = memoryLines([low, high, event, thread]);

    expect(lines).toEqual([
      'High weight fact',
      'Started a new job',
      'Low weight fact',
      'Open thread: The Austin move',
    ]);
  });

  test('caps facts/events at the top 5 by weight', () => {
    const facts = Array.from({ length: 8 }, (_, i) =>
      row({ id: `f${i}`, kind: 'fact', content: `Fact ${i}`, weight: i }),
    );
    const lines = memoryLines(facts);
    expect(lines).toHaveLength(5);
    // Highest weights (7,6,5,4,3) win, in descending order.
    expect(lines).toEqual(['Fact 7', 'Fact 6', 'Fact 5', 'Fact 4', 'Fact 3']);
  });

  test('all threads are included (no cap on threads)', () => {
    const threads = Array.from({ length: 3 }, (_, i) =>
      row({ id: `t${i}`, kind: 'thread', content: `Thread ${i}` }),
    );
    const lines = memoryLines(threads);
    expect(lines).toEqual(threads.map((t) => `Open thread: ${t.content}`));
  });

  test('empty input yields empty output', () => {
    expect(memoryLines([])).toEqual([]);
  });
});
