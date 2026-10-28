// Ported from Poozles (hi-dad/puzzles test/auth.test.mjs).
import { afterAll, expect, test, vi } from 'vitest';
import { verifySignIn } from '../src/auth';
import type { Env } from '../src/env';

// A stand-in for Apple's and Google's signing keys: tokens are signed with our own key
// pair, and fetch() of the provider's key URL returns its public half.
const pair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify'],
) as CryptoKeyPair;
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [jwk] })));
afterAll(() => vi.unstubAllGlobals());

const env = {
  APPLE_BUNDLE_ID: 'app.bingo',
  GOOGLE_WEB_CLIENT_ID: 'web.apps.googleusercontent.com', GOOGLE_IOS_CLIENT_ID: '',
} as Env;
const b64 = (x: unknown) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

async function sign(claims: object, { kid = 'k1', key = pair.privateKey } = {}) {
  const head = `${b64({ alg: 'RS256', kid })}.${b64(claims)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head));
  return `${head}.${Buffer.from(sig).toString('base64url')}`;
}
const email = async (token: string, provider: string, e: Env = env) => (await verifySignIn(token, provider, e))?.email ?? null;

const exp = Math.floor(Date.now() / 1000) + 600;
const apple = { iss: 'https://appleid.apple.com', aud: 'app.bingo', email: 'Sam@Example.com', email_verified: 'true', exp };
const google = { iss: 'https://accounts.google.com', aud: 'web.apps.googleusercontent.com', email: 'sam@gmail.com', email_verified: true, exp, given_name: 'Sam' };

test('a valid Apple token gives the lower-cased email', async () => {
  expect(await email(await sign(apple), 'apple')).toBe('sam@example.com');
});

test('a valid Google token gives the email and first name', async () => {
  expect(await verifySignIn(await sign(google), 'google', env)).toEqual({ email: 'sam@gmail.com', name: 'Sam' });
});

test('tokens for another app, issuer or provider are refused', async () => {
  expect(await email(await sign({ ...apple, aud: 'com.someone.else' }), 'apple')).toBeNull();
  expect(await email(await sign({ ...apple, iss: 'https://evil.example' }), 'apple')).toBeNull();
  expect(await email(await sign(google), 'apple')).toBeNull();
  expect(await email(await sign(google), 'facebook')).toBeNull();
});

test('expired, unverified-email and email-less tokens are refused', async () => {
  expect(await email(await sign({ ...google, exp: exp - 1200 }), 'google')).toBeNull();
  expect(await email(await sign({ ...google, email_verified: false }), 'google')).toBeNull();
  expect(await email(await sign({ ...google, email: undefined }), 'google')).toBeNull();
});

test('a forged signature or unknown key is refused', async () => {
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  ) as CryptoKeyPair;
  expect(await email(await sign(google, { key: other.privateKey }), 'google')).toBeNull();
  expect(await email(await sign(google, { kid: 'nope' }), 'google')).toBeNull();
  expect(await email('not.a.token', 'google')).toBeNull();
});

test('a provider with no configured app id refuses everything', async () => {
  expect(await email(await sign(google), 'google', { ...env, GOOGLE_WEB_CLIENT_ID: '' })).toBeNull();
});
