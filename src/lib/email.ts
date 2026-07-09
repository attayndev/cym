import { getSupabase } from '@/lib/supabase';

/**
 * Multi-provider email connections. Gmail keeps its original module
 * (src/lib/gmail.ts); this adds generic IMAP — iCloud, Yahoo, Outlook, and
 * custom domains via app-specific passwords. No Microsoft OAuth, ever. All providers emit identical metadata-only
 * interaction rows server-side.
 */


export interface ImapPreset {
  key: 'icloud' | 'yahoo' | 'outlook' | 'custom';
  host: string;
  port: number;
}

export const IMAP_PRESETS: ImapPreset[] = [
  { key: 'icloud', host: 'imap.mail.me.com', port: 993 },
  { key: 'yahoo', host: 'imap.mail.yahoo.com', port: 993 },
  { key: 'outlook', host: 'outlook.office365.com', port: 993 },
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
  const fn = provider === 'gmail' ? 'gmail-sync' : 'imap-sync';
  await supabase.functions.invoke(fn, { body: { action: 'disconnect', email } });
}
