import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase } from '@/lib/supabase';

export type ConnectResult = 'connected' | 'error' | 'cancelled' | 'unavailable';

/**
 * Opens the Gmail OAuth flow in an in-app browser. The flow runs entirely
 * server-side (gmail-auth-start → Google → gmail-oauth-callback), so the client
 * secret never touches the device; we just carry the user's Supabase token in
 * and read the status back off the returning deep link.
 */
export async function connectGmail(): Promise<ConnectResult> {
  const supabase = getSupabase();
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabase || !base) return 'unavailable';

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'unavailable';

  const redirect = Linking.createURL('gmail-connected');
  const startUrl =
    `${base}/functions/v1/gmail-auth-start` +
    `?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`;

  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
  if (result.type !== 'success') return 'cancelled';

  const status = Linking.parse(result.url).queryParams?.status;
  return status === 'connected' ? 'connected' : 'error';
}

/** Trigger an immediate sync for the signed-in user; returns new interaction count. */
export async function syncGmailNow(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data, error } = await supabase.functions.invoke('gmail-sync', { body: {} });
  if (error) throw error;
  return (data as { newInteractions?: number } | null)?.newInteractions ?? 0;
}

export async function disconnectGmail(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.functions.invoke('gmail-sync', { body: { action: 'disconnect' } });
}
