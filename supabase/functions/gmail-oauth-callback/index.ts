// Google redirects here with an authorization code. We exchange it (using the
// client secret, which only lives server-side) for access + refresh tokens,
// store them in the locked-down gmail_credentials table, mark the connected
// account, then deep-link back into the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { isAllowedRedirect, verifyState } from '../_shared/oauth-state.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const REDIRECT_URI = Deno.env.get('GMAIL_REDIRECT_URL')!;
const STATE_SECRET = Deno.env.get('OAUTH_STATE_SECRET') || SERVICE_KEY;
// Where to send the browser when state carries no (or a rejected) redirect.
const FALLBACK_REDIRECT = 'https://getcym.app/gmail-connected';

function back(redirect: string, status: string): Response {
  const target = isAllowedRedirect(redirect) && redirect ? redirect : FALLBACK_REDIRECT;
  const sep = target.includes('?') ? '&' : '?';
  return Response.redirect(`${target}${sep}status=${status}`, 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  // Reject forged/expired state: an unsigned uid here would let an attacker
  // write their own Gmail tokens under a victim's account.
  const state = await verifyState(stateRaw ?? '', STATE_SECRET);
  if (!state) return new Response('bad state', { status: 400 });
  const uid = state.uid;
  const appRedirect = state.redirect;

  if (oauthError || !code) return back(appRedirect, 'error');

  // Exchange the code for tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tok = await tokenRes.json();
  if (!tok.access_token) return back(appRedirect, 'error');

  // Which mailbox did they connect?
  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  const info = await userinfoRes.json();
  const email: string = info.email ?? '';

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const expiry = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();

  // refresh_token only comes back on first consent; don't overwrite it with null.
  const cred: Record<string, unknown> = {
    user_id: uid,
    email,
    access_token: tok.access_token,
    expiry,
    scope: tok.scope,
  };
  if (tok.refresh_token) cred.refresh_token = tok.refresh_token;

  await admin.from('gmail_credentials').upsert(cred, { onConflict: 'user_id,email' });
  // One row per (user, email) so multiple inboxes keep independent status
  // and sync/backfill bookmarks.
  await admin.from('connected_accounts').upsert({
    id: `gmail_${uid}_${email}`,
    user_id: uid,
    provider: 'gmail',
    email,
    status: 'connected',
  });

  return back(appRedirect, 'connected');
});
