// Bingo backend: a Cloudflare Worker with a small JSON API for the iPhone app, and D1 for
// storage. There is no website; the only non-API paths are what invite links need.
//
//   POST   /api/auth/apple|google  -> { idToken, name? } from native sign-in; returns { token, email, name }
//   POST   /api/auth/dev           -> local development only (needs DEV_EMAIL in .dev.vars)
//   POST   /api/auth/signout       -> ends this device's session
//   GET    /api/config             -> { dev }
//   GET    /api/me                 -> { email, name }
//   PUT    /api/me                 -> { name } change your display name
//   DELETE /api/account            -> deletes everything this person stored
//   POST   /api/push/register      -> { token } Expo push token for this device
//   GET    /api/games              -> [GameSummary]
//   POST   /api/games              -> { name, size } create; returns { id }
//   POST   /api/join/:code         -> join; returns { id }
//   GET    /api/games/:id          -> GameView (built for the person asking)
//   POST   /api/games/:id/phrases  -> { target, text } add a line to a friend's pool; returns GameView
//   POST   /api/games/:id/start    -> { size? } deal the boards; returns GameView
//   GET    /api/games/:id/mine     -> your own board, once it's blacked out
//   POST   /api/games/:id/leave    -> leave the game
//   POST   /api/games/:id/remove   -> { player } owner only: remove someone for good; returns GameView
//   POST   /api/games/:id/block    -> { player } block them (and leave this game)
//   GET    /api/blocks             -> [{ id, name }] people you've blocked
//   DELETE /api/blocks/:id         -> unblock
//   POST   /api/phrases/:id/report -> { reason? } hide a line and report it; returns GameView
//   DELETE /api/phrases/:id        -> delete a line you wrote; returns GameView
//   POST   /api/squares/:id/mark   -> cross off; returns GameView
//   POST   /api/squares/:id/unmark -> undo; returns GameView
//
//   GET /.well-known/apple-app-site-association   lets https://<domain>/join/CODE open the app
//   GET /join/:code                               without the app installed: off to the App Store

import type { Env } from './env';
import { verifySignIn, createSession, sessionEmail, endSession, saveName, nameOf, cleanName } from './auth';
import { HttpError, addPhrase, createGame, deleteAccount, deletePhrase, gameView, joinGame, listGames, ownBoard, setMark, startGame, type Later } from './games';
import { EXPO_TOKEN } from './push';
import { isHateful, NOT_ALLOWED } from './filter';
import { blockPlayer, leaveGame, listBlocks, removePlayer, reportPhrase, unblock } from './safety';
import { CODE } from '../../shared/logic';

