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
