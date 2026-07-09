import { isActiveContact } from '@/lib/classify';
import { daysBetween, isoDate, nextOccurrence } from '@/lib/dates';
import { id } from '@/lib/ids';
import type {
  LocalizedText,
  Contact,
  ContextEntry,
  DB,
  Health,
  Hook,
  Interaction,
  Nudge,
} from '@/lib/types';

const BIRTHDAY_LOOKAHEAD_DAYS = 7;
const COMMITMENT_LOOKAHEAD_DAYS = 3;
const ANNIVERSARY_WINDOW_DAYS = 3;
const HOOK_NUDGE_WINDOW_PAST_DAYS = 14;
// The keep-warm deck: up to 10 live decay nudges (was 3 pre-deck).
const MAX_DECAY_NUDGES = 10;
const DECAY_COOLDOWN_DAYS = 14;

export function lastContactAt(
  contact: Contact,
  interactions: Interaction[],
): string {
  let latest = contact.createdAt;
  for (const i of interactions) {
    if (i.contactId === contact.id && i.occurredAt > latest) {
      latest = i.occurredAt;
    }
  }
  return latest;
}

export function decayRatio(
  contact: Contact,
  interactions: Interaction[],
  now: Date,
): number {
  const days = Math.max(0, daysBetween(new Date(lastContactAt(contact, interactions)), now));
  return days / Math.max(1, contact.cadenceDays);
}

export function healthOf(ratio: number): Health {
  if (ratio <= 1) return 'warm';
  if (ratio <= 1.75) return 'cooling';
  if (ratio <= 3) return 'at-risk';
  return 'cold';
}

export function contactHealth(
  contact: Contact,
  interactions: Interaction[],
  now: Date,
): Health {
  // No logged touch at all (typical for address-book imports): we can't claim
  // any warmth, so the contact is 'new' until a first interaction lands.
  if (!interactions.some((i) => i.contactId === contact.id)) return 'new';
  return healthOf(decayRatio(contact, interactions, now));
}

/**
 * One-pass health/ratio index for large lists (People, Dashboard). Equivalent
 * to calling contactHealth/decayRatio per contact, without rescanning the
 * whole interaction log for every row.
 */
export function buildHealthIndex(
  contacts: Contact[],
  interactions: Interaction[],
  now: Date,
): Map<string, { health: Health; ratio: number }> {
  const latest = new Map<string, string>();
  for (const i of interactions) {
    const cur = latest.get(i.contactId);
    if (!cur || i.occurredAt > cur) latest.set(i.contactId, i.occurredAt);
  }
  const index = new Map<string, { health: Health; ratio: number }>();
  for (const c of contacts) {
    const touchedAt = latest.get(c.id);
    const days = Math.max(0, daysBetween(new Date(touchedAt ?? c.createdAt), now));
    const ratio = days / Math.max(1, c.cadenceDays);
    index.set(c.id, { health: touchedAt ? healthOf(ratio) : 'new', ratio });
  }
  return index;
}

function fullName(c: Contact): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

function findContext(db: DB, contactId: string): ContextEntry | undefined {
  return db.contexts.find((c) => c.contactId === contactId);
}

/** Hooks are keyed by contact + type + trigger date so reruns never duplicate. */
function hookKey(h: Pick<Hook, 'contactId' | 'type' | 'triggerAt'>): string {
  return `${h.contactId}|${h.type}|${h.triggerAt.slice(0, 10)}`;
}

function computeHooks(db: DB, now: Date): Hook[] {
  const existing = new Set(db.hooks.map(hookKey));
  const created: Hook[] = [];

  const push = (h: Omit<Hook, 'id'>) => {
    if (!existing.has(hookKey(h))) {
      existing.add(hookKey(h));
      created.push({ ...h, id: id('hook') });
    }
  };

  for (const contact of db.contacts) {
    if (!isActiveContact(contact)) continue;
    if (contact.birthday) {
      const next = nextOccurrence(contact.birthday, now);
      if (daysBetween(now, next) <= BIRTHDAY_LOOKAHEAD_DAYS) {
        push({
          contactId: contact.id,
          type: 'birthday',
          triggerAt: isoDate(next),
          label: `${fullName(contact)}'s birthday`,
        });
      }
    }

    const ctx = findContext(db, contact.id);
    if (ctx?.commitment && ctx.commitmentDueAt) {
      if (daysBetween(now, new Date(ctx.commitmentDueAt)) <= COMMITMENT_LOOKAHEAD_DAYS) {
        push({
          contactId: contact.id,
          type: 'commitment-due',
          triggerAt: ctx.commitmentDueAt.slice(0, 10),
          label: `You committed: ${ctx.commitment}`,
          sourceContextId: ctx.id,
        });
      }
    }

    // "It's been exactly N months since you met" — every 6 months, only if drifting.
    const met = new Date(contact.createdAt);
    const monthsSince =
      (now.getFullYear() - met.getFullYear()) * 12 + (now.getMonth() - met.getMonth());
    if (monthsSince >= 6 && monthsSince % 6 === 0) {
      const anniversary = new Date(now.getFullYear(), now.getMonth(), met.getDate());
      const health = contactHealth(contact, db.interactions, now);
      if (
        Math.abs(daysBetween(anniversary, now)) <= ANNIVERSARY_WINDOW_DAYS &&
        health !== 'warm' &&
        health !== 'new'
      ) {
        push({
          contactId: contact.id,
          type: 'reconnect-anniversary',
          triggerAt: isoDate(anniversary),
          label: `${monthsSince} months since you met ${fullName(contact)}`,
        });
      }
    }
  }

  return created;
}

