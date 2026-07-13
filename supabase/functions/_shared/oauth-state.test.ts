// Run with: deno test supabase/functions/_shared/oauth-state.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { isAllowedRedirect, signState, verifyState } from './oauth-state.ts';

const SECRET = 'test-service-role-key-high-entropy-0123456789';

Deno.test('round-trips a valid state', async () => {
  const s = await signState({ uid: 'user-abc', redirect: 'callyourmom://gmail-connected' }, SECRET);
  const v = await verifyState(s, SECRET);
  assert(v);
  assertEquals(v.uid, 'user-abc');
  assertEquals(v.redirect, 'callyourmom://gmail-connected');
});

Deno.test('rejects a state signed with a different secret (forgery)', async () => {
  const forged = await signState({ uid: 'victim', redirect: 'callyourmom://x' }, 'attacker-secret');
  assertEquals(await verifyState(forged, SECRET), null);
});

Deno.test('rejects a tampered payload', async () => {
  const s = await signState({ uid: 'u', redirect: '' }, SECRET);
  const [body, sig] = s.split('.');
  const flipped = body.slice(0, -1) + (body.slice(-1) === 'A' ? 'B' : 'A');
  assertEquals(await verifyState(`${flipped}.${sig}`, SECRET), null);
});

Deno.test('rejects garbage and empty state', async () => {
  assertEquals(await verifyState('garbage', SECRET), null);
  assertEquals(await verifyState('', SECRET), null);
});

Deno.test('redirect allowlist', () => {
  assert(isAllowedRedirect('callyourmom://gmail-connected'));
  assert(isAllowedRedirect('https://getcym.app/x'));
  assert(isAllowedRedirect('https://app.getcym.app/x'));
  assert(isAllowedRedirect('')); // empty falls back to a safe default
  assert(!isAllowedRedirect('https://evil.com/steal'));
  assert(!isAllowedRedirect('https://getcym.app.evil.com'));
  assert(!isAllowedRedirect('javascript:alert(1)'));
});

Deno.test('rejects a signed state whose redirect is not allowlisted', async () => {
  const bad = await signState({ uid: 'u', redirect: 'https://evil.com' }, SECRET);
  assertEquals(await verifyState(bad, SECRET), null);
});
