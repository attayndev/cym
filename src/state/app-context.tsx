import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AppState as RNAppState } from 'react-native';

import { syncDeviceContacts, updateDeviceContacts } from '@/lib/contacts';
import { id } from '@/lib/ids';
import { syncScheduledNotifications } from '@/lib/notifications';
import { ensureClassified } from '@/lib/classify';
import { dedupeImports, mergePair } from '@/lib/dedupe';
import { applyEnrichment, fetchNameHints } from '@/lib/enrich';
import { diag } from '@/lib/log';
import { refreshLivingCards } from '@/lib/living-cards';
import { extractMemory, purgeContactMemory } from '@/lib/memory';
import { refreshEngine, roleChangeHook } from '@/lib/nudges';
import { reassignContacts, resolveActivePersonaId } from '@/lib/personas';
import { emptyDB, sampleEntities } from '@/lib/seed';
import {
  addArchiveTombstones,
  clearDB,
  loadActivePersonaId,
  loadDB,
  loadDeviceLinks,
  saveActivePersonaId,
  saveDB,
} from '@/lib/store';
import { configurePurchases } from '@/lib/purchases';
import { registerPushToken } from '@/lib/push';
import { getSupabase } from '@/lib/supabase';
import { GraphVersionConflict, mergeGraphs, pullGraph, pushGraph } from '@/lib/sync';
import { useAuth } from '@/state/auth-context';
import type {
  Category,
  ContactKind,
  Channel,
  Contact,
  ContextEntry,
  DB,
  Importance,
  InteractionType,
  Persona,
  UserProfile,
} from '@/lib/types';

export interface ContactPatch {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  city?: string;
  birthday?: string;
  category?: Category;
  importance?: Importance;
  cadenceDays?: number;
  personaId?: string;
  linkedin?: string;
  altEmails?: string[];
  altPhones?: string[];
  cardToken?: string;
}

export type PersonaPatch = Partial<
  Pick<Persona, 'name' | 'tagline' | 'role' | 'company' | 'displayName' | 'email' | 'phone'>
>;

export type ContextPatch = Partial<
  Pick<ContextEntry, 'whereMet' | 'discussed' | 'whyMatters' | 'commitment' | 'commitmentDueAt'>
>;

/** Trim string fields and drop empties so blanks clear rather than store "". */
function cleanPatch(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) =>
      typeof v === 'string' ? [k, v.trim() || undefined] : [k, v],
    ),
  );
}

export interface CaptureInput {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  city?: string;
  birthday?: string;
  category: Category;
  importance: Importance;
  cadenceDays: number;
  whereMet?: string;
  discussed?: string;
  whyMatters?: string;
  commitment?: string;
  commitmentDueAt?: string;
  source?: Contact['source'];
}

interface AppState {
  db: DB | null;
  /** False while the first cloud pull for this session is still in flight. */
  cloudReady: boolean;
  activePersonaId: string;
  setActivePersona: (personaId: string) => void;
  addPersona: (input: {
    name: string;
    tagline?: string;
    role?: string;
    company?: string;
    displayName?: string;
    email?: string;
    phone?: string;
  }) => string;
  updatePersona: (personaId: string, patch: PersonaPatch) => void;
  deletePersona: (personaId: string) => void;
  setDefaultPersona: (personaId: string) => void;
  captureContact: (input: CaptureInput) => string;
  updateContact: (contactId: string, patch: ContactPatch) => void;
  deleteContact: (contactId: string) => void;
  /** Noise sweep: archive in CYM only — never touches the device address book. */
  archiveContacts: (contactIds: string[]) => void;
  /** Sweep "Keep": confirm a suspected business is actually a person. */
  keepContact: (contactId: string) => void;
  /** "Remove from Call Your Mom": archive + purge CYM-private data. Durable
   *  (won't re-import) and never touches the device address book. */
  removeContact: (contactId: string) => void;
  /** Apply AI classifications — only to rows still 'unclear', so a user's
   *  explicit Keep (person) is never overridden. */
  applyContactKinds: (kinds: { id: string; kind: ContactKind }[]) => void;
  /** Evaluate-deck "Track" verdict: adopt the contact into the warm pool. */
  trackContact: (contactId: string, category: Category, cadenceDays: number) => void;
  /** Human-approved merge from the possible-duplicates review. */
  mergeContacts: (keeperId: string, dupeId: string) => void;
  updateContext: (contactId: string, patch: ContextPatch) => void;
  logInteraction: (contactId: string, type: InteractionType, note?: string) => void;
  markNudgeActed: (nudgeId: string, channel: Channel, note?: string) => void;
  dismissNudge: (nudgeId: string) => void;
  celebrateRoleChange: (contactId: string) => void;
  snoozeNudge: (nudgeId: string, days?: number) => void;
  setPro: (isPro: boolean) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  completeOnboarding: (profile: Partial<UserProfile>) => void;
  loadSampleData: () => void;
  exportData: () => string;
  resetAll: () => Promise<void>;
  importDeviceContacts: () => Promise<number>;
  syncContacts: () => Promise<{
    imported: number;
    exported: number;
    deviceTotal: number;
    access?: string;
  }>;
  /** Additive push of CYM directory facts into linked device contacts. */
  pushContactsToDevice: () => Promise<number>;
  pullNow: () => Promise<void>;
}

