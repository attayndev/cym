// Tamper-proof OAuth `state` for the Gmail connect flow.
//
// The callback (verify_jwt=false) trusts `state` to say WHICH user is
// connecting and WHERE to return. If state were forgeable, an attacker could
// (a) write their own Gmail credentials under a victim's user_id, and
// (b) bounce the browser to an arbitrary origin (open redirect). So state is
// HMAC-signed with a server-only key, carries a short expiry, and the return
// URL is checked against an allowlist on both ends.

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(sig);
}

/** Constant-time compare so a bad signature can't be probed byte-by-byte. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Only these origins may be returned to. The native app uses its custom scheme;
 * web uses the production hosts. Anything else is rejected (open-redirect guard).
 */
export function isAllowedRedirect(redirect: string): boolean {
  if (!redirect) return true; // empty → callback falls back to a safe default
  if (redirect.startsWith('callyourmom://')) return true;
  try {
    const u = new URL(redirect);
    return (
      (u.protocol === 'https:' &&
        (u.hostname === 'getcym.app' || u.hostname.endsWith('.getcym.app'))) ||
      // Expo web dev server on localhost is fine for non-production testing.
      (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))
    );
  } catch {
    return false;
  }
}

const TTL_MS = 10 * 60 * 1000; // a consent flow that takes >10 min is stale

export interface StatePayload {
  uid: string;
  redirect: string;
}

/** Sign `{uid, redirect}` (+ issued-at) into an opaque `payload.sig` string. */
export async function signState(
  payload: StatePayload,
  secret: string,
): Promise<string> {
  const body = b64urlEncode(
    encoder.encode(JSON.stringify({ ...payload, iat: Date.now() })),
  );
  const sig = b64urlEncode(await hmac(secret, body));
  return `${body}.${sig}`;
}

/** Verify signature + freshness. Returns the payload or null (never throws). */
export async function verifyState(
  raw: string,
  secret: string,
): Promise<StatePayload | null> {
  const dot = raw.indexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await hmac(secret, body);
  let got: Uint8Array;
  try {
    got = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, got)) return null;

  let parsed: { uid?: unknown; redirect?: unknown; iat?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  const { uid, redirect, iat } = parsed;
  if (typeof uid !== 'string' || !uid) return null;
  if (typeof iat !== 'number' || Date.now() - iat > TTL_MS) return null;
  const red = typeof redirect === 'string' ? redirect : '';
  if (!isAllowedRedirect(red)) return null;
  return { uid, redirect: red };
}
