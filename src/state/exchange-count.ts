import { useSyncExternalStore } from 'react';

import { countPendingSubmissions } from '@/lib/share';

/**
 * The pending-submission count, shared between the tab bar (which draws the
 * badge) and the Inbox screen (which changes it). Deliberately a module store
 * rather than context: the tab layout renders above every screen, and the
 * count is one number that no provider needs to own.
 */

let count = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): number {
  return count;
}

function set(next: number): void {
  if (next === count) return;
  count = next;
  for (const listener of listeners) listener();
}

/** Re-reads the count from Supabase. Offline or signed out, it leaves the
 *  last known value alone rather than flashing the badge to zero. */
export async function refreshPendingCount(): Promise<void> {
  try {
    set(await countPendingSubmissions());
  } catch {
    // Keep the stale count: a network blip shouldn't hide a real submission.
  }
}

/** Local nudge so accept/dismiss updates the badge without a round trip. */
export function adjustPendingCount(delta: number): void {
  set(Math.max(0, count + delta));
}

export function clearPendingCount(): void {
  set(0);
}

export function usePendingCount(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
