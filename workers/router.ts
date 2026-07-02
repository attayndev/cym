/**
 * Edge router for getcym.app (the marketing site). Static assets serve
 * everything except /c/<token>, which gets share.html with per-token Open
 * Graph tags injected — so a texted link previews as "«Name» — Call Your Mom"
 * instead of a generic shell. getcym.com 301s here.
 */

interface Env {
  ASSETS: Fetcher;
  SHARE_CARD_URL: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // getcym.com is an alias; getcym.app is canonical.
    if (url.hostname.endsWith('getcym.com')) {
      url.hostname = 'getcym.app';
      return Response.redirect(url.toString(), 301);
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
