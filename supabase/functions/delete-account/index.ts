// Permanently deletes the calling user's account. User JWT ONLY — anonymous
// calls and the service key are rejected; possession of a valid session plus
// the typed confirmation in the app is the authorization (no password reauth
// exists for Apple/Google users). Every table references auth.users(id) with
// ON DELETE CASCADE, so deleting the auth user removes the whole graph.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!jwt || jwt === SERVICE_KEY) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await admin.auth.getUser(jwt);
  if (!data.user) return json({ error: 'unauthorized' }, 401);

  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) return json({ error: 'failed' }, 500);

  return json({ deleted: true });
});
