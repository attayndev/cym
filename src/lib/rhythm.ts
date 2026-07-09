import { isActiveContact } from '@/lib/classify';
import { daysBetween } from '@/lib/dates';
import type { UpdateProposal } from '@/lib/store';
import type { Contact, DB, Interaction } from '@/lib/types';

/**
 * Cadence learning: measure the rhythm a relationship actually keeps and,
 * when it disagrees with the cadence the user set, propose matching it —
 * through the same updates deck as enrichment, so nothing changes without
 * a tap. The set cadence stays the source of truth; this just notices.
 */

/** The cadence ladder offered everywhere (capture, edit, track). */
export const CADENCES = [7, 14, 30, 60, 90, 180];

/** Need this many distinct contact days before claiming to know a rhythm. */
const MIN_TOUCH_DAYS = 5;
/** Ignore history older than this — last year's rhythm isn't this year's. */
const WINDOW_DAYS = 365;
/** Only speak up when observed and set rhythm disagree by at least this ×. */
const DEVIATION = 1.5;

/** Median gap in days between distinct interaction days, or null if the
 *  history is too thin to say anything honest. */
export function observedGapDays(
  contactId: string,
  interactions: Interaction[],
  now: Date,
): { gap: number; touches: number } | null {
  const days = [
    ...new Set(
      interactions
        .filter(
          (i) =>
            i.contactId === contactId &&
            daysBetween(new Date(i.occurredAt), now) <= WINDOW_DAYS,
        )
        .map((i) => i.occurredAt.slice(0, 10)),
    ),
  ].sort();
  if (days.length < MIN_TOUCH_DAYS) return null;
  const gaps = [];
  for (let i = 1; i < days.length; i++) {
    gaps.push(Math.max(1, daysBetween(new Date(days[i - 1]), new Date(days[i]))));
  }
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return { gap: median, touches: days.length };
}

/** The cadence step nearest the observed rhythm — but only when the set
 *  cadence is meaningfully off; agreement and near-misses stay silent. */
export function suggestedCadence(
  contact: Contact,
  interactions: Interaction[],
  now: Date,
): { cadence: number; observed: number } | null {
  const rhythm = observedGapDays(contact.id, interactions, now);
  if (!rhythm) return null;
  const ratio = rhythm.gap / Math.max(1, contact.cadenceDays);
  if (ratio < DEVIATION && ratio > 1 / DEVIATION) return null;
  const snapped = CADENCES.reduce((best, c) =>
    Math.abs(c - rhythm.gap) < Math.abs(best - rhythm.gap) ? c : best,
  );
  if (snapped === contact.cadenceDays) return null;
  return { cadence: snapped, observed: Math.round(rhythm.gap) };
}

/** Rhythm proposals for every active person — free and Plus alike; learning
 *  your own rhythm costs nothing and belongs to everyone. */
export function rhythmProposals(db: DB, now: Date): UpdateProposal[] {
  const proposals: UpdateProposal[] = [];
  for (const contact of db.contacts) {
    if (!isActiveContact(contact) || contact.kind === 'business') continue;
    const s = suggestedCadence(contact, db.interactions, now);
    if (!s) continue;
    proposals.push({
      contactId: contact.id,
      field: 'cadenceDays',
      current: String(contact.cadenceDays),
      proposed: String(s.cadence),
      observed: s.observed,
      foundAt: now.toISOString(),
    });
  }
  return proposals;
}
