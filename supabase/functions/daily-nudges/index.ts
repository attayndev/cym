// Sends push notifications for the day's hook-driven moments — birthdays today
// and commitments due today — to each user's registered devices, in their
// language. Hook-driven only (never bare time-decay), matching the product's
// "a nudge with a hook is a gift" rule. Run on a daily cron with the service
// role, or hit it with a user JWT to test just yourself.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Locale = 'en' | 'es';
const COPY: Record<Locale, {
  birthday: (n: string) => string;
  commitment: (n: string) => string;
  multi: (c: number) => string;
  body: string;
}> = {
  en: {
    birthday: (n) => `It's ${n}'s birthday 🎂`,
    commitment: (n) => `You made ${n} a promise`,
    multi: (c) => `${c} reasons to reach out today`,
    body: 'Open Call Your Mom for a ready draft.',
  },
  es: {
    birthday: (n) => `Es el cumpleaños de ${n} 🎂`,
    commitment: (n) => `Le hiciste una promesa a ${n}`,
    multi: (c) => `${c} razones para escribir hoy`,
    body: 'Abre Call Your Mom para un borrador listo.',
  },
};

function todayMMDD(): string {
  const d = new Date();
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
}

async function messagesForUser(admin: SupabaseClient, userId: string): Promise<PushMessage[]> {
  const [{ data: profile }, { data: tokens }, { data: contacts }, { data: contexts }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('is_pro,notifications_enabled,locale')
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('push_tokens').select('token').eq('user_id', userId),
      admin.from('contacts').select('id,first_name,birthday').eq('user_id', userId),
      admin.from('contexts').select('contact_id,commitment,commitment_due_at').eq('user_id', userId),
    ]);

  if (!profile?.is_pro || !profile?.notifications_enabled) return [];
  if (!tokens || tokens.length === 0) return [];

  const loc: Locale = profile.locale === 'es' ? 'es' : 'en';
  const copy = COPY[loc];
  const mmdd = todayMMDD();
  const today = todayISO();

  const byId = new Map((contacts ?? []).map((c) => [c.id, c]));
  const reasons: { type: 'birthday' | 'commitment'; name: string }[] = [];

  for (const c of contacts ?? []) {
    if (c.birthday === mmdd) reasons.push({ type: 'birthday', name: c.first_name });
  }
  for (const x of contexts ?? []) {
    if (x.commitment && x.commitment_due_at && String(x.commitment_due_at).slice(0, 10) === today) {
      const c = byId.get(x.contact_id);
      if (c) reasons.push({ type: 'commitment', name: c.first_name });
    }
  }

  if (reasons.length === 0) return [];

  let title: string;
  if (reasons.length === 1) {
    const r = reasons[0];
    title = r.type === 'birthday' ? copy.birthday(r.name) : copy.commitment(r.name);
  } else {
    title = copy.multi(reasons.length);
  }

  return tokens.map((t) => ({ to: t.token, title, body: copy.body, sound: 'default' }));
}

async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');

  let userIds: string[] = [];
  if (jwt && jwt !== SERVICE_KEY) {
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }
    userIds = [data.user.id];
  } else {
    const { data } = await admin.from('push_tokens').select('user_id');
    userIds = [...new Set((data ?? []).map((r) => r.user_id))];
  }

  const messages: PushMessage[] = [];
  for (const uid of userIds) {
    try {
      messages.push(...(await messagesForUser(admin, uid)));
    } catch {
      // skip a failing user; the rest still get notified
    }
  }
  await sendExpoPush(messages);

  return new Response(JSON.stringify({ users: userIds.length, sent: messages.length }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
