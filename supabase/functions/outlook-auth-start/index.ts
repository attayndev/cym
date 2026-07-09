// Outlook/Hotmail/Microsoft 365 OAuth kickoff — mirrors gmail-auth-start.
// The app opens this with the user's Supabase JWT; we stash it in state and
// bounce to Microsoft's consent page. Mail.Read is read-only.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID');
const REDIRECT_URI = Deno.env.get('OUTLOOK_REDIRECT_URL');

const SCOPES = 'offline_access User.Read Mail.Read';

Deno.serve(async (req) => {
  if (!MS_CLIENT_ID || !REDIRECT_URI) {
    return new Response('Outlook connect is not configured yet.', { status: 503 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const appRedirect = url.searchParams.get('redirect') ?? '';

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return new Response('unauthorized', { status: 401 });

  const state = btoa(JSON.stringify({ uid: data.user.id, appRedirect }));
  const auth = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  auth.searchParams.set('client_id', MS_CLIENT_ID);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('redirect_uri', REDIRECT_URI);
  auth.searchParams.set('response_mode', 'query');
  auth.searchParams.set('scope', SCOPES);
  auth.searchParams.set('prompt', 'select_account');
  auth.searchParams.set('state', state);
  return Response.redirect(auth.toString(), 302);
});
