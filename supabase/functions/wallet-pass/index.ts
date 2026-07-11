// Public endpoint behind a share token (the token IS the capability), same
// model as share-card:
//   GET ?token=...&type=google|apple → redirect (Google) or .pkpass (Apple)
// Unauthenticated by design (verify_jwt=false); the token is validated here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import forge from 'npm:node-forge';
import { zipSync } from 'npm:fflate';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PASS_TYPE_ID = Deno.env.get('PASS_TYPE_ID') ?? 'pass.app.getcym.card';
const PASS_TEAM_ID = Deno.env.get('PASS_TEAM_ID') ?? '6W5G6FZQSX';
const WALLET_ISSUER_ID = Deno.env.get('WALLET_ISSUER_ID') ?? '3388000000023157678';
const WALLET_CLASS_ID = `${WALLET_ISSUER_ID}.cym_card`;

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

interface CardFields {
  name: string;
  role: string | null;
  company: string | null;
  tagline: string | null;
}

async function loadCard(
  admin: ReturnType<typeof createClient>,
  token: string,
): Promise<CardFields | null> {
  const { data: link } = await admin
    .from('share_tokens')
    .select('user_id, persona_id')
    .eq('token', token)
    .maybeSingle();
  if (!link) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('name, role, company')
    .eq('user_id', link.user_id)
    .maybeSingle();
  if (!profile) return null;

  const { data: persona } = await admin
    .from('personas')
    .select('tagline, role, company, display_name')
    .eq('id', link.persona_id)
    .eq('user_id', link.user_id)
    .maybeSingle();

  return {
    name: persona?.display_name ?? profile.name,
    role: persona?.role ?? profile.role ?? null,
    company: persona?.company ?? profile.company ?? null,
    tagline: persona?.tagline ?? null,
  };
}

// ---------------------------------------------------------------------------
// Shared crypto helpers
// ---------------------------------------------------------------------------

/** Env secrets carry PEM text as base64 so they survive dashboard/CLI round-trips. */
function decodeEnvPem(name: string): string {
  const raw = Deno.env.get(name);
  if (!raw) throw new Error(`missing env: ${name}`);
  return atob(raw);
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importRs256PrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signRs256Jwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  key: CryptoKey,
): Promise<string> {
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

// ---------------------------------------------------------------------------
// Google Wallet
// ---------------------------------------------------------------------------

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): GoogleServiceAccount {
  const raw = Deno.env.get('WALLET_SA_KEY');
  if (!raw) throw new Error('missing env: WALLET_SA_KEY');
  return JSON.parse(atob(raw));
}

async function mintGoogleAccessToken(sa: GoogleServiceAccount): Promise<string> {
  const key = await importRs256PrivateKey(sa.private_key);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signRs256Jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    key,
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`google oauth token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

// Cached across warm invocations of this isolate — avoids re-creating the
// class on every save request. Cold starts just re-create it (409 = success).
let classEnsured = false;

async function ensureClass(
  sa: GoogleServiceAccount,
): Promise<{ ok: true } | { ok: false; status: number }> {
  if (classEnsured) return { ok: true };

  const accessToken = await mintGoogleAccessToken(sa);
  const res = await fetch('https://walletobjects.googleapis.com/walletobjects/v1/genericClass', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id: WALLET_CLASS_ID }),
  });

  if (res.ok || res.status === 409) {
    classEnsured = true;
    return { ok: true };
  }
  if (res.status === 403) return { ok: false, status: 403 };
  console.error('wallet-pass: genericClass creation failed', res.status, await res.text());
  return { ok: false, status: res.status };
}

async function handleGoogle(token: string, card: CardFields, shareUrl: string): Promise<Response> {
  const sa = loadServiceAccount();

  const classResult = await ensureClass(sa);
  if (!classResult.ok) {
    if (classResult.status === 403) return json({ error: 'wallet_not_authorized' }, 502);
    return json({ error: 'wallet_class_failed' }, 502);
  }

  const key = await importRs256PrivateKey(sa.private_key);

  const genericObject: Record<string, unknown> = {
    id: `${WALLET_ISSUER_ID}.${token}`,
    classId: WALLET_CLASS_ID,
    cardTitle: { defaultValue: { language: 'en-US', value: 'Call Your Mom' } },
    header: { defaultValue: { language: 'en-US', value: card.name } },
    barcode: { type: 'QR_CODE', value: shareUrl },
    hexBackgroundColor: '#FFD466',
    logo: { sourceUri: { uri: 'https://getcym.app/assets/app-icon-1024.png' } },
  };
  const subheader = [card.role, card.company].filter(Boolean).join(' · ');
  if (subheader) {
    genericObject.subheader = { defaultValue: { language: 'en-US', value: subheader } };
  }

  const jwt = await signRs256Jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      aud: 'google',
      typ: 'savetowallet',
      origins: ['https://getcym.app'],
      payload: { genericObjects: [genericObject] },
    },
    key,
  );

  return new Response(null, {
    status: 302,
    headers: { ...cors, location: `https://pay.google.com/gp/v/save/${jwt}` },
  });
}

