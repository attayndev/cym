import { getLocale } from '@/i18n';
import { id } from '@/lib/ids';
import { getSupabase } from '@/lib/supabase';
import { loadUserVoice, saveUserVoice, type UserVoice } from '@/lib/store';
import type { DB } from '@/lib/types';

/** Phase A: distill HOW this person writes from their own sent notes into a
 *  device-local voice profile. Signal capture, throttling, and storage all
 *  live on the phone; only the stateless server call ever sees note text,
 *  and it persists nothing. Fire-and-forget — never blocks the screen that
 *  triggers it, and every failure is swallowed silently. */
export async function maybeDistillVoice(db: DB): Promise<void> {
  if (!db.profile.isPro) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return;

  const sentNotes = db.interactions
    .filter((i) => i.note?.trim())
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 20)
    .map((i) => i.note!.trim());
  if (sentNotes.length < 5) return;

  const stored = await loadUserVoice();
  const noteCount = sentNotes.length;
  if (stored) {
    const daysSince = (Date.now() - new Date(stored.distilledAt).getTime()) / (1000 * 60 * 60 * 24);
    const enoughNewNotes = noteCount - stored.noteCount >= 3;
    const enoughTimePassed = daysSince >= 7;
    if (!(enoughNewNotes && enoughTimePassed)) return;
  }

  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/user-voice`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notes: sentNotes, locale: getLocale() }),
    });
    if (res.status !== 200) return;
    const data = (await res.json()) as { voice?: string[]; preferences?: string[] };
    const rows: UserVoice['rows'] = [
      ...(data.voice ?? []).map((content) => ({ id: id('uvm'), kind: 'voice' as const, content })),
      ...(data.preferences ?? []).map((content) => ({ id: id('uvm'), kind: 'preference' as const, content })),
    ];
    await saveUserVoice({ rows, distilledAt: new Date().toISOString(), noteCount });
  } catch {
    // Best-effort background distillation — never surfaces to the UI.
  }
}

/** Voice-profile lines for prompt injection — voice observations first, then
 *  preferences, max 6 total. Empty array if nothing has been distilled yet. */
export async function loadVoiceLines(): Promise<string[]> {
  const stored = await loadUserVoice();
  if (!stored) return [];
  const ordered = [
    ...stored.rows.filter((r) => r.kind === 'voice'),
    ...stored.rows.filter((r) => r.kind === 'preference'),
  ];
  return ordered.slice(0, 6).map((r) => r.content);
}
