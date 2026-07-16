import { isActiveContact } from '@/lib/classify';
import { daysBetween } from '@/lib/dates';
import { lastTouchAt } from '@/lib/nudges';
import { isTracked } from '@/lib/tier';
import type { Contact, DB } from '@/lib/types';

/**
 * Birthday sweep: a bounded daily deck of tracked people whose birthday we
 * don't have yet, ranked so the ones you actually know it for float first.
 * Device-local skips (see src/lib/store.ts) keep a "not now" from becoming a
 * permanent nag; skip long enough and the person becomes eligible again.
 */

export const BDAY_DECK_DAILY_CAP = 5;
export const BDAY_SKIP_DAYS = 90;

export function birthdaySweepCandidates(
  db: DB,
  skips: Record<string, string>,
  now: Date,
): Contact[] {
  const eligible = db.contacts.filter((c) => {
    if (!isTracked(c) || !isActiveContact(c) || c.kind === 'business') return false;
    if (c.birthday) return false;
    const skippedAt = skips[c.id];
    if (skippedAt && daysBetween(new Date(skippedAt), now) < BDAY_SKIP_DAYS) return false;
    return true;
  });

  const ranked = eligible
    .map((c) => ({ contact: c, touchedAt: lastTouchAt(c, db.interactions) }))
    .sort((a, b) => {
      if (b.contact.importance !== a.contact.importance) {
        return b.contact.importance - a.contact.importance;
      }
      if (a.touchedAt === null && b.touchedAt === null) return 0;
      if (a.touchedAt === null) return 1;
      if (b.touchedAt === null) return -1;
      return b.touchedAt.localeCompare(a.touchedAt);
    })
    .map((x) => x.contact);

  return ranked.slice(0, BDAY_DECK_DAILY_CAP);
}
