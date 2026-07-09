// RevenueCat webhook: keeps profiles.is_pro honest for entitlement changes
// that happen while the app is closed (renewals, expirations, refunds).
// Auth: RevenueCat sends the Authorization header configured in its dashboard;
// it must match the REVENUECAT_WEBHOOK_SECRET function secret exactly
// (an optional "Bearer " prefix is tolerated on either side).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';

// Event types that mean the entitlement is (still) active vs. gone. Types not
// listed (CANCELLATION = auto-renew off but paid until expiry, BILLING_ISSUE,
// TEST, TRANSFER, …) deliberately change nothing.
const ACTIVATES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
]);
const DEACTIVATES = new Set(['EXPIRATION']);

const strip = (s: string) => s.replace(/^Bearer\s+/i, '').trim();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const auth = strip(req.headers.get('Authorization') ?? '');
  if (!SECRET || auth !== strip(SECRET)) {
    return new Response('unauthorized', { status: 401 });
  }

  let event: { type?: string; app_user_id?: string } = {};
  try {
    event = (await req.json())?.event ?? {};
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const { type, app_user_id: userId } = event;
  if (!type || !userId) return new Response('ignored', { status: 200 });

  // app_user_id is the Supabase auth user id (set at Purchases.configure).
  // RevenueCat anonymous ids ($RCAnonymousID:…) can't be mapped — ignore them.
  if (userId.startsWith('$RCAnonymousID')) return new Response('ignored', { status: 200 });

  const isPro = ACTIVATES.has(type) ? true : DEACTIVATES.has(type) ? false : null;
  if (isPro === null) return new Response('ignored', { status: 200 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await admin.from('profiles').update({ is_pro: isPro }).eq('user_id', userId);
  if (error) {
    // Non-200 makes RevenueCat retry with backoff — desired for transient failures.
    return new Response(`update failed: ${error.message}`, { status: 500 });
  }
  return new Response('ok', { status: 200 });
});
