// SDK 56 moved the functional API to the legacy entry point; migrating to the
// new class-based API is on the roadmap (see FEATURES.md).
import * as Contacts from 'expo-contacts/legacy';
import { Platform } from 'react-native';

import { id } from '@/lib/ids';
import { loadDeviceLinks, saveDeviceLinks } from '@/lib/store';
import type { Contact } from '@/lib/types';

export interface SyncResult {
  /** New Call Your Mom contacts created from the device (caller adds these to the DB). */
  newContacts: Contact[];
  imported: number;
  exported: number;
}

const READ_FIELDS = [
  Contacts.Fields.FirstName,
  Contacts.Fields.LastName,
  Contacts.Fields.Emails,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Company,
  Contacts.Fields.JobTitle,
  Contacts.Fields.Birthday,
];

function normName(first?: string | null, last?: string | null): string {
  return `${first ?? ''} ${last ?? ''}`.trim().toLowerCase();
}

function birthdayMMDD(b?: Contacts.Date): string | undefined {
  if (b?.month === undefined || b?.day === undefined) return undefined;
  return `${String(b.month + 1).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Two-way sync between Call Your Mom and the device address book (which the OS
 * already merges across Google / iCloud / Microsoft accounts):
 *  - import: device contacts not yet linked become CYM contacts (or link to an
 *    existing same-name contact), so re-running never duplicates;
 *  - export: CYM contacts not yet on the device get written there and linked.
 * The link map is device-local (see store.ts).
 */
export async function syncDeviceContacts(
  existing: Contact[],
  personaId: string,
  options: { export: boolean } = { export: true },
): Promise<SyncResult> {
  if (!(await ensurePermission())) {
    return { newContacts: [], imported: 0, exported: 0 };
  }

  const links = await loadDeviceLinks();
  const linkedDeviceIds = new Set(Object.values(links));
  const linkedCymIds = new Set(Object.keys(links));
  const existingByName = new Map(existing.map((c) => [normName(c.firstName, c.lastName), c]));

  // Page through the address book — 10k+ contact books are real.
  type DeviceContact = Awaited<ReturnType<typeof Contacts.getContactsAsync>>['data'][number];
  const deviceContacts: DeviceContact[] = [];
  const pageSize = 500;
  for (let pageOffset = 0; ; pageOffset += pageSize) {
    const { data } = await Contacts.getContactsAsync({
      fields: READ_FIELDS,
      pageSize,
      pageOffset,
    });
    deviceContacts.push(...data);
    if (data.length < pageSize) break;
  }

  // --- import: device -> app ---
  const newContacts: Contact[] = [];
  let imported = 0;
  for (const dc of deviceContacts) {
    if (!dc.id || linkedDeviceIds.has(dc.id)) continue;
    const first = dc.firstName ?? dc.name;
    if (!first) continue;

    const existingMatch = existingByName.get(normName(dc.firstName, dc.lastName));
    if (existingMatch) {
      // Same person already tracked — just link, don't duplicate.
      links[existingMatch.id] = dc.id;
      linkedCymIds.add(existingMatch.id);
      continue;
    }

    const newId = id('ctc');
    newContacts.push({
      id: newId,
      personaId,
      firstName: first,
      lastName: dc.lastName ?? undefined,
      email: dc.emails?.[0]?.email,
      phone: dc.phoneNumbers?.[0]?.number ?? undefined,
      company: dc.company ?? undefined,
      role: dc.jobTitle ?? undefined,
      birthday: birthdayMMDD(dc.birthday),
      category: 'other',
      importance: 1,
      cadenceDays: 90,
      source: 'import',
      createdAt: new Date().toISOString(),
    });
    links[newId] = dc.id;
    linkedCymIds.add(newId);
    imported += 1;
  }

  // --- export: app -> device ---
  let exported = 0;
  if (options.export) {
    for (const c of existing) {
      if (linkedCymIds.has(c.id)) continue; // already on the device
      try {
        const payload = {
          contactType: Contacts.ContactTypes.Person,
          name: [c.firstName, c.lastName].filter(Boolean).join(' '),
          firstName: c.firstName,
          lastName: c.lastName,
          company: c.company,
          jobTitle: c.role,
          emails: c.email ? [{ email: c.email, label: 'work', isPrimary: true }] : undefined,
          phoneNumbers: c.phone
            ? [{ number: c.phone, label: 'mobile', isPrimary: true }]
            : undefined,
        };
        const deviceId = await Contacts.addContactAsync(
          payload as unknown as Parameters<typeof Contacts.addContactAsync>[0],
        );
        if (deviceId) {
          links[c.id] = deviceId;
          exported += 1;
        }
      } catch {
        // Skip a contact the OS won't write (e.g. limited-access mode).
      }
    }
  }

  await saveDeviceLinks(links);
  return { newContacts, imported, exported };
}
