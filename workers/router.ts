/**
 * Edge router for getcym.app (the marketing site). Static assets serve
 * everything except /c/<token>, which gets share.html with per-token Open
 * Graph tags injected — so a texted link previews as "«Name» — Call Your Mom"
 * instead of a generic shell. getcym.com 301s here.
 */

interface Env {
  ASSETS: Fetcher;
  SHARE_CARD_URL: string;
  WAITLIST_URL: string;
  ATTRIBUTION_URL: string;
}

interface SharedCard {
  name?: string;
  tagline?: string | null;
  role?: string | null;
  company?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchCard(env: Env, token: string): Promise<SharedCard | null> {
  try {
    const res = await fetch(`${env.SHARE_CARD_URL}?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SharedCard;
  } catch {
    return null;
  }
}

const BETA_PASSWORD = 'yourmamma';
const BETA_COOKIE = 'cym_beta=granted';

function betaGatePage(wrong: boolean): Response {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Beta — Call Your Mom</title><meta name="robots" content="noindex">
<style>
body{font-family:Karla,-apple-system,sans-serif;background:#FFF7E8;color:#3B241C;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:22px}
.box{max-width:380px;width:100%;text-align:center}
h1{font-family:Georgia,serif;font-size:34px;margin:0 0 8px}
p{color:rgba(59,36,28,.85);margin:0 0 18px}
form{display:flex;gap:10px}
input{flex:1;font-size:16px;padding:13px 14px;border:2px solid #3B241C;border-radius:12px;background:#fff;color:#3B241C}
button{font-weight:700;font-size:15px;padding:13px 20px;border-radius:12px;border:2px solid #3B241C;background:#D9331F;color:#FFF7E8;box-shadow:3px 3px 0 #3B241C}
.err{color:#B3260F;font-weight:700;font-size:14px;margin-top:12px}
</style></head><body><div class="box">
<h1>Testers only</h1>
<p>This is the Call Your Mom private beta. Enter the password from your invite.</p>
<form method="POST" action="/beta">
<input type="password" name="password" placeholder="Password" autofocus autocomplete="off">
<button type="submit">Enter</button>
</form>
${wrong ? '<p class="err">That&#39;s not it — check your invite.</p>' : ''}
</div></body></html>`;
  return new Response(html, {
    status: 401,
    headers: { 'content-type': 'text/html;charset=utf-8' },
  });
}

const REF_RE = /^[A-Za-z0-9_-]{2,32}$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Referral/affiliate landing (?ref=CODE): log the click server-side and
    // hand the visitor a 30-day cookie scoped to .getcym.app so the web app
    // can prefill "who sent you" at signup. Attribution truth stays the code
    // typed at onboarding — this is assist + stats, not the source of record.
    const ref = url.searchParams.get('ref')?.trim().toUpperCase();
    if (ref && REF_RE.test(ref) && request.method === 'GET') {
      ctx.waitUntil(
        fetch(env.ATTRIBUTION_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cym-ip': request.headers.get('cf-connecting-ip') ?? '' },
          body: JSON.stringify({
            action: 'click',
            code: ref,
            landing: url.pathname,
            userAgent: request.headers.get('user-agent') ?? '',
          }),
        }).catch(() => {}),
      );
      const resp = await this.route(request, env);
      const out = new Response(resp.body, resp);
      out.headers.append(
        'set-cookie',
        `cym_ref=${ref}; Domain=.getcym.app; Path=/; Max-Age=2592000; Secure; SameSite=Lax`,
      );
      return out;
    }
    return this.route(request, env);
  },

  async route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // getcym.com is an alias; getcym.app is canonical.
    if (url.hostname.endsWith('getcym.com')) {
      url.hostname = 'getcym.app';
      return Response.redirect(url.toString(), 301);
    }

    // Same-origin waitlist capture, proxied to the rate-limited edge function
    // (the client IP travels along so the per-IP limit sees real addresses).
    if (url.pathname === '/api/waitlist' && request.method === 'POST') {
      return fetch(env.WAITLIST_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-real-ip': request.headers.get('cf-connecting-ip') ?? '',
        },
        body: await request.text(),
      });
    }

    // /beta is testers-only: a shared password keeps drive-by visitors off
    // the install page. manifest.plist stays open on purpose — iOS fetches it
    // cookie-less during the itms-services install, and the ad-hoc
    // provisioning profile is the real gate (the build only installs on
    // registered devices).
    if (url.pathname === '/beta' || url.pathname === '/beta/' || url.pathname === '/beta/index.html') {
      if (request.method === 'POST') {
        const form = await request.formData();
        const pw = String(form.get('password') ?? '').trim().toLowerCase();
        if (pw === BETA_PASSWORD) {
          return new Response(null, {
            status: 303,
            headers: {
              location: '/beta/',
              'set-cookie': `${BETA_COOKIE}; Path=/beta; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
            },
          });
        }
        return betaGatePage(true);
      }
      if (!(request.headers.get('cookie') ?? '').includes(BETA_COOKIE)) {
        return betaGatePage(false);
      }
    }

    const match = url.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
    if (!match || request.method !== 'GET') return env.ASSETS.fetch(request);

    // Every share link serves the same static share page; its JS reads the
    // token from the path. share.html carries generic OG fallbacks. (Assets'
    // pretty-URL handling serves share.html at /share — /share.html 307s.)
    const shell = await env.ASSETS.fetch(new Request(new URL('/share', url.origin), request));

    const card = await fetchCard(env, match[1]);
    if (!card?.name) return shell;

    const title = escapeHtml(`${card.name} — Call Your Mom`);
    const description = escapeHtml(
      card.tagline ||
        [card.role, card.company].filter(Boolean).join(' · ') ||
        'Save my contact and share yours back.',
    );

    return new HTMLRewriter()
      .on('meta[property="og:title"]', {
        element(el) {
          el.setAttribute('content', title);
        },
      })
      .on('meta[property="og:description"]', {
        element(el) {
          el.setAttribute('content', description);
        },
      })
      .on('head', {
        element(el) {
          el.append(
            `<meta property="og:type" content="profile">` +
              `<meta name="twitter:card" content="summary">` +
              `<meta name="twitter:title" content="${title}">` +
              `<meta name="twitter:description" content="${description}">`,
            { html: true },
          );
        },
      })
      .on('title', {
        element(el) {
          el.setInnerContent(`${card.name} — Call Your Mom`);
        },
      })
      .transform(shell);
  },
};
