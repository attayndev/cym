// SDK 56 moved the functional API to the legacy entry point; migrating to the
// new class-based API is on the roadmap (see FEATURES.md).
import * as Contacts from 'expo-contacts/legacy';
import { Platform } from 'react-native';

import { classifyContact } from '@/lib/classify';
import { diag } from '@/lib/log';
import { id } from '@/lib/ids';
import { loadArchiveTombstones, loadDeviceLinks, saveDeviceLinks } from '@/lib/store';
import type { Contact } from '@/lib/types';

export interface SyncResult {
  /** New Call Your Mom contacts created from the device (caller adds these to the DB). */
  newContacts: Contact[];
  /** Additive patches for already-linked contacts (extra emails/phones found
   *  on the device card — the fuel for Gmail matching). */
  patches: ContactAltPatch[];
  imported: number;
  exported: number;
  /** How many contacts the OS actually let us read — the diagnostic for
   *  "my phone has 10k contacts but CYM only sees 1k" (limited-access mode
   *  or accounts not syncing contacts to the device). */
  deviceTotal: number;
  /** iOS 18+: 'all' | 'limited'; undefined where the OS doesn't say. */
  access?: string;
}

export interface ContactAltPatch {
  id: string;
  email?: string;
  altEmails?: string[];
  altPhones?: string[];
}

const digits = (s: string) => s.replace(/\D/g, '');