const ID = /^[0-9a-f-]{36}$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, (p) => ctx.waitUntil(p.catch((err) => console.error(err))));
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, later: Later): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/.well-known/apple-app-site-association') {
    const appIDs = env.APPLE_TEAM_ID && env.APPLE_BUNDLE_ID ? [`${env.APPLE_TEAM_ID}.${env.APPLE_BUNDLE_ID}`] : [];
    return json({ applinks: { details: [{ appIDs, components: [{ '/': '/join/*' }] }] } }, 200, { 'cache-control': 'public, max-age=3600' });
  }
  // Reaching this means the app isn't installed (iOS would have opened it instead).
  if (/^\/join\/[A-Za-z0-9]{6}\/?$/.test(path)) {
    return env.APP_STORE_URL ? Response.redirect(env.APP_STORE_URL, 302) : new Response('Get the app to join this game.', { status: 200 });
  }
  if (path === '/privacy') return new Response(PRIVACY, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (path === '/terms') return new Response(TERMS, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (!path.startsWith('/api/')) return json({ error: 'Not found' }, 404);

  const open = await publicApi(request, env, path);
  if (open) return open;
  const email = await sessionEmail(request, env);
  if (!email) return json({ error: 'Not signed in' }, 401);
  return api(request, env, path, email, later);
}

// Routes that work without a session. Returns null for anything else.
async function publicApi(request: Request, env: Env, path: string): Promise<Response | null> {
  const method = request.method;
  if (path === '/api/config' && method === 'GET') return json({ dev: !!env.DEV_EMAIL });

  const provider = path.match(/^\/api\/auth\/(apple|google|dev)$/)?.[1];
  if (provider && method === 'POST') {
    const body = await readJson(request);
    // Local development only: any name becomes name@example.com, to test with several people.
    const who = provider === 'dev'
      ? env.DEV_EMAIL
        ? { email: (cleanName(body.name) ? `${cleanName(body.name)}@example.com` : env.DEV_EMAIL).toLowerCase(), name: cleanName(body.name) || 'Dev' }
        : null
      : await verifySignIn(body.idToken, provider, env);
    if (!who) return json({ error: 'Sign-in failed' }, 401);
    // Apple only shares the name on someone's very first sign-in, from the app.
    const offered = who.name || (provider === 'apple' ? cleanName(body.name) : null);
    await saveName(env, who.email, offered && !isHateful(offered) ? offered : null);
    const token = await createSession(env, who.email);
    return json({ token, email: who.email, name: await nameOf(env, who.email) });
  }

  if (path === '/api/auth/signout' && method === 'POST') {
    await endSession(request, env);
    return json({ ok: true });
  }
  return null;
}

async function api(request: Request, env: Env, path: string, email: string, later: Later): Promise<Response> {
  const method = request.method;
  const [, , kind, id, action, ...rest] = path.split('/'); // '', 'api', kind, id?, action?
  if (rest.length) return json({ error: 'Not found' }, 404);
  if (path === '/api/push/register' && method === 'POST') return registerPush(request, env, email);
  if (id !== undefined && kind !== 'join' && !ID.test(id)) return json({ error: 'Not found' }, 404);

  if (kind === 'me' && !id) {
    if (method === 'GET') return json({ email, name: await nameOf(env, email) });
    if (method === 'PUT') {
      const name = cleanName((await readJson(request)).name);
      if (!name) return json({ error: 'Pick a name' }, 400);
      if (isHateful(name)) return json({ error: NOT_ALLOWED }, 400);
      await saveName(env, email, name, true);
      return json({ email, name });
    }
  }

  if (kind === 'account' && !id && method === 'DELETE') {
    await deleteAccount(env, email);
    return json({ ok: true });
  }

  if (kind === 'games' && !id) {
    if (method === 'GET') return json(await listGames(env, email));
    if (method === 'POST') return json(await createGame(env, email, await readJson(request)));
  }

  if (kind === 'join' && id && !action && method === 'POST') {
    if (!CODE.test(id.toUpperCase())) return json({ error: 'Codes are 6 letters and numbers' }, 400);
    return json(await joinGame(env, email, id));
  }

  if (kind === 'games' && id) {
    if (!action && method === 'GET') return json(await gameView(env, id, email));
    if (action === 'phrases' && method === 'POST') {
      await addPhrase(env, id, email, await readJson(request));
      return json(await gameView(env, id, email));
    }
    if (action === 'start' && method === 'POST') {
      await startGame(env, id, email, await readJson(request), later);
      return json(await gameView(env, id, email));
    }
    if (action === 'mine' && method === 'GET') return json(await ownBoard(env, id, email));
    if (action === 'leave' && method === 'POST') {
      await leaveGame(env, id, email);
      return json({ ok: true });
    }
    if (action === 'remove' && method === 'POST') {
      await removePlayer(env, id, email, await readJson(request));
      return json(await gameView(env, id, email));
    }
    if (action === 'block' && method === 'POST') {
      await blockPlayer(env, id, email, await readJson(request));
      return json({ ok: true });
    }
  }

  if (kind === 'phrases' && id && action === 'report' && method === 'POST') {
    const { gameId } = await reportPhrase(env, id, email, await readJson(request));
    return json(await gameView(env, gameId, email));
  }

  if (kind === 'blocks' && !id && method === 'GET') return json(await listBlocks(env, email));
  if (kind === 'blocks' && id && !action && method === 'DELETE') {
    await unblock(env, id, email);
    return json({ ok: true });
  }

  if (kind === 'phrases' && id && !action && method === 'DELETE') {
    const { gameId } = await deletePhrase(env, id, email);
    return json(await gameView(env, gameId, email));
  }

  if (kind === 'squares' && id && (action === 'mark' || action === 'unmark') && method === 'POST') {
    const { gameId } = await setMark(env, id, email, action === 'mark', later);
    return json(await gameView(env, gameId, email));
  }

  return json({ error: 'Not found' }, 404);
}

async function registerPush(request: Request, env: Env, email: string): Promise<Response> {
  const token = String((await readJson(request)).token || '');
  if (!EXPO_TOKEN.test(token)) return json({ error: 'Bad push token' }, 400);
  await env.DB.prepare(
    'INSERT INTO devices (token, email, updated_at) VALUES (?, ?, ?) ON CONFLICT (token) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at',
  ).bind(token, email, Date.now()).run();
  return json({ ok: true });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

// The App Store asks for a privacy policy URL.
const PRIVACY = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bingo privacy</title>
<style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#1F1B16;background:#FFF8EF}</style>
<h1>Privacy</h1>
<p>Bingo stores only what the game needs:</p>
<ul>
<li>Your email address and first name, from Sign in with Apple or Google. Your email is never shown to other players; your first name is.</li>
<li>The games you join, the lines you write about friends, and the squares you cross off.</li>
<li>A push notification token for your device, so we can tell you when someone gets BINGO'd.</li>
</ul>
<p>Nothing is sold, shared with advertisers, or used for tracking. Data is stored with Cloudflare.</p>
<p>If you report a line, we keep the line, who wrote it and who reported it, so we can review it.</p>
<p>Delete your account any time in the app (Settings → Delete account). That removes you from every game, deletes your board, and removes your name from lines you wrote.</p>`;

// App Store rule 1.2: terms everyone agrees to, with no tolerance for abuse.
const TERMS = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bingo terms</title>
<style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#1F1B16;background:#FFF8EF}</style>
<h1>Terms</h1>
<p>Bingo is for laughing with your friends, not at them. By using it you agree:</p>
<ul>
<li>No hateful, harassing, sexual or threatening lines, and nothing about someone's race, religion, gender, sexuality, disability or body meant to hurt.</li>
<li>Only play with people who know they're playing.</li>
<li>We filter slurs, and anyone can report a line. Reported lines are hidden at once. We review reports within 24 hours and remove people who break these terms.</li>
<li>You can leave a game, remove people from games you made, and block anyone, at any time.</li>
</ul>
<p>Questions or a report to make: <a href="mailto:REPLACE_WITH_SUPPORT_EMAIL">REPLACE_WITH_SUPPORT_EMAIL</a></p>`;
