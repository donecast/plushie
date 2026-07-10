// Verifies the R2 Worker's JWT check (worker/r2-storage.js verifyToken):
// a validly ES256-signed, unexpired token with a `sub` is accepted; forged,
// expired, wrong-alg, and malformed tokens are rejected. Self-contained — it
// mints its own P-256 key, publishes it as a JWKS via a stubbed fetch, and
// signs test tokens, so it never touches the network or real Supabase keys.

import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken, _resetJwksCache } from '../worker/r2-storage.js';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const KID = 'test-key-1';
let publicJwk;
let privateKey;

async function makeToken({ sub = 'user-abc', exp = Math.floor(Date.now() / 1000) + 3600, alg = 'ES256', tamper = false, omitSub = false } = {}) {
  const header = b64url(JSON.stringify({ alg, kid: KID, typ: 'JWT' }));
  const claims = { exp, role: 'authenticated' };
  if (!omitSub) claims.sub = sub;
  const payload = b64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(signingInput));
  let sigB64 = b64url(new Uint8Array(sig));
  if (tamper) sigB64 = sigB64.slice(0, -2) + (sigB64.endsWith('AA') ? 'BB' : 'AA');
  return `${header}.${payload}.${sigB64}`;
}

test('setup: mint a P-256 keypair and publish it as a stubbed JWKS', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = 'ES256';
  publicJwk.use = 'sig';

  // Stub global fetch so getJwks() returns our public key.
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [publicJwk] }) });
  _resetJwksCache();
});

const env = { SUPABASE_JWKS_URL: 'https://example.test/jwks' };

test('accepts a validly signed, unexpired token', async () => {
  const claims = await verifyToken(`Bearer ${await makeToken({ sub: 'user-abc' })}`, env);
  assert.ok(claims, 'expected claims');
  assert.equal(claims.sub, 'user-abc');
});

test('rejects the old presence-only forgery (Bearer a.b.c)', async () => {
  assert.equal(await verifyToken('Bearer a.b.c', env), null);
});

test('rejects a tampered signature', async () => {
  const tok = await makeToken({ tamper: true });
  assert.equal(await verifyToken(`Bearer ${tok}`, env), null);
});

test('rejects an expired token', async () => {
  const tok = await makeToken({ exp: Math.floor(Date.now() / 1000) - 10 });
  assert.equal(await verifyToken(`Bearer ${tok}`, env), null);
});

test('rejects a non-ES256 alg header', async () => {
  const tok = await makeToken({ alg: 'HS256' });
  assert.equal(await verifyToken(`Bearer ${tok}`, env), null);
});

test('rejects a token with no sub', async () => {
  const tok = await makeToken({ omitSub: true });
  assert.equal(await verifyToken(`Bearer ${tok}`, env), null);
});

test('rejects a missing / malformed header', async () => {
  assert.equal(await verifyToken('', env), null);
  assert.equal(await verifyToken('Bearer not-a-jwt', env), null);
  assert.equal(await verifyToken(undefined, env), null);
});