/** Event-driven hook: the user just confirmed a job change (accepted an
 *  enrichment proposal, or a linked card updated) — the one moment a congrats
 *  lands perfectly. Deduped by day like every other hook. */
export function roleChangeHook(db: DB, contactId: string, now: Date): Hook | null {
  const contact = db.contacts.find((c) => c.id === contactId);
  if (!contact || !isActiveContact(contact)) return null;
  const candidate = {
    contactId,
    type: 'role-change' as const,
    triggerAt: isoDate(now),
    label: `New role for ${fullName(contact)}`,
  };
  if (db.hooks.some((h) => hookKey(h) === hookKey(candidate))) return null;
  return { ...candidate, id: id('hook') };
}

function monthsSinceMet(contact: Contact, now: Date): number {
  const met = new Date(contact.createdAt);
  return (now.getFullYear() - met.getFullYear()) * 12 + (now.getMonth() - met.getMonth());
}

function hookNudgeContent(
  db: DB,
  contact: Contact,
  hook: Hook,
  now: Date,
): Pick<Nudge, 'headline' | 'reason' | 'suggestedAction'> {
  const name = contact.firstName;
  const ctx = findContext(db, contact.id);
  const isFamily = contact.category === 'family';
  switch (hook.type) {
    case 'birthday': {
      // Honest about timing: the heads-up window is a feature, but "It's
      // their birthday" is only true ON the day. Content re-derives every
      // refresh, so an "in 5 days" nudge counts itself down.
      const daysAway = daysBetween(
        new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        new Date(hook.triggerAt),
      );
      const headline: LocalizedText =
        daysAway <= 0
          ? { key: 'nudgec.birthday.headline', params: { name } }
          : daysAway === 1
            ? { key: 'nudgec.birthday.headline.tomorrow', params: { name } }
            : { key: 'nudgec.birthday.headline.upcoming', params: { name, n: daysAway } };
      const actionKey =
        daysAway <= 0
          ? isFamily
            ? 'nudgec.birthday.action.family'
            : 'nudgec.birthday.action.pro'
          : isFamily
            ? 'nudgec.birthday.action.plan.family'
            : 'nudgec.birthday.action.plan.pro';
      return {
        headline,
        reason: { key: daysAway <= 0 ? 'nudgec.birthday.reason.today' : 'nudgec.birthday.reason' },
        suggestedAction: { key: actionKey, params: { name } },
      };
    }
    case 'commitment-due':
      return {
        headline: { key: 'nudgec.commitment.headline', params: { name } },
        reason: { key: 'nudgec.commitment.reason', params: { commitment: ctx?.commitment ?? '' } },
        suggestedAction: {
          key: 'nudgec.commitment.action',
          params: { commitment: ctx?.commitment ?? '' },
        },
      };
    case 'role-change': {
      const detail = [contact.role, contact.company].filter(Boolean).join(' · ');
      return {
        headline: { key: 'nudgec.role.headline', params: { name } },
        reason: detail
          ? { key: 'nudgec.role.reason', params: { detail } }
          : { key: 'nudgec.role.reason.generic' },
        suggestedAction: { key: 'nudgec.role.action', params: { name } },
      };
    }
    case 'reconnect-anniversary':
      return {
        headline: {
          key: 'nudgec.reconnect.headline',
          params: { months: monthsSinceMet(contact, now), name },
        },
        reason: ctx?.whereMet
          ? { key: 'nudgec.reconnect.reason.where', params: { where: ctx.whereMet } }
          : { key: 'nudgec.reconnect.reason.generic' },
        suggestedAction: ctx?.whereMet
          ? { key: 'nudgec.reconnect.action.where', params: { where: ctx.whereMet } }
          : { key: 'nudgec.reconnect.action.generic', params: { name } },
      };
  }
}

