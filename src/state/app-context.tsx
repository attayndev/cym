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

import { syncDeviceContacts } from '@/lib/contacts';
import { id } from '@/lib/ids';
import { syncScheduledNotifications } from '@/lib/notifications';
import { refreshEngine } from '@/lib/nudges';
import { reassignContacts, resolveActivePersonaId } from '@/lib/personas';
import { emptyDB, sampleEntities } from '@/lib/seed';
import {
  clearDB,
  loadActivePersonaId,
  loadDB,
  saveActivePersonaId,
  saveDB,
} from '@/lib/store';
import { registerPushToken } from '@/lib/push';
import { getSupabase } from '@/lib/supabase';
import { pullGraph, pushGraph } from '@/lib/sync';
import { useAuth } from '@/state/auth-context';
import type {
  Category,
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
}

export type PersonaPatch = Partial<Pick<Persona, 'name' | 'tagline' | 'role' | 'company'>>;

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
  activePersonaId: string;
  setActivePersona: (personaId: string) => void;
  addPersona: (input: { name: string; tagline?: string; role?: string; company?: string }) => string;
  updatePersona: (personaId: string, patch: PersonaPatch) => void;
  deletePersona: (personaId: string) => void;
  setDefaultPersona: (personaId: string) => void;
  captureContact: (input: CaptureInput) => string;
  updateContact: (contactId: string, patch: ContactPatch) => void;
  deleteContact: (contactId: string) => void;
  updateContext: (contactId: string, patch: ContextPatch) => void;
  logInteraction: (contactId: string, type: InteractionType, note?: string) => void;
  markNudgeActed: (nudgeId: string, channel: Channel) => void;
  dismissNudge: (nudgeId: string) => void;
  snoozeNudge: (nudgeId: string, days?: number) => void;
  setPro: (isPro: boolean) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  completeOnboarding: (profile: Partial<UserProfile>) => void;
  loadSampleData: () => void;
  exportData: () => string;
  resetAll: () => Promise<void>;
  importDeviceContacts: () => Promise<number>;
  syncContacts: () => Promise<{ imported: number; exported: number }>;
  pullNow: () => Promise<void>;
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
  // Device-local view preference; resolved against db.personas below.
  const [storedPersonaId, setStoredPersonaId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // New installs start empty and go through onboarding; we no longer
      // auto-seed demo data over a real user's account.
      const existing = await loadDB();
      const base = existing ?? emptyDB();
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
        void pushGraph(supabase, userId, next).catch(() => {
          // Local stays the source of truth; a failed push retries on next change.
        });
      }, 1500);
    },
    [session],
  );

  // Reconcile local <-> remote: adopt the cloud graph when it has data
  // (returning user / new device), otherwise push the local graph up (first
  // sign-in migrates whatever was captured offline). Server-owned data
  // (connected accounts + email-sync interactions) is always merged in.
  const pullFromCloud = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const remote = await pullGraph(supabase, userId);
    const local = dbRef.current ?? emptyDB();
    const remoteHasData = remote.contacts.length > 0 || remote.personas.length > 0;

    let merged: DB;
    if (remoteHasData) {
      merged = {
        ...local,
        profile: { ...local.profile, ...(remote.profile ?? {}) },
        onboarded: remote.onboarded || local.onboarded,
        personas: remote.personas,
        contacts: remote.contacts,
        contexts: remote.contexts,
        interactions: remote.interactions,
        hooks: remote.hooks,
        nudges: remote.nudges,
        accounts: remote.accounts,
      };
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

    const refreshed = refreshEngine(merged, new Date());
    dbRef.current = refreshed;
    setDb(refreshed);
    await saveDB(refreshed);
    syncedUserIdRef.current = userId;
    void syncScheduledNotifications(refreshed);

    // First sign-in with an empty cloud: migrate the local graph up.
    if (!remoteHasData) await pushGraph(supabase, userId, refreshed);
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !getSupabase()) {
      syncedUserIdRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await pullFromCloud(userId);
      } catch {
        // Offline or misconfigured: stay local-only, don't block the app.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, pullFromCloud]);

  const pullNow = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    try {
      await pullFromCloud(userId);
    } catch {
      // best-effort
    }
  }, [session, pullFromCloud]);

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

  const update = useCallback(
    (fn: (current: DB) => DB) => {
      const current = dbRef.current;
      if (!current) return;
      const next = fn(current);
      dbRef.current = next;
      setDb(next);
      void saveDB(next);
      void syncScheduledNotifications(next);
      schedulePush(next);
    },
    [schedulePush],
  );

  const addPersona = useCallback(
    (input: { name: string; tagline?: string; role?: string; company?: string }): string => {
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
    (nudgeId: string, channel: Channel) => {
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
              occurredAt: new Date().toISOString(),
              source: 'manual' as const,
            },
          ],
        };
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
    async (withExport: boolean): Promise<{ imported: number; exported: number }> => {
      const current = dbRef.current;
      if (!current) return { imported: 0, exported: 0 };
      const result = await syncDeviceContacts(
        current.contacts,
        activePersonaIdRef.current || current.profile.defaultPersonaId,
        { export: withExport },
      );
      if (result.newContacts.length > 0) {
        update((c) =>
          refreshEngine({ ...c, contacts: [...c.contacts, ...result.newContacts] }, new Date()),
        );
      }
      return { imported: result.imported, exported: result.exported };
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
    async (): Promise<{ imported: number; exported: number }> => runDeviceSync(true),
    [runDeviceSync],
  );

  const value = useMemo(
    () => ({
      db,
      activePersonaId,
      setActivePersona,
      addPersona,
      updatePersona,
      deletePersona,
      setDefaultPersona,
      captureContact,
      updateContact,
      deleteContact,
      updateContext,
      logInteraction,
      markNudgeActed,
      dismissNudge,
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
      pullNow,
    }),
    [
      db,
      activePersonaId,
      setActivePersona,
      addPersona,
      updatePersona,
      deletePersona,
      setDefaultPersona,
      captureContact,
      updateContact,
      deleteContact,
      updateContext,
      logInteraction,
      markNudgeActed,
      dismissNudge,
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