/** Extra device emails/phones the CYM contact doesn't know yet (additive). */
function altPatch(
  cym: Contact,
  deviceEmails: string[],
  devicePhones: string[],
): ContactAltPatch | null {
  const knownEmails = new Set(
    [cym.email, ...(cym.altEmails ?? [])].filter(Boolean).map((e) => e!.toLowerCase()),
  );
  const knownPhones = new Set(
    [cym.phone, ...(cym.altPhones ?? [])].filter(Boolean).map((p) => digits(p!)),
  );
  const freshEmails = [...new Set(deviceEmails.map((e) => e.toLowerCase()))].filter(
    (e) => !knownEmails.has(e),
  );
  const freshPhones = devicePhones.filter((p) => p && !knownPhones.has(digits(p)));
  if (freshEmails.length === 0 && freshPhones.length === 0) return null;

  const patch: ContactAltPatch = { id: cym.id };
  let emails = freshEmails;
  if (!cym.email && emails.length > 0) {
    patch.email = emails[0];
    emails = emails.slice(1);
  }
  if (emails.length > 0) patch.altEmails = [...(cym.altEmails ?? []), ...emails];
  if (freshPhones.length > 0) patch.altPhones = [...(cym.altPhones ?? []), ...freshPhones];
  return patch;
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

async function ensurePermission(): Promise<{ granted: boolean; access?: string }> {
  if (Platform.OS === 'web') return { granted: false };
  const perm = await Contacts.requestPermissionsAsync();
  return {
    granted: perm.status === 'granted',
    access: (perm as { accessPrivileges?: string }).accessPrivileges,
  };
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
  const perm = await ensurePermission();
  if (!perm.granted) {
    return { newContacts: [], patches: [], imported: 0, exported: 0, deviceTotal: 0 };
  }

  const links = await loadDeviceLinks();
  const tombstones = await loadArchiveTombstones();
  // Self-heal: drop links whose app contact no longer exists (data reset,
  // account deletion) — otherwise their device contacts stay "already
  // imported" forever and every future import comes back empty.
  const existingIds = new Set(existing.map((c) => c.id));
  for (const cymId of Object.keys(links)) {
    if (!existingIds.has(cymId)) delete links[cymId];
  }
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
  const newThisRun = new Set<string>();
  const patches: ContactAltPatch[] = [];
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const cymByDeviceId = new Map(Object.entries(links).map(([cymId, devId]) => [devId, cymId]));
  let imported = 0;
  for (const dc of deviceContacts) {
    if (!dc.id) continue;
    // Archived/removed people stay gone — even when the graph forgot them.
    if (tombstones.has(dc.id)) continue;
    const deviceEmails = (dc.emails ?? []).map((e) => e.email).filter(Boolean) as string[];
    const devicePhones = (dc.phoneNumbers ?? []).map((p) => p.number).filter(Boolean) as string[];

    if (linkedDeviceIds.has(dc.id)) {
      // Already linked: harvest any addresses/numbers CYM doesn't know yet.
      const cym = existingById.get(cymByDeviceId.get(dc.id) ?? '');
      if (cym) {
        const patch = altPatch(cym, deviceEmails, devicePhones);
        if (patch) patches.push(patch);
      }
      continue;
    }
    const first = dc.firstName ?? dc.name;
    if (!first) continue;

    // Match against pre-existing contacts AND ones created earlier in this
    // run — the device API returns one row per account (iCloud + Google both
    // return their copy of the same person), so a single import can see the
    // same name twice.
    const nameKey = normName(dc.firstName, dc.lastName);
    const existingMatch = existingByName.get(nameKey);
    if (existingMatch) {
      // Same person already tracked — just link, don't duplicate.
      links[existingMatch.id] = dc.id;
      linkedCymIds.add(existingMatch.id);
      const patch = altPatch(existingMatch, deviceEmails, devicePhones);
      if (patch) {
        if (newThisRun.has(existingMatch.id)) {
          // Created moments ago in this loop — merge in place.
          Object.assign(existingMatch, patch);
        } else {
          patches.push(patch);
        }
      }
      continue;
    }

    const newId = id('ctc');
    const fields = {
      firstName: first,
      lastName: dc.lastName ?? undefined,
      email: deviceEmails[0],
      company: dc.company ?? undefined,
    };
    newContacts.push({
      id: newId,
      personaId,
      ...fields,
      phone: devicePhones[0],
      altEmails: deviceEmails.length > 1 ? [...new Set(deviceEmails.slice(1))] : undefined,
      altPhones: devicePhones.length > 1 ? devicePhones.slice(1) : undefined,
      role: dc.jobTitle ?? undefined,
      birthday: birthdayMMDD(dc.birthday),
      category: 'other',
      importance: 1,
      cadenceDays: 90,
      source: 'import',
      createdAt: new Date().toISOString(),
      kind: classifyContact(fields),
      status: 'active',
    });
    links[newId] = dc.id;
    linkedCymIds.add(newId);
    newThisRun.add(newId);
    existingByName.set(nameKey, newContacts[newContacts.length - 1]);
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
  diag('device-sync', { deviceTotal: deviceContacts.length, imported, patched: patches.length, exported });
  return {
    newContacts,
    patches,
    imported,
    exported,
    deviceTotal: deviceContacts.length,
    access: perm.access,
  };
}

/**
 * "Update Contacts": push CYM-captured directory facts into the LINKED device
 * contacts. Strictly additive — only fills fields the device contact is
 * missing, never overwrites or deletes device data — and only directory
 * facts travel (email, phone, company, role, birthday). CYM-private context
 * (why they matter, commitments, notes) never leaves the app.
 * Returns how many device contacts were updated.
 */
export async function updateDeviceContacts(existing: Contact[]): Promise<number> {
  if (!(await ensurePermission()).granted) return 0;
  const links = await loadDeviceLinks();
  let updated = 0;

  for (const c of existing) {
    if (c.status === 'archived' || c.kind === 'business') continue;
    const deviceId = links[c.id];
    if (!deviceId) continue;
    try {
      const dc = await Contacts.getContactByIdAsync(deviceId, READ_FIELDS);
      if (!dc) continue;

      const patch: Record<string, unknown> = {};
      if (c.email && !(dc.emails ?? []).some((e) => e.email?.toLowerCase() === c.email!.toLowerCase())) {
        patch.emails = [...(dc.emails ?? []), { email: c.email, label: 'other' }];
      }
      const digits = (s: string) => s.replace(/\D/g, '');
      if (
        c.phone &&
        !(dc.phoneNumbers ?? []).some((p) => digits(p.number ?? '') === digits(c.phone!))
      ) {
        patch.phoneNumbers = [...(dc.phoneNumbers ?? []), { number: c.phone, label: 'other' }];
      }
      if (c.company && !dc.company) patch.company = c.company;
      if (c.role && !dc.jobTitle) patch.jobTitle = c.role;
      if (c.birthday && !dc.birthday) {
        const [mm, dd] = c.birthday.split('-').map(Number);
        if (mm && dd) patch.birthday = { month: mm - 1, day: dd, format: 'gregorian' };
      }

      if (Object.keys(patch).length === 0) continue;
      await Contacts.updateContactAsync({
        ...dc,
        ...patch,
        id: deviceId,
      } as unknown as Parameters<typeof Contacts.updateContactAsync>[0]);
      updated += 1;
    } catch {
      // Skip contacts the OS won't update (limited access, deleted on device).
    }
  }
  return updated;
}
