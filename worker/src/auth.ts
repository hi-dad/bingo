// Sign-in, ported from Poozles (hi-dad/puzzles worker/auth.js). The app signs in with Apple
// or Google natively and hands us the provider's signed ID token, which is checked against
// that provider's published keys. The verified email is the key for everything stored. We
// then issue our own long-lived session: a random token, kept only as a hash in D1, which
// the app stores in the Keychain and sends as a bearer token.

import type { Env } from './env';

interface Provider {
  issuers: string[];
  jwks: string;
  audiences: (env: Env) => (string | undefined)[];
}

const PROVIDERS: Record<string, Provider> = {
  apple: {
    issuers: ['https://appleid.apple.com'],
    jwks: 'https://appleid.apple.com/auth/keys',
    audiences: (env) => [env.APPLE_BUNDLE_ID],
  },
  google: {
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    // The native Google library puts the web client ID in `aud` when it's configured.
    audiences: (env) => [env.GOOGLE_WEB_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID],
  },
};

const SESSION_MS = 365 * 24 * 3600_000;

export interface SignedIn {
  email: string;
  name: string | null;
}

// { email, name } from a provider's ID token, or null. Google includes the person's name;
// Apple never puts it in the token (the app passes it along on the first sign-in instead).
export async function verifySignIn(token: unknown, provider: string, env: Env, now = Date.now()): Promise<SignedIn | null> {
  const p = PROVIDERS[provider];
  if (!p || typeof token !== 'string') return null;
  const allowed = p.audiences(env).filter(Boolean);
  if (!allowed.length) return null;
  const claims = await verifyJwt(token, p.jwks, now);
  if (!claims || !p.issuers.includes(claims.iss)) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some((a: string) => allowed.includes(a))) return null;
  // Google sends email_verified as a boolean, Apple sometimes as the string "true".
  if (!claims.email || String(claims.email_verified) !== 'true') return null;
  return { email: String(claims.email).toLowerCase(), name: cleanName(claims.given_name || claims.name) };
}

// A first name fit to show other players, or null.
export function cleanName(name: unknown): string | null {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first ? first.slice(0, 24) : null;
}

// Remember a player's display name. A name already on file wins unless `replace` is set,
// so signing in again with Google doesn't undo a name someone picked themselves.
export async function saveName(env: Env, email: string, name: string | null, replace = false) {
  await env.DB.prepare(
    `INSERT INTO users (email, name) VALUES (?, ?) ON CONFLICT (email) DO UPDATE SET name = ${replace ? 'excluded.name' : 'COALESCE(users.name, excluded.name)'}`,
  ).bind(email, name).run();
}

export async function nameOf(env: Env, email: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(email).first<{ name: string | null }>();
  return row?.name ?? null;
}

// ---------- sessions ----------

export async function createSession(env: Env, email: string): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, owner, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), email, now, now + SESSION_MS).run();
  return token;
}

// The email of the signed-in person making this request, or null.
export async function sessionEmail(request: Request, env: Env): Promise<string | null> {
  const token = bearer(request);
  if (!token) return null;
  const row = await env.DB.prepare('SELECT owner, expires_at FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token)).first<{ owner: string; expires_at: number }>();
  return row && row.expires_at > Date.now() ? row.owner : null;
}

export async function endSession(request: Request, env: Env) {
  const token = bearer(request);
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}

function bearer(request: Request): string | null {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() || null : null;
}

// ---------- JWT (RS256) ----------

const jwksCache = new Map<string, { keys: JsonWebKey[]; at: number }>();

async function providerKeys(url: string, force = false): Promise<(JsonWebKey & { kid?: string })[]> {
  const cached = jwksCache.get(url);
  if (!force && cached && Date.now() - cached.at < 3600_000) return cached.keys;
  const keys = ((await (await fetch(url)).json()) as { keys?: JsonWebKey[] }).keys || [];
  jwksCache.set(url, { keys, at: Date.now() });
  return keys;
}

async function verifyJwt(token: string, jwksUrl: string, now: number): Promise<any | null> {
  try {
    const [h, p, s] = token.split('.');
    const header = JSON.parse(b64text(h));
    const claims = JSON.parse(b64text(p));
    if (header.alg !== 'RS256') return null;
    if (!claims.exp || claims.exp * 1000 < now) return null;
    // Providers rotate keys; an unknown key id means our cached copy is stale.
    let jwk = (await providerKeys(jwksUrl)).find((k) => k.kid === header.kid);
    jwk ??= (await providerKeys(jwksUrl, true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64bytes(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? claims : null;
  } catch {
    return null;
  }
}

async function sha256(text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64bytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64text(s: string): string {
  return new TextDecoder().decode(b64bytes(s));
}
