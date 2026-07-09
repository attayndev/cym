// Microsoft OAuth callback: exchange the code, resolve the mailbox address,
// store tokens (service-role-only table), mark the account connected, and
// deep-link back into the app. Mirrors gmail-oauth-callback.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID')!;
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET')!;
const REDIRECT_URI = Deno.env.get('OUTLOOK_REDIRECT_URL')!;

function back(appRedirect: string, status: string): Response {
  const sep = appRedirect.includes('?') ? '&' : '?';
  return Response.redirect(`${appRedirect}${sep}status=${status}`, 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  let uid = '';
  let appRedirect = '';
  try {
    const state = JSON.parse(atob(url.searchParams.get('state') ?? ''));
    uid = state.uid;
    appRedirect = state.appRedirect;
  } catch {
    return new Response('bad state', { status: 400 });
  }
  if (!code || !uid || !appRedirect) return back(appRedirect || '/', 'error');

  const tokRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!tokRes.ok) return back(appRedirect, 'error');
  const tok = await tokRes.json();

  const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  if (!meRes.ok) return back(appRedirect, 'error');
  const me = await meRes.json();
  const email = String(me.mail ?? me.userPrincipalName ?? '').toLowerCase();
  if (!email) return back(appRedirect, 'error');

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const cred: Record<string, unknown> = {
    user_id: uid,
    email,
    access_token: tok.access_token,
    expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (tok.refresh_token) cred.refresh_token = tok.refresh_token;
  await admin.from('outlook_credentials').upsert(cred, { onConflict: 'user_id,email' });
  await admin.from('connected_accounts').upsert({
    id: `outlook_${uid}_${email}`,
    user_id: uid,
    provider: 'outlook',
    email,
    status: 'connected',
  });
  return back(appRedirect, 'connected');
});
