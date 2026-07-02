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
  await AsyncStorage.removeItem(KEY);
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

// The active persona is a view preference, so it is DEVICE-LOCAL like the
// links map — syncing it would make two signed-in devices fight over it.
const ACTIVE_PERSONA_KEY = 'cym.activePersona.v1';

export async function loadActivePersonaId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_PERSONA_KEY);
}

export async function saveActivePersonaId(personaId: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PERSONA_KEY, personaId);
}
