import { isActiveContact } from '@/lib/classify';
import { diag } from '@/lib/log';
import { localDayKey } from '@/lib/deck';
import { enrichFromHunter, hunterConflicts, hunterPatch } from '@/lib/enrich';
import {
  loadRefreshState,
  saveRefreshState,
  type RefreshState,
  type UpdateProposal,
} from '@/lib/store';
import type { Contact, DB } from '@/lib/types';

/**
 * The updates flow: a rotating daily sweep checks a slice of the contact pool
 * against Hunter's fresher public data. Agreements pass silently, blanks fill
 * additively, and DISAGREEMENTS become proposals — surfaced as the updates
 * deck on Today (10/day) and highlighted on the contact's own screen. Nothing
 * is overwritten without a tap.
 */

const SWEEP_PER_DAY = 60;
export const UPDATES_DECK_SIZE = 10;

export const proposalKeepKey = (p: UpdateProposal) =>
  `${p.contactId}|${p.field}|${p.proposed.toLowerCase()}`;

/** Drop proposals that no longer apply (contact gone/archived, field edited). */
export function pruneProposals(state: RefreshState, db: DB): UpdateProposal[] {
  const byId = new Map(db.contacts.map((c) => [c.id, c]));
  return state.proposals.filter((p) => {
    const c = byId.get(p.contactId);
    return c && isActiveContact(c) && (c[p.field] ?? '') === p.current;
  });
}

function sweepPool(db: DB): Contact[] {
  return db.contacts
    .filter((c) => isActiveContact(c) && c.kind !== 'business' && c.email)
    .sort((a, b) => {
      // Titled contacts first (conflict candidates — the staleness fix),
      // blank ones after (additive fills); stable ids within each band.
      const at = a.role || a.company ? 0 : 1;
      const bt = b.role || b.company ? 0 : 1;
      return at - bt || a.id.localeCompare(b.id);
    });
}

export interface SweepResult {
  state: RefreshState;
  /** Additive fills discovered along the way, for the caller to apply. */
  fills: { contactId: string; patch: NonNullable<ReturnType<typeof hunterPatch>> }[];
}

/**
 * Run at most once per local day; subsequent calls only prune. Advances the
 * cursor SWEEP_PER_DAY contacts per day, wrapping — the whole pool gets
 * re-checked over time, and the server cache keeps repeat lookups free.
 */
export async function dailyRefreshSweep(db: DB): Promise<SweepResult> {
  const state = await loadRefreshState();
  const today = localDayKey(new Date());
  const pruned = pruneProposals(state, db);

  if (state.day === today) {
    const next = { ...state, proposals: pruned };
    if (pruned.length !== state.proposals.length) await saveRefreshState(next);
    return { state: next, fills: [] };
  }

  const pool = sweepPool(db);
  const proposals = [...pruned];
  const fills: SweepResult['fills'] = [];
  const have = new Set(proposals.map((p) => `${p.contactId}|${p.field}`));
  const take = Math.min(SWEEP_PER_DAY, pool.length);

  let advanced = 0;
  let broke = false;
  for (let i = 0; i < take; i++) {
    const contact = pool[(state.cursor + i) % pool.length];
    // Pace the burst — Hunter rate-limits, and a failed call helps nobody.
    if (i > 0) await new Promise((r) => setTimeout(r, 350));
    const result = await enrichFromHunter(contact.email!);
    if (!result) {
      // Offline or daily cap: STOP without skipping — the cursor only moves
      // past contacts that actually got answers, and the day stays open so a
      // later launch (or tomorrow) resumes exactly here.
      broke = true;
      break;
    }
    advanced += 1;
    const patch = hunterPatch(contact, result);
    if (patch) fills.push({ contactId: contact.id, patch });
    for (const conflict of hunterConflicts(contact, result)) {
      const proposal: UpdateProposal = {
        contactId: contact.id,
        ...conflict,
        foundAt: new Date().toISOString(),
      };
      if (state.keeps[proposalKeepKey(proposal)]) continue; // user said keep
      if (have.has(`${proposal.contactId}|${proposal.field}`)) continue;
      have.add(`${proposal.contactId}|${proposal.field}`);
      proposals.push(proposal);
    }
  }

  const next: RefreshState = {
    day: broke ? state.day : today,
    cursor: pool.length > 0 ? (state.cursor + advanced) % pool.length : 0,
    proposals,
    keeps: state.keeps,
  };
  diag('enrich-sweep', { advanced, broke, fills: fills.length, proposals: proposals.length });
  await saveRefreshState(next);
  return { state: next, fills };
}

/** Resolve proposals: 'update' applies via the caller; both remove them, and
 *  'keep' remembers the dismissal so the same proposal never re-nags. */
export async function resolveProposals(
  proposals: UpdateProposal[],
  action: 'update' | 'keep',
): Promise<RefreshState> {
  const state = await loadRefreshState();
  const gone = new Set(proposals.map((p) => `${p.contactId}|${p.field}`));
  const next: RefreshState = {
    ...state,
    proposals: state.proposals.filter((p) => !gone.has(`${p.contactId}|${p.field}`)),
    keeps:
      action === 'keep'
        ? {
            ...state.keeps,
            ...Object.fromEntries(
              proposals.map((p) => [proposalKeepKey(p), new Date().toISOString()]),
            ),
          }
        : state.keeps,
  };
  await saveRefreshState(next);
  return next;
}

/** Merge freshly found proposals (e.g. from a manual "Fill in details"). */
export async function addProposals(found: UpdateProposal[]): Promise<RefreshState> {
  const state = await loadRefreshState();
  const have = new Set(state.proposals.map((p) => `${p.contactId}|${p.field}`));
  const fresh = found.filter(
    (p) => !state.keeps[proposalKeepKey(p)] && !have.has(`${p.contactId}|${p.field}`),
  );
  const next = { ...state, proposals: [...state.proposals, ...fresh] };
  if (fresh.length > 0) await saveRefreshState(next);
  return next;
}