// ---------------------------------------------------------------------------
// Apple Wallet (.pkpass)
// ---------------------------------------------------------------------------

// Same bytes stand in for icon/icon@2x/logo for now — good enough until a
// dedicated pass-icon asset exists. Cached across warm invocations.
let cachedIconBytes: Uint8Array | null = null;

async function loadIconBytes(): Promise<Uint8Array> {
  if (cachedIconBytes) return cachedIconBytes;
  const res = await fetch('https://getcym.app/assets/apple-touch-icon.png');
  if (!res.ok) throw new Error(`icon fetch failed: ${res.status}`);
  cachedIconBytes = new Uint8Array(await res.arrayBuffer());
  return cachedIconBytes;
}

function buildPassJson(token: string, card: CardFields, shareUrl: string) {
  const secondaryFields: Record<string, string>[] = [];
  if (card.role) secondaryFields.push({ key: 'role', label: '', value: card.role });
  if (card.company) secondaryFields.push({ key: 'company', label: '', value: card.company });

  const auxiliaryFields: Record<string, string>[] = [];
  if (card.tagline) auxiliaryFields.push({ key: 'tagline', label: '', value: card.tagline });

  const generic: Record<string, unknown> = {
    primaryFields: [{ key: 'name', label: '', value: card.name }],
  };
  if (secondaryFields.length) generic.secondaryFields = secondaryFields;
  if (auxiliaryFields.length) generic.auxiliaryFields = auxiliaryFields;

  return {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: PASS_TEAM_ID,
    serialNumber: token,
    organizationName: 'Call Your Mom',
    description: 'Call Your Mom contact card',
    foregroundColor: 'rgb(59,36,28)',
    backgroundColor: 'rgb(255,212,102)',
    labelColor: 'rgb(179,38,15)',
    barcodes: [{ format: 'PKBarcodeFormatQR', message: shareUrl, messageEncoding: 'iso-8859-1' }],
    generic,
  };
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', bytes.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return bin;
}

/** PKCS#7 detached signature over manifest.json, as Apple's pass signing requires. */
function signManifest(manifestBytes: Uint8Array): Uint8Array {
  const signerCert = forge.pki.certificateFromPem(decodeEnvPem('PASS_SIGNER_CERT'));
  const wwdrCert = forge.pki.certificateFromPem(decodeEnvPem('PASS_WWDR'));
  const signerKey = forge.pki.privateKeyFromPem(decodeEnvPem('PASS_SIGNER_KEY'));

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(bytesToBinaryString(manifestBytes));
  p7.addCertificate(signerCert);
  p7.addCertificate(wwdrCert);
  p7.addSigner({
    key: signerKey,
    certificate: signerCert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest }, // forge fills this in from p7.content
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i);
  return out;
}

async function handleApple(token: string, card: CardFields, shareUrl: string): Promise<Response> {
  const encoder = new TextEncoder();
  const iconBytes = await loadIconBytes();

  const passFiles: Record<string, Uint8Array> = {
    'pass.json': encoder.encode(JSON.stringify(buildPassJson(token, card, shareUrl))),
    'icon.png': iconBytes,
    'icon@2x.png': iconBytes,
    'logo.png': iconBytes,
  };

  const manifest: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(passFiles)) {
    manifest[name] = await sha1Hex(bytes);
  }
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const signatureBytes = signManifest(manifestBytes);

  const zipped = zipSync(
    { ...passFiles, 'manifest.json': manifestBytes, signature: signatureBytes },
    { level: 0 },
  );

  return new Response(zipped, {
    status: 200,
    headers: {
      ...cors,
      'content-type': 'application/vnd.apple.pkpass',
      'content-disposition': 'attachment; filename=cym-card.pkpass',
    },
  });
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const type = url.searchParams.get('type') ?? '';
  if (!token) return json({ error: 'not_found' }, 404);
  if (type !== 'google' && type !== 'apple') return json({ error: 'invalid_type' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const card = await loadCard(admin, token);
  if (!card) return json({ error: 'not_found' }, 404);

  const shareUrl = `https://getcym.app/c/${token}`;

  try {
    return type === 'google'
      ? await handleGoogle(token, card, shareUrl)
      : await handleApple(token, card, shareUrl);
  } catch (e) {
    console.error('wallet-pass failed', e);
    return json({ error: 'failed' }, 500);
  }
});
