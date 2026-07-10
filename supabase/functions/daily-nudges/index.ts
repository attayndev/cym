// Sends push notifications for the day's hook-driven moments — birthdays today
// and commitments due today — to each user's registered devices, in their
// language. Hook-driven only (never bare time-decay), matching the product's
// "a nudge with a hook is a gift" rule. Run on a daily cron with the service
// role, or hit it with a user JWT to test just yourself.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// The hourly cron authenticates with this header; without it, only the
// single-user JWT test path is available.
const CRON_SECRET = Deno.env.get('CRON_SECRET');

// The local hour when pushes land (per user timezone).
const SEND_HOUR = 9;

/** Today's date parts in an IANA timezone (UTC fallback on bad tz). */
function localParts(tz: string | null | undefined): { mmdd: string; iso: string; hour: number } {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
    return {
      mmdd: `${parts.month}-${parts.day}`,
      iso: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour) % 24,
    };
  } catch {
    const d = new Date();
    return {
      mmdd: `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
      iso: d.toISOString().slice(0, 10),
      hour: d.getUTCHours(),
    };
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Locale = 'en' | 'es';
const COPY: Record<Locale, {
  birthday: (n: string) => string;
  commitment: (n: string) => string;
  multi: (c: number) => string;
  deck: (c: number) => string;
  body: string;
  deckBody: string;
}> = {
  en: {
    birthday: (n) => `It's ${n}'s birthday 🎂`,
    commitment: (n) => `You made ${n} a promise`,
    multi: (c) => `${c} reasons to reach out today`,
    deck: (c) => `Your ${c} for today`,
    body: 'The note is already half-written — just add you.',
    deckBody: 'A few minutes keeps them warm.',
  },
  es: {
    birthday: (n) => `Es el cumpleaños de ${n} 🎂`,
    commitment: (n) => `Le hiciste una promesa a ${n}`,
    multi: (c) => `${c} razones para escribir hoy`,
    deck: (c) => `Tus ${c} de hoy`,
    body: 'La nota ya está medio escrita — solo faltas tú.',
    deckBody: 'Unos minutos y siguen cerca.',
  },
};

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
}

async function messagesForUser(
  admin: SupabaseClient,
  userId: string,
  gateOnLocalHour: boolean,
): Promise<PushMessage[]> {
  const [{ data: profile }, { data: tokens }, { data: contacts }, { data: contexts }, pending] =
    await Promise.all([
      admin
        .from('profiles')
        .select('is_pro,notifications_enabled,locale,timezone')
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('push_tokens').select('token').eq('user_id', userId),
      admin.from('contacts').select('id,first_name,birthday,status,kind,evaluated_at,source').eq('user_id', userId),
      admin.from('contexts').select('contact_id,commitment,commitment_due_at').eq('user_id', userId),
      admin
        .from('nudges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('state', 'pending'),
    ]);

  if (!profile?.notifications_enabled) return [];
  if (!tokens || tokens.length === 0) return [];

  // The user's OWN today, and their local hour — pushes land at SEND_HOUR
  // local instead of whenever UTC's date happens to flip.
  const local = localParts(profile.timezone);
  if (gateOnLocalHour && local.hour !== SEND_HOUR) return [];

  const loc: Locale = profile.locale === 'es' ? 'es' : 'en';
  const copy = COPY[loc];
  const mmdd = local.mmdd;
  const today = local.iso;

  let live = (contacts ?? []).filter((c) => c.status !== 'archived' && c.kind !== 'business');
  // Free tier: only the deliberately tracked warm list gets server pushes.
  if (!profile.is_pro) {
    live = live.filter((c) => c.evaluated_at || c.source !== 'import');
  }
  const byId = new Map(live.map((c) => [c.id, c]));
  const reasons: { type: 'birthday' | 'commitment'; name: string }[] = [];

  for (const c of live) {
    if (c.birthday === mmdd) reasons.push({ type: 'birthday', name: c.first_name });
  }
  for (const x of contexts ?? []) {
    if (x.commitment && x.commitment_due_at && String(x.commitment_due_at).slice(0, 10) === today) {
      const c = byId.get(x.contact_id);
      if (c) reasons.push({ type: 'commitment', name: c.first_name });
    }
  }

  // Hooks lead ("a nudge with a hook is a gift"); with no hook today, the
  // deck digest invites the daily ritual — but only when the deck has cards.
  const deckCount = Math.min(pending.count ?? 0, 10);

  let title: string;
  let body: string;
  if (reasons.length === 1) {
    const r = reasons[0];
    title = r.type === 'birthday' ? copy.birthday(r.name) : copy.commitment(r.name);
    body = copy.body;
  } else if (reasons.length > 1) {
    title = copy.multi(reasons.length);
    body = copy.body;
  } else if (deckCount > 0) {
    title = copy.deck(deckCount);
    body = copy.deckBody;
  } else {
    return [];
  }

  return tokens.map((t) => ({ to: t.token, title, body, sound: 'default' }));
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
  const cronOk =
    (CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET) || jwt === SERVICE_KEY;

  let userIds: string[] = [];
  let gateOnLocalHour = true;
  if (jwt && jwt !== SERVICE_KEY) {
    const { data } = await admin.auth.getUser(jwt);
    if (!data.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }
    userIds = [data.user.id];
    gateOnLocalHour = false; // self-test path sends immediately
  } else if (cronOk) {
    const { data } = await admin.from('push_tokens').select('user_id');
    userIds = [...new Set((data ?? []).map((r) => r.user_id))];
  } else {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const messages: PushMessage[] = [];
  for (const uid of userIds) {
    try {
      messages.push(...(await messagesForUser(admin, uid, gateOnLocalHour)));
    } catch {
      // skip a failing user; the rest still get notified
    }
  }
  await sendExpoPush(messages);

  return new Response(JSON.stringify({ users: userIds.length, sent: messages.length }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
