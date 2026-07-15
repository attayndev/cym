// Beta pulse for the founder: account metadata + aggregate counts ONLY.
// PRIVACY IS THE SPEC — this endpoint must never return contact names,
// notes, drafts, memory content, or any other user-generated text. If you
// are adding a field, ask "is this a number/date/boolean, or could it leak
// someone's actual relationships/words?" before adding it to the response.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

interface UserStats {
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  contactsActive: number;
  contactsTotal: number;
  interactions: number;
  nudgesActed: number;
  inboxes: number;
  isPro: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!jwt || jwt === SERVICE_KEY) return json({ error: 'unauthorized' }, 401);

  // A single service-role client does double duty here: auth.getUser(jwt)
  // verifies the caller's token (same pattern as delete-account/drafts),
  // and the rest of the calls use the elevated role to read across users —
  // that's the whole point of an admin endpoint.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: caller, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !caller.user) return json({ error: 'unauthorized' }, 401);

  // Allowlist fails CLOSED: an unset/empty ADMIN_EMAILS locks everyone out,
  // including a caller with a perfectly valid session.
  const admins = (Deno.env.get('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const callerEmail = (caller.user.email ?? '').toLowerCase();
  if (!admins.length || !callerEmail || !admins.includes(callerEmail)) {
    return json({ error: 'forbidden' }, 403);
  }

  // ≤200 users is fine for beta scale with one Promise.all per user below.
  // TODO: once users outgrow this, replace the per-user round trips with a
  // single grouped SQL function (e.g. a `select user_id, count(*) ... group
  // by user_id` RPC) instead of listUsers + N parallel count queries.
  const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError || !listData) return json({ error: 'failed' }, 500);

  const users: UserStats[] = await Promise.all(
    listData.users.map(async (u): Promise<UserStats> => {
      const [
        contactsActiveRes,
        contactsTotalRes,
        interactionsRes,
        nudgesActedRes,
        inboxesRes,
        profileRes,
      ] = await Promise.all([
        admin
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', u.id)
          .neq('status', 'archived'),
        admin.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', u.id),
        admin
          .from('interactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', u.id),
        admin
          .from('nudges')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', u.id)
          .eq('state', 'acted'),
        admin
          .from('connected_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', u.id),
        admin.from('profiles').select('is_pro').eq('user_id', u.id).maybeSingle(),
      ]);

      return {
        email: u.email ?? '',
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        contactsActive: contactsActiveRes.count ?? 0,
        contactsTotal: contactsTotalRes.count ?? 0,
        interactions: interactionsRes.count ?? 0,
        nudgesActed: nudgesActedRes.count ?? 0,
        inboxes: inboxesRes.count ?? 0,
        isPro: Boolean(profileRes.data?.is_pro),
      };
    }),
  );

  users.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const totals = {
    users: users.length,
    contacts: users.reduce((sum, u) => sum + u.contactsActive, 0),
    interactions: users.reduce((sum, u) => sum + u.interactions, 0),
  };

  return json({ generatedAt: new Date().toISOString(), totals, users });
});
