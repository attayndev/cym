import { getSupabase } from '@/lib/supabase';

/** Permanently deletes the signed-in user's account server-side (auth user +
 *  every cascaded row). Caller handles signOut + local reset afterwards. */
export async function deleteAccount(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  return !error && (data as { deleted?: boolean } | null)?.deleted === true;
}
