import { isActiveContact } from '@/lib/classify';
import type { Contact, DB } from '@/lib/types';

/**
 * Free-tier metering. Free keeps up to FREE_TRACK_LIMIT relationships warm —
 * with real nudges — and Plus removes the cap. "Tracked" means deliberately
 * managed: anything the user captured themselves, plus imports they gave a
 * Track verdict. Storage stays unlimited on every tier: remembering is free,
 * the engine is metered.
 */

export const FREE_TRACK_LIMIT = 10;
export const FREE_DRAFTS_PER_MONTH = 3;

export function isTracked(c: Contact): boolean {
  if (!isActiveContact(c) || c.kind === 'business') return false;
  return Boolean(c.evaluatedAt) || c.source !== 'import';
}

export function trackedContacts(db: DB): Contact[] {
  return db.contacts.filter(isTracked);
}

/** The single eligibility source for the Health screen: presentation must
 *  not decide who counts, so it just asks for the tracked set. */
export function healthEligibleContacts(db: DB): Contact[] {
  return trackedContacts(db);
}

/** Whether a free user may track one more (Plus is always yes). */
export function canTrackMore(db: DB): boolean {
  if (db.profile.isPro) return true;
  return trackedContacts(db).length < FREE_TRACK_LIMIT;
}

/** Ids whose nudges a free user can see (Plus sees all). */
export function visibleNudgeContactIds(db: DB): Set<string> | null {
  if (db.profile.isPro) return null; // null = no filtering
  return new Set(trackedContacts(db).map((c) => c.id));
}
