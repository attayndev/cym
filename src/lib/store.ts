import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DB } from '@/lib/types';

const KEY = 'cym.db.v1';

export async function loadDB(): Promise<DB | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DB;
  } catch {
    return null;
  }
}

export async function saveDB(db: DB): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(db));
}

export async function clearDB(): Promise<void> {
  // A cleared graph invalidates everything keyed by its contact/persona ids,
  // so the device-local sidecars must go with it: stale device links would
  // make every address-book contact look "already imported" (import 0 forever).
  await AsyncStorage.multiRemove([
    KEY,
    LINKS_KEY,
    ACTIVE_PERSONA_KEY,
    CHECKLIST_KEY,
    DECK_SKIPS_KEY,
    REFRESH_KEY,
    MERGE_KEEPS_KEY,
    ARCHIVE_TOMBSTONES_KEY,
    BIRTHDAY_SKIPS_KEY,
    USER_VOICE_KEY,
  ]);
}

// Device contact links map a Call Your Mom contact id to a native address-book
// contact id. This is DEVICE-LOCAL and never synced — the same person has a
// different device-contact id on each phone, so syncing it would mislink.
const LINKS_KEY = 'cym.deviceLinks.v1';

export async function loadDeviceLinks(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(LINKS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveDeviceLinks(links: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(links));
}

// Getting-started checklist view state (collapsed/dismissed). Device-local:
// completion itself is derived from the graph, so it needs no storage at all.
const CHECKLIST_KEY = 'cym.checklist.v1';

export interface ChecklistPrefs {
  collapsed: boolean;
  dismissed: boolean;
}

export async function loadChecklistPrefs(): Promise<ChecklistPrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(CHECKLIST_KEY);
    if (raw) return JSON.parse(raw) as ChecklistPrefs;
  } catch {
    // fall through to null
  }
  return null;
}

export async function saveChecklistPrefs(prefs: ChecklistPrefs): Promise<void> {
  await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(prefs));
}

// "Keep separate" verdicts from the possible-duplicates review — pairKey
// (sorted ids joined) -> dismissed-at ISO. Device-local.
const MERGE_KEEPS_KEY = 'cym.mergeKeeps.v1';

export async function loadMergeKeeps(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(MERGE_KEEPS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    // fall through
  }
  return {};
}

export async function saveMergeKeeps(keeps: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(MERGE_KEEPS_KEY, JSON.stringify(keeps));
}

// Birthday-sweep "Skip" verdicts — contactId -> skipped-at ISO. Device-local:
// worst case another device re-asks once. Re-eligible after BDAY_SKIP_DAYS.
const BIRTHDAY_SKIPS_KEY = 'cym.birthdaySweep.v1';

export async function loadBirthdaySkips(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(BIRTHDAY_SKIPS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    // fall through
  }
  return {};
}

export async function saveBirthdaySkips(skips: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(BIRTHDAY_SKIPS_KEY, JSON.stringify(skips));
}

// Device-contact ids the user archived/removed — imports must never
// resurrect them, even if the synced graph loses the archived rows (the
// July 8 clobber recreated archived corporate contacts as active).
const ARCHIVE_TOMBSTONES_KEY = 'cym.archiveTombstones.v1';

export async function loadArchiveTombstones(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_TOMBSTONES_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // fall through
  }
  return new Set();
}

export async function addArchiveTombstones(deviceIds: string[]): Promise<void> {
  if (deviceIds.length === 0) return;
  const set = await loadArchiveTombstones();
  for (const id of deviceIds) set.add(id);
  await AsyncStorage.setItem(ARCHIVE_TOMBSTONES_KEY, JSON.stringify([...set]));
}

// Evaluate-deck skips for the CURRENT day only (skip = "not today"; the daily
// rotation resurfaces skipped people organically). Device-local by design.
// Refresh sweep state: rotating cursor over the contact pool, pending update
// proposals, and per-proposal "keep" dismissals. Device-local — each device
// sweeps for itself (the server-side Hunter cache makes repeats free).
const REFRESH_KEY = 'cym.refresh.v1';

export interface UpdateProposal {
  contactId: string;
  field: 'role' | 'company' | 'cadenceDays';
  current: string;
  proposed: string;
  /** For rhythm proposals: the measured median gap in days. */
  observed?: number;
  foundAt: string;
}

export interface RefreshState {
  day: string;
  cursor: number;
  proposals: UpdateProposal[];
  /** key `${contactId}|${field}|${proposed.toLowerCase()}` -> dismissed-at ISO */
  keeps: Record<string, string>;
}

export const emptyRefreshState = (): RefreshState => ({
  day: '',
  cursor: 0,
  proposals: [],
  keeps: {},
});

export async function loadRefreshState(): Promise<RefreshState> {
  try {
    const raw = await AsyncStorage.getItem(REFRESH_KEY);
    if (raw) return { ...emptyRefreshState(), ...(JSON.parse(raw) as RefreshState) };
  } catch {
    // fall through
  }
  return emptyRefreshState();
}

export async function saveRefreshState(state: RefreshState): Promise<void> {
  await AsyncStorage.setItem(REFRESH_KEY, JSON.stringify(state));
}

const DECK_SKIPS_KEY = 'cym.deckSkips.v1';

const DECK_COLLAPSED_KEY = 'cym.deckCollapsed.v1';

/** "Worth tracking?" stays the way you left it — folded or open. */
export async function loadDeckCollapsed(): Promise<boolean> {
  return (await AsyncStorage.getItem(DECK_COLLAPSED_KEY)) === '1';
}

export async function saveDeckCollapsed(collapsed: boolean): Promise<void> {
  await AsyncStorage.setItem(DECK_COLLAPSED_KEY, collapsed ? '1' : '0');
}

export async function loadDeckSkips(day: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DECK_SKIPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { day: string; ids: string[] };
      if (parsed.day === day) return parsed.ids;
    }
  } catch {
    // fall through
  }
  return [];
}

export async function saveDeckSkips(day: string, ids: string[]): Promise<void> {
  await AsyncStorage.setItem(DECK_SKIPS_KEY, JSON.stringify({ day, ids }));
}

// The active persona is a view preference, so it is DEVICE-LOCAL like the
// links map — syncing it would make two signed-in devices fight over it.
const ACTIVE_PERSONA_KEY = 'cym.activePersona.v1';

export async function loadActivePersonaId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_PERSONA_KEY);
}

export async function saveActivePersonaId(personaId: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PERSONA_KEY, personaId);
}

// User Voice (Phase A, Plus): a distilled style profile — how this person
// writes, learned from their own sent notes. DEVICE-LOCAL ONLY, deliberately
// outside the whole-graph sync (a profile derived on one phone should never
// silently apply to another). The server distiller is stateless; this is the
// only place the result is ever stored.
const USER_VOICE_KEY = 'cym.userVoice.v1';

export interface UserVoice {
  rows: { id: string; kind: 'voice' | 'preference'; content: string }[];
  distilledAt: string;
  noteCount: number;
}

export async function loadUserVoice(): Promise<UserVoice | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_VOICE_KEY);
    if (raw) return JSON.parse(raw) as UserVoice;
  } catch {
    // fall through to null
  }
  return null;
}

export async function saveUserVoice(v: UserVoice): Promise<void> {
  await AsyncStorage.setItem(USER_VOICE_KEY, JSON.stringify(v));
}