function stampRows<T extends { id: string; updatedAt?: string }>(
  prev: T[],
  next: T[],
  now: string,
): T[] {
  if (prev === next) return next;
  const prevById = new Map(prev.map((r) => [r.id, r]));
  let changed = false;
  const out = next.map((r) => {
    if (prevById.get(r.id) === r) return r; // untouched reference
    changed = true;
    return { ...r, updatedAt: now };
  });
  return changed ? out : next;
}

function stampUpdatedRows(prev: DB, next: DB): DB {
  if (prev === next) return next;
  const now = new Date().toISOString();
  const contacts = stampRows(prev.contacts, next.contacts, now);
  const contexts = stampRows(prev.contexts, next.contexts, now);
  const personas = stampRows(prev.personas, next.personas, now);
  if (contacts === next.contacts && contexts === next.contexts && personas === next.personas) {
    return next;
  }
  return { ...next, contacts, contexts, personas };
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [db, setDb] = useState<DB | null>(null);
  const dbRef = useRef<DB | null>(null);
  // The auth-user id whose graph the local DB currently reflects; gates pushes
  // so we never push before the initial pull for a session has completed.
  const syncedUserIdRef = useRef<string | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Concurrency token from the last pull/push — pushGraph refuses to run
  // with a stale one, which is what stops a lagging device from deleting
  // rows that newer devices wrote (the Sean-Murphy-came-back bug).
  const graphVersionRef = useRef(0);
  const lastPullAtRef = useRef(0);
  // False while the first cloud pull for the current session is in flight —
  // onboarding waits on this so a returning user's data restores before we
  // decide whether they're "new" (the bug: sign-in advanced onboarding while
  // the restore was still downloading, so it looked like a fresh account).
  const [cloudReady, setCloudReady] = useState(false);
  // Device-local view preference; resolved against db.personas below.
  const [storedPersonaId, setStoredPersonaId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // New installs start empty and go through onboarding; we no longer
      // auto-seed demo data over a real user's account.
      const existing = await loadDB();
      const base = dedupeImports(ensureClassified(existing ?? emptyDB()));
      const refreshed = refreshEngine(base, new Date());
      dbRef.current = refreshed;
      setDb(refreshed);
      setStoredPersonaId(await loadActivePersonaId());
      await saveDB(refreshed);
      void syncScheduledNotifications(refreshed);
    })();
  }, []);

  // Re-resolve whenever personas change (a cloud pull replaces the array, so a
  // stored id can start dangling mid-session).
  const activePersonaId = useMemo(() => {
    if (!db) return '';
    return resolveActivePersonaId(storedPersonaId, db.personas, db.profile.defaultPersonaId);
  }, [db, storedPersonaId]);
  const activePersonaIdRef = useRef(activePersonaId);
  activePersonaIdRef.current = activePersonaId;

  const setActivePersona = useCallback((personaId: string) => {
    setStoredPersonaId(personaId);
    void saveActivePersonaId(personaId);
  }, []);

  const schedulePush = useCallback(
    (next: DB) => {
      const userId = session?.user?.id;
      const supabase = getSupabase();
      if (!userId || !supabase || syncedUserIdRef.current !== userId) return;
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(() => {
        pushGraph(supabase, userId, next, graphVersionRef.current)
          .then((v) => {
            graphVersionRef.current = v;
            diag('push', { v, contacts: next.contacts.length, ints: next.interactions.length });
          })
          .catch((e) => {
            if (e instanceof GraphVersionConflict) {
              // Another device pushed first. The pull MERGES their work with
              // ours (nothing sacrificed), then the merged graph re-pushes
              // with the fresh version.
              console.warn('sync: version conflict — merging and retrying');
              void pullFromCloudRef.current?.(userId).then(() => {
                const merged = dbRef.current;
                if (merged) schedulePush(merged);
              });
              return;
            }
            // Local stays the source of truth; a failed push retries on next change.
            console.warn('sync push failed:', e instanceof Error ? e.message : e);
          });
      }, 1500);
    },
    [session],
  );
  // pullFromCloud is declared below (it needs schedulePush's siblings); the
  // ref breaks the cycle for the conflict-recovery path.
  const pullFromCloudRef = useRef<((userId: string) => Promise<void>) | null>(null);

  // Reconcile local <-> remote: adopt the cloud graph when it has data
  // (returning user / new device), otherwise push the local graph up (first
  // sign-in migrates whatever was captured offline). Server-owned data
  // (connected accounts + email-sync interactions) is always merged in.
  const pullFromCloud = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const remote = await pullGraph(supabase, userId);
    graphVersionRef.current = remote.graphVersion;
    lastPullAtRef.current = Date.now();
    const local = dbRef.current ?? emptyDB();
    // Contacts anchor the graph — contexts/interactions/nudges all hang off
    // them. A bare profile + default persona is exactly what a fresh sign-in
    // pushes up, so counting personas here would adopt an empty cloud graph
    // over real local data.
    const remoteHasData = remote.contacts.length > 0;

    let merged: DB;
    if (remoteHasData) {
      // TRUE MERGE — never adopt wholesale. Unpushed local work (a logged
      // touchpoint, an edit made seconds ago) survives every pull; the
      // newest version of each row wins; manual interactions are unioned.
      merged = mergeGraphs(local, remote);
    } else {
      // Keep the local graph, but adopt server-owned accounts + email interactions.
      const emailInts = remote.interactions.filter((i) => i.source === 'email-sync');
      const manualInts = local.interactions.filter((i) => i.source !== 'email-sync');
      merged = {
        ...local,
        accounts: remote.accounts,
        interactions: [...manualInts, ...emailInts],
      };
    }

    // Cloud rows can predate the lifecycle columns — normalize before use.
    const refreshed = refreshEngine(dedupeImports(ensureClassified(merged)), new Date());
    dbRef.current = refreshed;
    setDb(refreshed);
    await saveDB(refreshed);
    syncedUserIdRef.current = userId;
    diag('pull-merge', {
      v: remote.graphVersion,
      contacts: refreshed.contacts.length,
      manualInts: refreshed.interactions.filter((i) => i.source !== 'email-sync').length,
    });
    void syncScheduledNotifications(refreshed);

    // If the merge kept local work the cloud lacks, push it up — otherwise
    // other devices would never see it.
    if (remoteHasData) {
      const localHadNews =
        local.interactions.some(
          (i) => i.source !== 'email-sync' && !remote.interactions.some((r) => r.id === i.id),
        ) ||
        local.contacts.some((c) => {
          const r = remote.contacts.find((x) => x.id === c.id);
          return !r || new Date(c.updatedAt ?? 0) > new Date(r.updatedAt ?? 0);
        });
      if (localHadNews) schedulePush(refreshed);
    }

    // First sign-in with an empty cloud: migrate the local graph up.
    if (!remoteHasData) {
      graphVersionRef.current = await pushGraph(
        supabase,
        userId,
        refreshed,
        graphVersionRef.current,
      );
    }
  }, []);
  pullFromCloudRef.current = pullFromCloud;


  // Tier-0 enrichment: read server-harvested name hints (contact_hints) and
  // apply them + work-domain company inference additively. Runs after every
  // cloud pull so fresh Gmail harvests land without user action.
  const refreshEnrichment = useCallback(async () => {
    try {
      const hints = await fetchNameHints();
      const current = dbRef.current;
      if (!current) return;
      let next = applyEnrichment(current, hints);
      next = await refreshLivingCards(next);
      // A linked card overwriting an existing role/company is a confirmed job
      // change — celebrate it. Blank-to-filled is enrichment, not news.
      const before = new Map(current.contacts.map((c) => [c.id, c]));
      let hooks = next.hooks;
      for (const c of next.contacts) {
        const prev = before.get(c.id);
        if (!prev) continue;
        const changed =
          (prev.role && c.role && prev.role !== c.role) ||
          (prev.company && c.company && prev.company !== c.company);
        if (!changed) continue;
        const hook = roleChangeHook({ ...next, hooks }, c.id, new Date());
        if (hook) hooks = [...hooks, hook];
        // Relationship Memory (Plus): a confirmed job change from the
        // subject's own card is durable life-event signal — worth a memory row.
        if (current.profile.isPro) {
          extractMemory({
            contactId: c.id,
            text: `Now ${c.role ?? 'in a new role'}${c.company ? ` at ${c.company}` : ''}.`,
            source: 'card',
          });
        }
      }
      if (hooks !== next.hooks) next = refreshEngine({ ...next, hooks }, new Date());
      if (next !== current) {
        // Stamp like any other mutation so merges treat these as fresh edits.
        next = stampUpdatedRows(current, next);
        dbRef.current = next;
        setDb(next);
        await saveDB(next);
        schedulePush(next);
      }
    } catch {
      // Enrichment is best-effort; never block sync on it.
    }
  }, [schedulePush]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !getSupabase()) {
      syncedUserIdRef.current = null;
      setCloudReady(true); // signed out or unconfigured: nothing to restore
      return;
    }
    let cancelled = false;
    setCloudReady(false);
    (async () => {
      try {
        if (!cancelled) await pullFromCloud(userId);
        if (!cancelled) await refreshEnrichment();
      } catch (e) {
        // Offline or misconfigured: stay local-only, don't block the app.
        console.warn('cloud pull failed:', e instanceof Error ? e.message : e);
      } finally {
        if (!cancelled) setCloudReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, pullFromCloud]);

  const pushContactsToDevice = useCallback(async (): Promise<number> => {
    const current = dbRef.current;
    if (!current) return 0;
    return updateDeviceContacts(current.contacts);
  }, []);


  const pullNow = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    try {
      await pullFromCloud(userId);
    } catch {
      // best-effort
    }
  }, [session, pullFromCloud, refreshEnrichment]);

  // Register this device for push once per signed-in session, when reminders are on.
  const pushRegisteredForRef = useRef<string | null>(null);
  const notificationsEnabled = db?.profile.notificationsEnabled ?? false;
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      pushRegisteredForRef.current = null;
      return;
    }
    if (notificationsEnabled && pushRegisteredForRef.current !== userId) {
      pushRegisteredForRef.current = userId;
      void registerPushToken();
    }
  }, [session, notificationsEnabled]);

  // RevenueCat: configure once per signed-in session (keyed to the Supabase
  // user id so webhooks map app_user_id → profiles). The entitlement stream
  // is the client-side source of truth for isPro; the webhook keeps the
  // server column honest for renewals that happen while the app is closed.
  const purchasesConfiguredForRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || purchasesConfiguredForRef.current === userId) return;
    purchasesConfiguredForRef.current = userId;
    void configurePurchases(userId, (isPro) => {
      const current = dbRef.current;
      if (current && current.profile.isPro !== isPro) {
        setDb((prev) => {
          if (!prev || prev.profile.isPro === isPro) return prev;
          const next = { ...prev, profile: { ...prev.profile, isPro } };
          dbRef.current = next;
          void saveDB(next);
          schedulePush(next);
          return next;
        });
      }
    });
  }, [session, schedulePush]);

  const update = useCallback(
    (fn: (current: DB) => DB) => {
      const current = dbRef.current;
      if (!current) return;
      let next = fn(current);
      // Stamp updatedAt on every row whose reference changed — immutable
      // updates mean ref-changed <=> modified. Sync merges keep the newest
      // row, which is what makes pulls safe for unpushed local edits.
      next = stampUpdatedRows(current, next);
      dbRef.current = next;
      setDb(next);
      void saveDB(next);
      void syncScheduledNotifications(next);
      schedulePush(next);
    },
    [schedulePush],
  );

  const addPersona = useCallback(
    (input: {
      name: string;
      tagline?: string;
      role?: string;
      company?: string;
      displayName?: string;
      email?: string;
      phone?: string;
    }): string => {
      const personaId = id('psn');
      update((current) => ({
        ...current,
        personas: [
          ...current.personas,
          {
            id: personaId,
            name: input.name.trim(),
            tagline: input.tagline?.trim() || undefined,
            role: input.role?.trim() || undefined,
            company: input.company?.trim() || undefined,
            displayName: input.displayName?.trim() || undefined,
            email: input.email?.trim() || undefined,
            phone: input.phone?.trim() || undefined,
            isDefault: false,
          },
        ],
      }));
      setActivePersona(personaId);
      return personaId;
    },
    [update, setActivePersona],
  );

  const updatePersona = useCallback(
    (personaId: string, patch: PersonaPatch) => {
      const clean = cleanPatch(patch as Record<string, unknown>);
      update((current) => ({
        ...current,
        personas: current.personas.map((p) => (p.id === personaId ? { ...p, ...clean } : p)),
      }));
    },
    [update],
  );

  const deletePersona = useCallback(
    (personaId: string) => {
      update((current) => {
        const persona = current.personas.find((p) => p.id === personaId);
        // The default persona (and the last one standing) can't be deleted.
        if (!persona || persona.isDefault || current.personas.length < 2) return current;
        const fallbackId = current.profile.defaultPersonaId;
        return refreshEngine(
          {
            ...current,
            personas: current.personas.filter((p) => p.id !== personaId),
            contacts: reassignContacts(current.contacts, personaId, fallbackId),
          },
          new Date(),
        );
      });
      if (activePersonaIdRef.current === personaId) {
        const fallback = dbRef.current?.profile.defaultPersonaId;
        if (fallback) setActivePersona(fallback);
      }
    },
    [update, setActivePersona],
  );

  const setDefaultPersona = useCallback(
    (personaId: string) => {
      update((current) => {
        if (!current.personas.some((p) => p.id === personaId)) return current;
        return {
          ...current,
          profile: { ...current.profile, defaultPersonaId: personaId },
          personas: current.personas.map((p) => ({ ...p, isDefault: p.id === personaId })),
        };
      });
    },
    [update],
  );

  const captureContact = useCallback(
    (input: CaptureInput): string => {
      const contactId = id('ctc');
      const nowIso = new Date().toISOString();
      update((current) => {
        const contact: Contact = {
          id: contactId,
          personaId: activePersonaIdRef.current || current.profile.defaultPersonaId,
          firstName: input.firstName.trim(),
          lastName: input.lastName?.trim() || undefined,
          email: input.email?.trim() || undefined,
          phone: input.phone?.trim() || undefined,
          company: input.company?.trim() || undefined,
          role: input.role?.trim() || undefined,
          city: input.city?.trim() || undefined,
          birthday: input.birthday || undefined,
          category: input.category,
          importance: input.importance,
          cadenceDays: input.cadenceDays,
          source: input.source ?? 'manual',
          createdAt: nowIso,
          // Deliberately-captured contacts are people by definition.
          kind: 'person',
          status: 'active',
        };
        const context: ContextEntry = {
          id: id('ctx'),
          contactId,
          whereMet: input.whereMet?.trim() || undefined,
          discussed: input.discussed?.trim() || undefined,
          whyMatters: input.whyMatters?.trim() || undefined,
          commitment: input.commitment?.trim() || undefined,
          commitmentDueAt: input.commitmentDueAt,
          createdAt: nowIso,
        };
        return refreshEngine(
          {
            ...current,
            contacts: [...current.contacts, contact],
            contexts: [...current.contexts, context],
            interactions: [
              ...current.interactions,
              { id: id('int'), contactId, type: 'met', occurredAt: nowIso, source: 'capture' },
            ],
          },
          new Date(),
        );
      });
      return contactId;
    },
    [update],
  );

  const updateContact = useCallback(
    (contactId: string, patch: ContactPatch) => {
      const clean = cleanPatch(patch as Record<string, unknown>);
      update((current) =>
        refreshEngine(
          {
            ...current,
            contacts: current.contacts.map((c) =>
              c.id === contactId ? { ...c, ...clean } : c,
            ),
          },
          new Date(),
        ),
      );
    },
    [update],
  );

  const deleteContact = useCallback(
    (contactId: string) => {
      update((current) => ({
        ...current,
        contacts: current.contacts.filter((c) => c.id !== contactId),
        contexts: current.contexts.filter((c) => c.contactId !== contactId),
        interactions: current.interactions.filter((i) => i.contactId !== contactId),
        hooks: current.hooks.filter((h) => h.contactId !== contactId),
        nudges: current.nudges.filter((n) => n.contactId !== contactId),
      }));
    },
    [update],
  );

  // Noise sweep: archive is CYM-only (device address book untouched). Pending
  // work for archived contacts is cleared; keep = confirmed person, so the
  // sweep never asks about them again.
  const archiveContacts = useCallback(
    (contactIds: string[]) => {
      // Durable verdict: remember the device ids so imports never resurrect.
      void loadDeviceLinks().then((links) => {
        const ids = contactIds.map((id) => links[id]).filter(Boolean) as string[];
        void addArchiveTombstones(ids);
      });
      const ids = new Set(contactIds);
      update((current) => ({
        ...current,
        contacts: current.contacts.map((c) =>
          ids.has(c.id) ? { ...c, status: 'archived' as const } : c,
        ),
        hooks: current.hooks.filter((h) => !ids.has(h.contactId)),
        nudges: current.nudges.filter((n) => !ids.has(n.contactId)),
      }));
    },
    [update],
  );

  // "Remove from Call Your Mom": archive (not delete) so a linked device
  // contact can't resurrect on the next contacts sync, and purge everything
  // CYM-private about them. The device address book is never touched.
  const removeContact = useCallback(
    (contactId: string) => {
      void loadDeviceLinks().then((links) => {
        const dev = links[contactId];
        if (dev) void addArchiveTombstones([dev]);
      });
      purgeContactMemory(contactId);
      update((current) => ({
        ...current,
        contacts: current.contacts.map((c) =>
          c.id === contactId ? { ...c, status: 'archived' as const } : c,
        ),
        contexts: current.contexts.filter((c) => c.contactId !== contactId),
        interactions: current.interactions.filter(
          (i) => i.contactId !== contactId || i.source === 'email-sync',
        ),
        hooks: current.hooks.filter((h) => h.contactId !== contactId),
        nudges: current.nudges.filter((n) => n.contactId !== contactId),
      }));
    },
    [update],
  );

  const keepContact = useCallback(
    (contactId: string) => {
      update((current) => ({
        ...current,
        contacts: current.contacts.map((c) =>
          c.id === contactId ? { ...c, kind: 'person' as const, status: 'active' as const } : c,
        ),
      }));
    },
    [update],
  );

  const trackContact = useCallback(
    (contactId: string, category: Category, cadenceDays: number) => {
      update((current) => ({
        ...current,
        contacts: current.contacts.map((c) =>
          c.id === contactId
            ? {
                ...c,
                category,
                cadenceDays,
                importance: Math.max(c.importance, 2) as Contact['importance'],
                kind: 'person' as const,
                evaluatedAt: new Date().toISOString(),
              }
            : c,
        ),
      }));
    },
    [update],
  );

  const mergeContacts = useCallback(
    (keeperId: string, dupeId: string) => {
      update((current) => mergePair(current, keeperId, dupeId));
    },
    [update],
  );

  const applyContactKinds = useCallback(
    (kinds: { id: string; kind: ContactKind }[]) => {
      const byId = new Map(kinds.map((k) => [k.id, k.kind]));
      update((current) => ({
        ...current,
        contacts: current.contacts.map((c) =>
          byId.has(c.id) && (c.kind ?? 'unclear') === 'unclear'
            ? { ...c, kind: byId.get(c.id)! }
            : c,
        ),
      }));
    },
    [update],
  );

  const updateContext = useCallback(
    (contactId: string, patch: ContextPatch) => {
      const nowIso = new Date().toISOString();
      update((current) => {
        const existing = current.contexts.find((c) => c.contactId === contactId);
        const cleaned = cleanPatch(patch as Record<string, unknown>) as ContextPatch;
        const contexts = existing
          ? current.contexts.map((c) =>
              c.contactId === contactId ? { ...c, ...cleaned } : c,
            )
          : [
              ...current.contexts,
              { id: id('ctx'), contactId, createdAt: nowIso, ...cleaned },
            ];
        return refreshEngine({ ...current, contexts }, new Date());
      });
    },
    [update],
  );

  const logInteraction = useCallback(
    (contactId: string, type: InteractionType, note?: string) => {
      diag('interaction', { type, contactId });
      update((current) =>
        refreshEngine(
          {
            ...current,
            interactions: [
              ...current.interactions,
              {
                id: id('int'),
                contactId,
                type,
                note,
                occurredAt: new Date().toISOString(),
                source: 'manual',
              },
            ],
          },
          new Date(),
        ),
      );
    },
    [update],
  );

  const markNudgeActed = useCallback(
    (nudgeId: string, channel: Channel, note?: string) => {
      update((current) => {
        const nudge = current.nudges.find((n) => n.id === nudgeId);
        if (!nudge) return current;
        return {
          ...current,
          nudges: current.nudges.map((n) =>
            n.id === nudgeId ? { ...n, state: 'acted' as const } : n,
          ),
          hooks: current.hooks.map((h) =>
            h.id === nudge.hookId ? { ...h, consumedAt: new Date().toISOString() } : h,
          ),
          interactions: [
            ...current.interactions,
            {
              id: id('int'),
              contactId: nudge.contactId,
              type: channel === 'email' ? ('email' as const) : ('text' as const),
              note,
              occurredAt: new Date().toISOString(),
              source: 'manual' as const,
            },
          ],
        };
      });
    },
    [update],
  );

  // The user just confirmed someone's job change (accepted an enrichment
  // proposal) — hook it so the engine surfaces a congrats nudge. Runs after
  // the contact patch, so nudge copy derives from the NEW role.
  const celebrateRoleChange = useCallback(
    (contactId: string) => {
      update((current) => {
        const hook = roleChangeHook(current, contactId, new Date());
        return hook
          ? refreshEngine({ ...current, hooks: [...current.hooks, hook] }, new Date())
          : current;
      });
    },
    [update],
  );

  const dismissNudge = useCallback(
    (nudgeId: string) => {
      update((current) => ({
        ...current,
        nudges: current.nudges.map((n) =>
          n.id === nudgeId ? { ...n, state: 'dismissed' as const } : n,
        ),
      }));
    },
    [update],
  );

  const snoozeNudge = useCallback(
    (nudgeId: string, days = 3) => {
      const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      update((current) => ({
        ...current,
        nudges: current.nudges.map((n) =>
          n.id === nudgeId ? { ...n, state: 'snoozed' as const, snoozedUntil: until } : n,
        ),
      }));
    },
    [update],
  );

  const setPro = useCallback(
    (isPro: boolean) => {
      update((current) => ({ ...current, profile: { ...current.profile, isPro } }));
    },
    [update],
  );

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      update((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
    },
    [update],
  );

  // Re-pull whenever the app returns to the foreground after sitting idle —
  // fresh devices rarely conflict, so version refusals stay a rare backstop.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const userId = session?.user?.id;
      if (!userId || syncedUserIdRef.current !== userId) return;
      if (Date.now() - lastPullAtRef.current < 3 * 60 * 1000) return;
      void pullFromCloud(userId).catch(() => {});
    });
    return () => sub.remove();
  }, [session, pullFromCloud]);

  // Report the device timezone once it differs — server pushes use it to
  // fire on the user's local day/hour.
  useEffect(() => {
    if (!db) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && db.profile.timezone !== tz) updateProfile({ timezone: tz });
    } catch {
      // no tz info — server falls back to UTC
    }
  }, [db, updateProfile]);

  const setNotificationsEnabled = useCallback(
    (enabled: boolean) => {
      update((current) => ({
        ...current,
        profile: { ...current.profile, notificationsEnabled: enabled },
      }));
    },
    [update],
  );

  const completeOnboarding = useCallback(
    (profile: Partial<UserProfile>) => {
      update((current) => ({
        ...current,
        profile: { ...current.profile, ...profile },
        // Cards live on personas only (no base layer): the onboarding card
        // step seeds the default persona's card so a new account isn't blank.
        personas: current.personas.map((p) =>
          p.id === current.profile.defaultPersonaId
            ? {
                ...p,
                displayName: profile.name?.trim() || p.displayName,
                email: profile.email?.trim() || p.email,
                phone: profile.phone?.trim() || p.phone,
                role: profile.role?.trim() || p.role,
                company: profile.company?.trim() || p.company,
              }
            : p,
        ),
        onboarded: true,
      }));
    },
    [update],
  );

  const loadSampleData = useCallback(() => {
    update((current) => {
      const sample = sampleEntities(
        new Date(),
        activePersonaIdRef.current || current.profile.defaultPersonaId,
      );
      return refreshEngine(
        {
          ...current,
          contacts: [...current.contacts, ...sample.contacts],
          contexts: [...current.contexts, ...sample.contexts],
          interactions: [...current.interactions, ...sample.interactions],
        },
        new Date(),
      );
    });
  }, [update]);

  const exportData = useCallback((): string => {
    return JSON.stringify(dbRef.current ?? {}, null, 2);
  }, []);

  const resetAll = useCallback(async () => {
    await clearDB();
    const fresh = emptyDB();
    dbRef.current = fresh;
    setDb(fresh);
    await saveDB(fresh);
    void syncScheduledNotifications(fresh);
    schedulePush(fresh);
  }, [schedulePush]);

  const runDeviceSync = useCallback(
    async (
      withExport: boolean,
    ): Promise<{ imported: number; exported: number; deviceTotal: number; access?: string }> => {
      const current = dbRef.current;
      if (!current) return { imported: 0, exported: 0, deviceTotal: 0 };
      const result = await syncDeviceContacts(
        current.contacts,
        activePersonaIdRef.current || current.profile.defaultPersonaId,
        { export: withExport },
      );
      if (withExport) {
        // Two-way means two-way: refreshed titles/companies (enrichment,
        // LinkedIn) flow back into the phone book on every sync, not only
        // via the separate settings button.
        const pushed = await updateDeviceContacts(dbRef.current?.contacts ?? current.contacts);
        diag('device-sync', { pushedUpdates: pushed });
      }
      if (result.newContacts.length > 0 || result.patches.length > 0) {
        const patchById = new Map(result.patches.map((p) => [p.id, p]));
        update((c) =>
          refreshEngine(
            {
              ...c,
              contacts: [
                ...c.contacts.map((existing) => {
                  const p = patchById.get(existing.id);
                  return p ? { ...existing, ...p } : existing;
                }),
                ...result.newContacts,
              ],
            },
            new Date(),
          ),
        );
      }
      return {
        imported: result.imported,
        exported: result.exported,
        deviceTotal: result.deviceTotal,
        access: result.access,
      };
    },
    [update],
  );

  // Onboarding "Import my contacts" — pull only.
  const importDeviceContacts = useCallback(async (): Promise<number> => {
    const { imported } = await runDeviceSync(false);
    return imported;
  }, [runDeviceSync]);

  // People "Sync contacts" — two-way (pull device contacts + push app contacts out).
  const syncContacts = useCallback(
    async (): Promise<{ imported: number; exported: number; deviceTotal: number; access?: string }> =>
      runDeviceSync(true),
    [runDeviceSync],
  );

  const value = useMemo(
    () => ({
      db,
      cloudReady,
      activePersonaId,
      setActivePersona,
      addPersona,
      updatePersona,
      deletePersona,
      setDefaultPersona,
      captureContact,
      updateContact,
      deleteContact,
      archiveContacts,
      keepContact,
      removeContact,
      applyContactKinds,
      trackContact,
      mergeContacts,
      updateContext,
      logInteraction,
      markNudgeActed,
      dismissNudge,
      celebrateRoleChange,
      snoozeNudge,
      setPro,
      updateProfile,
      setNotificationsEnabled,
      completeOnboarding,
      loadSampleData,
      exportData,
      resetAll,
      importDeviceContacts,
      syncContacts,
      pushContactsToDevice,
      pullNow,
    }),
    [
      db,
      cloudReady,
      activePersonaId,
      setActivePersona,
      addPersona,
      updatePersona,
      deletePersona,
      setDefaultPersona,
      captureContact,
      updateContact,
      deleteContact,
      archiveContacts,
      keepContact,
      removeContact,
      applyContactKinds,
      trackContact,
      mergeContacts,
      updateContext,
      logInteraction,
      markNudgeActed,
      dismissNudge,
      celebrateRoleChange,
      snoozeNudge,
      setPro,
      updateProfile,
      setNotificationsEnabled,
      completeOnboarding,
      loadSampleData,
      exportData,
      resetAll,
      importDeviceContacts,
      syncContacts,
      pushContactsToDevice,
      pullNow,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
