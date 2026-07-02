// Starts the Gmail OAuth flow. The app opens this URL in an in-app browser with
// the user's Supabase access token; we verify it, then redirect to Google's
// consent screen requesting offline access to gmail.metadata (timestamps and
// participants only — never message bodies).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const REDIRECT_URI = Deno.env.get('GMAIL_REDIRECT_URL')!; // the gmail-oauth-callback URL

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.metadata',
].join(' ');

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const appRedirect = url.searchParams.get('redirect') ?? '';
  if (!token) return new Response('missing token', { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return new Response('unauthorized', { status: 401 });

  // State carries who is connecting and where to return. (Hardening TODO: sign it.)
  const state = btoa(JSON.stringify({ uid: data.user.id, redirect: appRedirect }));

  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  auth.searchParams.set('redirect_uri', REDIRECT_URI);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', SCOPES);
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  auth.searchParams.set('state', state);

  return Response.redirect(auth.toString(), 302);
});
