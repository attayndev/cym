import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase } from '@/lib/supabase';

/**
 * Multi-provider email connections. Gmail keeps its original module
 * (src/lib/gmail.ts); this adds Outlook (Microsoft Graph OAuth — covers
 * Hotmail/Live/MSN/365) and generic IMAP (iCloud, Yahoo, custom domains via
 * app-specific passwords). All providers emit identical metadata-only
 * interaction rows server-side.
 */

export type ConnectResult = 'connected' | 'error' | 'cancelled' | 'unavailable';

export async function connectOutlook(): Promise<ConnectResult> {
  const supabase = getSupabase();
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabase || !base) return 'unavailable';
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'unavailable';

  const redirect = Linking.createURL('outlook-connected');
  const startUrl =
    `${base}/functions/v1/outlook-auth-start` +
    `?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`;
  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
  if (result.type !== 'success') return 'cancelled';
  const status = Linking.parse(result.url).queryParams?.status;
  return status === 'connected' ? 'connected' : 'error';
}

export interface ImapPreset {
  key: 'icloud' | 'yahoo' | 'custom';
  host: string;
  port: number;
}

export const IMAP_PRESETS: ImapPreset[] = [
  { key: 'icloud', host: 'imap.mail.me.com', port: 993 },
  { key: 'yahoo', host: 'imap.mail.yahoo.com', port: 993 },
  { key: 'custom', host: '', port: 993 },
];

export async function connectImap(input: {
  email: string;
  password: string;
  host: string;
  port?: number;
}): Promise<'connected' | 'login_failed' | 'error'> {
  const supabase = getSupabase();
  if (!supabase) return 'error';
  const { data, error } = await supabase.functions.invoke('imap-sync', {
    body: { action: 'connect', ...input },
  });
  if (!error && (data as { connected?: boolean })?.connected) return 'connected';
  return error?.message?.includes('400') ? 'login_failed' : 'login_failed';
}

/** Sync every connected provider; returns total new interactions. */
export async function syncAllEmail(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const results = await Promise.allSettled([
    supabase.functions.invoke('gmail-sync', { body: {} }),
    supabase.functions.invoke('outlook-sync', { body: {} }),
    supabase.functions.invoke('imap-sync', { body: {} }),
  ]);
  let total = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && !r.value.error) {
      total += (r.value.data as { newInteractions?: number })?.newInteractions ?? 0;
    }
  }
  return total;
}

export async function disconnectEmail(provider: string, email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const fn = provider === 'gmail' ? 'gmail-sync' : provider === 'outlook' ? 'outlook-sync' : 'imap-sync';
  await supabase.functions.invoke(fn, { body: { action: 'disconnect', email } });
}
