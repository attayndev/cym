import { buildPrompt, composerNote, templateDraft, type DraftInput } from '@/lib/drafts';
import type { Contact, Nudge, UserProfile } from '@/lib/types';

const contact: Contact = {
  id: 'c1',
  personaId: 'p1',
  firstName: 'Maya',
  category: 'friend',
  importance: 2,
  cadenceDays: 30,
  source: 'manual',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const nudge: Nudge = {
  id: 'n1',
  contactId: 'c1',
  kind: 'decay',
  headline: { key: 'nudgec.decay.headline' },
  reason: { key: 'nudgec.decay.reason' },
  suggestedAction: { key: 'nudgec.decay.action.pro' },
  state: 'pending',
  createdAt: '2026-06-01T00:00:00.000Z',
  score: 1,
};

const profile: UserProfile = {
  name: 'Sam',
  isPro: true,
  notificationsEnabled: false,
  defaultPersonaId: 'p1',
};

function baseInput(over: Partial<DraftInput> = {}): DraftInput {
  return {
    contact,
    nudge,
    channel: 'text',
    profile,
    ...over,
  };
}

describe('composerNote', () => {
  test('trimmed anchor wins verbatim', () => {
    expect(composerNote('  Ask about the marathon  ', 'some draft text')).toBe(
      'Ask about the marathon',
    );
  });

  test('falls back to a whitespace-collapsed, clipped draft when anchor is absent', () => {
    const draft = 'Hey   there\n\nJust checking   in on you today.';
    expect(composerNote(undefined, draft)).toBe('Hey there Just checking in on you today.');
  });

  test('clips the draft fallback to 200 characters', () => {
    const draft = 'x'.repeat(250);
    const note = composerNote(undefined, draft);
    expect(note).toHaveLength(200);
  });

  test('both empty returns undefined', () => {
    expect(composerNote(undefined, undefined)).toBeUndefined();
    expect(composerNote('', '')).toBeUndefined();
  });

  test('anchor of only whitespace falls through to the draft', () => {
    expect(composerNote('   ', 'the actual draft')).toBe('the actual draft');
  });
});

describe('buildPrompt recentNotes', () => {
  test('includes a recent-threads block when notes are provided', () => {
    const prompt = buildPrompt(
      baseInput({ recentNotes: ['Talked about her new job in Austin'] }),
    );
    expect(prompt).toContain('Talked about her new job in Austin');
    expect(prompt).toContain('Recent threads with this person');
  });

  test('omits the block when recentNotes is absent', () => {
    const prompt = buildPrompt(baseInput());
    expect(prompt).not.toContain('Recent threads with this person');
  });

  test('omits the block when recentNotes is empty', () => {
    const prompt = buildPrompt(baseInput({ recentNotes: [] }));
    expect(prompt).not.toContain('Recent threads with this person');
  });
});

describe('buildPrompt memoryLines', () => {
  test('includes a "what you know" block when memoryLines are provided', () => {
    const prompt = buildPrompt(
      baseInput({ memoryLines: ['Daughter is named Maya', 'Open thread: the Austin move'] }),
    );
    expect(prompt).toContain('Daughter is named Maya');
    expect(prompt).toContain('Open thread: the Austin move');
    expect(prompt).toContain('What you know about them');
  });

  test('omits the block when memoryLines is absent', () => {
    const prompt = buildPrompt(baseInput());
    expect(prompt).not.toContain('What you know about them');
  });

  test('omits the block when memoryLines is empty', () => {
    const prompt = buildPrompt(baseInput({ memoryLines: [] }));
    expect(prompt).not.toContain('What you know about them');
  });

  test('appears above the recent-threads block', () => {
    const prompt = buildPrompt(
      baseInput({
        memoryLines: ['A durable fact'],
        recentNotes: ['A recent note'],
      }),
    );
    expect(prompt.indexOf('What you know about them')).toBeLessThan(
      prompt.indexOf('Recent threads with this person'),
    );
  });
});

describe('templateDraft', () => {
  test('is unaffected by recentNotes (free template stays memory-blind)', () => {
    const withNotes = templateDraft(baseInput({ recentNotes: ['Some prior thread'] }));
    const withoutNotes = templateDraft(baseInput());
    expect(withNotes).toBe(withoutNotes);
  });

  test('is unaffected by memoryLines (free template stays memory-blind)', () => {
    const withMemory = templateDraft(baseInput({ memoryLines: ['Daughter is named Maya'] }));
    const withoutMemory = templateDraft(baseInput());
    expect(withMemory).toBe(withoutMemory);
  });
});
