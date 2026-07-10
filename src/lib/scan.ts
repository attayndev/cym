import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

/**
 * Card/badge scan: ship the photo to the card-scan function, get structured
 * contact fields back. The heavy lifting (vision extraction) is server-side;
 * this module is just the wire format.
 */

export interface ScanFields {
  found: boolean;
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  city?: string;
  linkedin?: string;
}

export type ScanOutcome = ScanFields | 'limit' | 'error';

export async function scanCardImage(base64: string, mediaType: string): Promise<ScanOutcome> {
  const supabase = getSupabase();
  if (!supabase) return 'error';
  const { data, error } = await supabase.functions.invoke('card-scan', {
    body: { image: base64, mediaType },
  });
  if (error) {
    return error.message?.includes('429') ? 'limit' : 'error';
  }
  return (data as ScanFields) ?? 'error';
}

export type CameraScanOutcome =
  | { kind: 'fields'; fields: ScanFields }
  | { kind: 'canceled' }
  | { kind: 'needsUpdate' }
  | { kind: 'noPermission' }
  | { kind: 'limit' }
  | { kind: 'nothing' };

/** Open the camera (photo picker on web), scan, return fields. The camera
 *  module is native: binaries that predate it get needsUpdate, not a crash —
 *  the import stays lazy on purpose (runtime policy is appVersion). */
export async function runCardScan(): Promise<CameraScanOutcome> {
  let picker: typeof import('expo-image-picker');
  try {
    picker = await import('expo-image-picker');
  } catch {
    return { kind: 'needsUpdate' };
  }
  let result: import('expo-image-picker').ImagePickerResult;
  if (Platform.OS === 'web') {
    result = await picker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
  } else {
    const perm = await picker.requestCameraPermissionsAsync();
    if (!perm.granted) return { kind: 'noPermission' };
    result = await picker.launchCameraAsync({ base64: true, quality: 0.7 });
  }
  if (result.canceled || !result.assets?.[0]?.base64) return { kind: 'canceled' };
  const scan = await scanCardImage(
    result.assets[0].base64,
    result.assets[0].mimeType ?? 'image/jpeg',
  );
  if (scan === 'limit') return { kind: 'limit' };
  if (scan === 'error' || !scan.found) return { kind: 'nothing' };
  return { kind: 'fields', fields: scan };
}
