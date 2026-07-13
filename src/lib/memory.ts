import { diag } from '@/lib/log';
import { getSupabase } from '@/lib/supabase';
import type { ContactMemory } from '@/lib/types';

/**
 * Relationship Memory (Phase 1): per-contact facts/threads/events distilled
 * server-side (memory-extract edge fn) from text the user typed or approved —
 * never from email content. Server-owned, RLS-scoped (select + delete own
 * rows only); deliberately OUTSIDE the whole-graph sync. Plus-only end to
 * end: the edge function 403s free users, so callers gate on db.profile.isPro
 * before ever invoking extractMemory.
 */

export async function fetchContactMemory(contactId: string): Promise<ContactMemory[]> {
  const supabase = getSupabase();
  if (!supabase || !contactId) return [];
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user?.id) return [];

  const { data, error } = await supabase
    .from('contact_memory')
    .select('id, contact_id, kind, theme, content, weight, expires_at, updated_at')
    .eq('contact_id', contactId)
    .order('weight', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    contactId: r.contact_id,
    kind: r.kind as ContactMemory['kind'],
    theme: r.theme,
    content: r.content,
    weight: Number(r.weight),
    expiresAt: r.expires_at ?? undefined,
    updatedAt: r.updated_at,
  }));
}

/** Fire-and-forget: distill a user-typed text into durable memory rows. No
 *  await at call sites — extraction never blocks the UI it's triggered from. */
export function extractMemory(input: {
  contactId: string;
  text: string;
  source: 'draft' | 'capture' | 'commitment' | 'card';
  sourceId?: string;
}): void {
  const supabase = getSupabase();
  if (!supabase || !input.contactId || !input.text.trim()) return;
  supabase.functions
    .invoke('memory-extract', {
      body: {
        contactId: input.contactId,
        text: input.text,
        source: input.source,
        ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      },
    })
    .then(({ error }) => {
      if (error) diag('memory-extract-fail', { source: input.source, reason: error.message });
    })
    .catch((e) => {
      diag('memory-extract-fail', {
        source: input.source,
        reason: e instanceof Error ? e.message : String(e),
      });
    });
}

export async function dismissMemory(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !id) return false;
  const { error } = await supabase.from('contact_memory').delete().eq('id', id);
  return !error;
}

/** Purge every memory row for a removed contact — fire-and-forget, same
 *  shape as removeContact's other CYM-private purges. RLS scopes the delete
 *  to the caller's own rows, so no user id needs to travel with it. */
export function purgeContactMemory(contactId: string): void {
  const supabase = getSupabase();
  if (!supabase || !contactId) return;
  supabase
    .from('contact_memory')
    .delete()
    .eq('contact_id', contactId)
    .then(({ error }) => {
      if (error) diag('memory-purge-fail', { reason: error.message });
    });
}

/** Threads expire (an open loop stops making sense to ask about); facts and
 *  events are durable and always live. Pure — order is preserved. */
export function liveMemory(rows: ContactMemory[], now: Date): ContactMemory[] {
  return rows.filter((r) => {
    if (r.kind !== 'thread') return true;
    if (!r.expiresAt) return true;
    return new Date(r.expiresAt) >= now;
  });
}

/** Top 5 facts/events by weight, then live threads as "Open thread: …" —
 *  callers run liveMemory first so expired threads never reach here. Pure. */
export function memoryLines(rows: ContactMemory[]): string[] {
  const durable = rows
    .filter((r) => r.kind === 'fact' || r.kind === 'event')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((r) => r.content);
  const threads = rows.filter((r) => r.kind === 'thread').map((r) => `Open thread: ${r.content}`);
  return [...durable, ...threads];
}