function decayNudgeContent(
  contact: Contact,
  interactions: Interaction[],
  now: Date,
): Pick<Nudge, 'headline' | 'reason' | 'suggestedAction'> {
  const name = contact.firstName;
  const days = daysBetween(new Date(lastContactAt(contact, interactions)), now);
  const actionKey =
    contact.category === 'family'
      ? 'nudgec.decay.action.family'
      : contact.category === 'friend'
        ? 'nudgec.decay.action.friend'
        : 'nudgec.decay.action.pro';
  return {
    headline: { key: 'nudgec.decay.headline', params: { name } },
    reason: { key: 'nudgec.decay.reason', params: { days, cadence: contact.cadenceDays } },
    suggestedAction: { key: actionKey, params: { name } },
  };
}

/**
 * Recompute hooks and nudges. Idempotent: safe to run on every app open.
 * Hook-driven nudges lead; bare time-decay nudges are capped so the feed
 * never becomes the guilt list this product exists to replace.
 */
export function refreshEngine(db: DB, now: Date): DB {
  const nowIso = now.toISOString();

  // Wake snoozed nudges whose snooze has lapsed.
  let nudges = db.nudges.map((n) =>
    n.state === 'snoozed' && n.snoozedUntil && n.snoozedUntil <= nowIso
      ? { ...n, state: 'pending' as const, snoozedUntil: undefined }
      : n,
  );

  const hooks = [...db.hooks, ...computeHooks(db, now)];
  const contactsById = new Map(db.contacts.map((c) => [c.id, c]));

  // One nudge per live hook — but content re-derives each run so time-aware
  // copy (a birthday countdown) stays current instead of freezing at creation.
  const hooksById = new Map(hooks.map((h) => [h.id, h]));
  nudges = nudges.map((n) => {
    if (!n.hookId || n.state !== 'pending') return n;
    const hook = hooksById.get(n.hookId);
    const contact = hook && contactsById.get(hook.contactId);
    if (!hook || !contact) return n;
    return { ...n, ...hookNudgeContent(db, contact, hook, now) };
  });
  const nudgedHookIds = new Set(
    nudges.filter((n) => n.hookId && n.state !== 'dismissed').map((n) => n.hookId),
  );
  for (const hook of hooks) {
    if (hook.consumedAt || nudgedHookIds.has(hook.id)) continue;
    const trigger = new Date(hook.triggerAt);
    const daysAway = daysBetween(now, trigger);
    const daysPast = daysBetween(trigger, now);
    if (daysPast > HOOK_NUDGE_WINDOW_PAST_DAYS || daysAway > BIRTHDAY_LOOKAHEAD_DAYS) continue;
    const contact = contactsById.get(hook.contactId);
    if (!contact) continue;
    nudges = [
      ...nudges,
      {
        id: id('ndg'),
        contactId: contact.id,
        hookId: hook.id,
        kind: 'hook',
        ...hookNudgeContent(db, contact, hook, now),
        state: 'pending',
        createdAt: nowIso,
        // Sooner triggers and more important people first.
        score: 100 - Math.abs(daysAway) * 5 + contact.importance * 10,
      },
    ];
  }

  // Quiet decay nudges, capped.
  const activeNudgeContactIds = new Set(
    nudges.filter((n) => n.state === 'pending' || n.state === 'snoozed').map((n) => n.contactId),
  );
  const recentlyHandled = new Set(
    nudges
      .filter(
        (n) =>
          (n.state === 'acted' || n.state === 'dismissed') &&
          daysBetween(new Date(n.createdAt), now) < DECAY_COOLDOWN_DAYS,
      )
      .map((n) => n.contactId),
  );
  const liveDecayCount = nudges.filter(
    (n) => n.kind === 'decay' && (n.state === 'pending' || n.state === 'snoozed'),
  ).length;

  // You can't drift from someone you never contacted — decay only applies to
  // contacts with at least one logged interaction (imports start with none).
  const touched = new Set(db.interactions.map((i) => i.contactId));

  const candidates = db.contacts
    .filter(
      (c) =>
        isActiveContact(c) &&
        touched.has(c.id) &&
        !activeNudgeContactIds.has(c.id) &&
        !recentlyHandled.has(c.id),
    )
    .map((c) => ({ contact: c, ratio: decayRatio(c, db.interactions, now) }))
    .filter(({ ratio }) => healthOf(ratio) === 'at-risk' || healthOf(ratio) === 'cold')
    .sort((a, b) => b.ratio * b.contact.importance - a.ratio * a.contact.importance)
    .slice(0, Math.max(0, MAX_DECAY_NUDGES - liveDecayCount));

  for (const { contact, ratio } of candidates) {
    nudges = [
      ...nudges,
      {
        id: id('ndg'),
        contactId: contact.id,
        kind: 'decay',
        ...decayNudgeContent(contact, db.interactions, now),
        state: 'pending',
        createdAt: nowIso,
        score: ratio * contact.importance,
      },
    ];
  }

  return { ...db, hooks, nudges };
}

export function pendingNudges(db: DB): Nudge[] {
  return db.nudges
    .filter((n) => n.state === 'pending')
    .sort((a, b) => (a.kind === b.kind ? b.score - a.score : a.kind === 'hook' ? -1 : 1));
}
