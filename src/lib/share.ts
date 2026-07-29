import { getSupabase } from '@/lib/supabase';

/**
 * QR share links + reciprocal exchange, all RLS-scoped to the signed-in user.
 * These tables deliberately live OUTSIDE the whole-graph sync (like connected
 * accounts): tokens are minted by Postgres, submissions by the share-card
 * function, and the app just reads them on demand. Everything here no-ops
 * when Supabase isn't configured or nobody is signed in — the card tab then
 * falls back to the offline vCard QR.
 */

export type SubmissionStatus = 'pending' | 'accepted' | 'dismissed';

export interface ExchangeSubmission {
  id: string;
  personaId?: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  note?: string;
  birthday?: string;
  status: SubmissionStatus;
  createdAt: string;
}

export function shareBaseUrl(): string | null {
  return process.env.EXPO_PUBLIC_SHARE_BASE_URL || null;
}

export function buildShareUrl(token: string): string | null {
  const base = shareBaseUrl();
  return base ? `${base.replace(/\/$/, '')}/c/${token}` : null;
}

/** URL for the wallet-pass function: redirects to Google Wallet, or streams a
 *  .pkpass for Apple Wallet. Same EXPO_PUBLIC_SUPABASE_URL base as the other
 *  function calls (gmail-auth-start, share-card's landing page). */
export function buildWalletPassUrl(token: string, type: 'google' | 'apple'): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/functions/v1/wallet-pass?token=${encodeURIComponent(token)}&type=${type}`;
}

/** The persona's share token, minted server-side on first use. */
export async function getOrCreateShareToken(personaId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !personaId) return null;
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return null;

  const { data: existing } = await supabase
    .from('share_tokens')
    .select('token')
    .eq('persona_id', personaId)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const { data: created } = await supabase
    .from('share_tokens')
    .insert({ user_id: userId, persona_id: personaId })
    .select('token')
    .maybeSingle();
  return created?.token ?? null;
}

/** Revoke the persona's current link and mint a fresh one. */
export async function rotateShareToken(personaId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !personaId) return null;
  await supabase.from('share_tokens').delete().eq('persona_id', personaId);
  return getOrCreateShareToken(personaId);
}

/**
 * Every submission the user has ever received, newest first — the Inbox tab
 * buckets them by status itself. Capped because history only grows: 200 is
 * far past what anyone scrolls, and the pending queue is never near it.
 */
export async function listSubmissions(): Promise<ExchangeSubmission[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from('exchange_submissions')
    .select(
      'id, persona_id, first_name, last_name, email, phone, company, role, note, birthday, status, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => ({
    id: r.id,
    personaId: r.persona_id ?? undefined,
    firstName: r.first_name,
    lastName: r.last_name ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    company: r.company ?? undefined,
    role: r.role ?? undefined,
    note: r.note ?? undefined,
    birthday: r.birthday ?? undefined,
    status: r.status as SubmissionStatus,
    createdAt: r.created_at,
  }));
}

/** Just the badge number — no rows over the wire. */
export async function countPendingSubmissions(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('exchange_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

/** 'pending' is the un-dismiss path — the status check constraint allows it. */
export async function markSubmission(id: string, status: SubmissionStatus): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('exchange_submissions').update({ status }).eq('id', id);
}
