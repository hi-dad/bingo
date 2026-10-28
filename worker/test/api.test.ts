// Plays whole games through the real Worker (dev sign-in, D1 over SQLite) as several people.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/env';
import type { GameView } from '../../shared/types';
import { testDb } from './d1';

let env: Env;
let pending: Promise<unknown>[];
let pushes: { to: string; title: string; body: string }[];

beforeEach(() => {
  env = { DB: testDb(), DEV_EMAIL: 'dev@example.com' } as Env;
  pending = [];
  pushes = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (!String(url).startsWith('https://exp.host/')) throw new Error(`unexpected fetch ${url}`);
    const msgs = JSON.parse(String(init.body));
    pushes.push(...msgs);
    return new Response(JSON.stringify({ data: msgs.map(() => ({ status: 'ok' })) }));
  });
});

const ctx = () => ({ waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} }) as unknown as ExecutionContext;
const settle = async () => { await Promise.all(pending); pending = []; };

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await worker.fetch(new Request(`https://bingo.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx());
  const text = await res.text();
  return { status: res.status, text, data: text ? JSON.parse(text) : null };
}

async function signIn(name: string) {
  const { data } = await call(null, 'POST', '/api/auth/dev', { name });
  await call(data.token, 'POST', '/api/push/register', { token: `ExponentPushToken[${name}-device-0001]` });
  return data.token as string;
}

const view = async (token: string, id: string) => (await call(token, 'GET', `/api/games/${id}`)).data as GameView;
const idOf = (v: GameView, name: string) => v.players.find((p) => p.name === name)!.id;

// Ana makes a 3×3 game; Ben and Cal join; everyone writes 10 lines about each other.
// Lines are tagged with who they're about ("about-ana-…") so leaks are easy to spot.
async function setUp() {
  const ana = await signIn('Ana');
  const ben = await signIn('Ben');
  const cal = await signIn('Cal');
  const { data: { id } } = await call(ana, 'POST', '/api/games', { name: 'Lake trip', size: 3 });
  const { code } = await view(ana, id);
  expect((await call(ben, 'POST', `/api/join/${code}`)).data).toEqual({ id });
  expect((await call(cal, 'POST', `/api/join/${code.toLowerCase()}`)).data).toEqual({ id });
  const v = await view(ana, id);
  const people = { Ana: ana, Ben: ben, Cal: cal };
  for (const [writer, token] of Object.entries(people)) {
    for (const target of Object.keys(people)) {
      if (target === writer) continue;
      for (let i = 0; i < 5; i++) {
        const r = await call(token, 'POST', `/api/games/${id}/phrases`, { target: idOf(v, target), text: `about-${target.toLowerCase()}-${writer}-${i}` });
        expect(r.status).toBe(200);
      }
    }
  }
  return { id, code, ana, ben, cal, ids: { ana: idOf(v, 'Ana'), ben: idOf(v, 'Ben'), cal: idOf(v, 'Cal') } };
}

const squareAt = (v: GameView, target: string, pos: number) => v.boards[target].squares.find((s) => s.pos === pos)!.id;

describe('writing', () => {
  test('nobody ever sees lines about themselves', async () => {
    const g = await setUp();
    const a = await call(g.ana, 'GET', `/api/games/${g.id}`);
    expect(a.text).not.toContain('about-ana');
    expect(a.text).toContain('about-ben');
    expect(Object.keys(a.data.pools).sort()).toEqual([g.ids.ben, g.ids.cal].sort());
    // …but they can see how many there are.
    expect(a.data.players.find((p: { isMe: boolean }) => p.isMe).poolCount).toBe(10);
  });

  test('emails never leave the server', async () => {
    const g = await setUp();
    expect((await call(g.ana, 'GET', `/api/games/${g.id}`)).text).not.toContain('@example.com');
  });

  test('no writing about yourself, no duplicates, and only your own lines can be deleted', async () => {
    const g = await setUp();
    expect((await call(g.ana, 'POST', `/api/games/${g.id}/phrases`, { target: g.ids.ana, text: 'hi' })).status).toBe(403);
    expect((await call(g.cal, 'POST', `/api/games/${g.id}/phrases`, { target: g.ids.ana, text: 'ABOUT-ana-Ben-0' })).status).toBe(409);
    const pool = (await view(g.ben, g.id)).pools[g.ids.ana];
    const mine = pool.find((p) => p.mine)!;
    const theirs = pool.find((p) => !p.mine)!;
    expect(mine.text).toContain('-Ben-');
    expect((await call(g.ben, 'DELETE', `/api/phrases/${theirs.id}`)).status).toBe(403);
    expect((await call(g.ben, 'DELETE', `/api/phrases/${mine.id}`)).status).toBe(200);
  });

  test('outsiders get nothing', async () => {
    const g = await setUp();
    const eve = await signIn('Eve');
    expect((await call(eve, 'GET', `/api/games/${g.id}`)).status).toBe(404);
    expect((await call(null, 'GET', `/api/games/${g.id}`)).status).toBe(401);
    expect((await call(eve, 'POST', '/api/join/ZZZZZZ')).status).toBe(404);
  });
});

describe('dealing', () => {
  test('waits for full pools, only the owner deals, and only once', async () => {
    const g = await setUp();
    // 3×3 needs 9; drop Ana's pool to 8 lines
    for (const writer of [g.ben, g.cal]) {
      const mine = (await view(writer, g.id)).pools[g.ids.ana].filter((p) => p.mine);
      if (writer === g.ben) for (const p of mine.slice(0, 2)) await call(writer, 'DELETE', `/api/phrases/${p.id}`);
    }
    expect((await call(g.ana, 'POST', `/api/games/${g.id}/start`)).data.error).toMatch(/more lines/);
    await call(g.ben, 'POST', `/api/games/${g.id}/phrases`, { target: g.ids.ana, text: 'about-ana-extra' });

    expect((await call(g.ben, 'POST', `/api/games/${g.id}/start`)).status).toBe(403);
    const started = await call(g.ana, 'POST', `/api/games/${g.id}/start`);
    expect(started.status).toBe(200);
    expect(started.data.status).toBe('playing');
    expect((await call(g.ana, 'POST', `/api/games/${g.id}/start`)).status).toBe(409);
    await settle();
    expect(pushes.filter((p) => p.title.startsWith('Boards are live')).map((p) => p.to).sort())
      .toEqual(['ExponentPushToken[Ben-device-0001]', 'ExponentPushToken[Cal-device-0001]']);
  });

  test('a 5×5 board has a free center that starts crossed off', async () => {
    const g = await setUp();
    for (const token of [g.ana, g.ben, g.cal]) {
      const v = await view(token, g.id);
      for (const target of Object.keys(v.pools)) {
        for (let i = 0; i < 8; i++) await call(token, 'POST', `/api/games/${g.id}/phrases`, { target, text: `more-${token.slice(0, 6)}-${target}-${i}` });
      }
    }
    expect((await call(g.ana, 'POST', `/api/games/${g.id}/start`, { size: 5 })).status).toBe(200);
    const v = await view(g.ben, g.id);
    const squares = v.boards[g.ids.ana].squares;
    expect(squares).toHaveLength(25);
    expect(squares[12]).toMatchObject({ free: true, text: null });
    expect(squares[12].markedAt).not.toBeNull();
    expect(new Set(squares.filter((s) => !s.free).map((s) => s.text)).size).toBe(24);
    expect(v.players.find((p) => p.id === g.ids.ana)!.progress).toMatchObject({ marked: 0, total: 24, best: 1 });
    expect((await call(g.ben, 'POST', `/api/squares/${squares[12].id}/mark`)).status).toBe(400);
  });
});

describe('playing', () => {
  async function playing() {
    const g = await setUp();
    await call(g.ana, 'POST', `/api/games/${g.id}/start`);
    await settle();
    pushes = [];
    return g;
  }

  test('your own board is never sent to you, only its progress', async () => {
    const g = await playing();
    const a = await call(g.ana, 'GET', `/api/games/${g.id}`);
    expect(a.text).not.toContain('about-ana');
    expect(Object.keys(a.data.boards).sort()).toEqual([g.ids.ben, g.ids.cal].sort());
    expect(a.data.players.find((p: { isMe: boolean }) => p.isMe).progress).toMatchObject({ marked: 0, total: 9 });
    // Square ids of your own board (learned from a friend) don't work for you either.
    const sq = squareAt(await view(g.ben, g.id), g.ids.ana, 0);
    expect((await call(g.ana, 'POST', `/api/squares/${sq}/mark`)).status).toBe(404);
    expect((await call(g.ana, 'GET', `/api/games/${g.id}/mine`)).status).toBe(403);
  });

  test('two people crossing off the same square at once mark it once', async () => {
    const g = await playing();
    const sq = squareAt(await view(g.ben, g.id), g.ids.ana, 4);
    const [b, c] = await Promise.all([
      call(g.ben, 'POST', `/api/squares/${sq}/mark`),
      call(g.cal, 'POST', `/api/squares/${sq}/mark`),
    ]);
    expect([b.status, c.status]).toEqual([200, 200]);
    const s = (await view(g.ana, g.id)).players.find((p) => p.isMe)!.progress!;
    expect(s.marked).toBe(1);
    const square = (await view(g.cal, g.id)).boards[g.ids.ana].squares[4];
    // Either may win the race; exactly one of them gets the credit.
    expect(['Ben', 'Cal']).toContain(square.markedBy);
    expect(square.markedByMe).toBe(square.markedBy === 'Cal');
    const credit = (await view(g.ana, g.id)).scores.filter((x) => x.spotted > 0);
    expect(credit).toHaveLength(1);
  });

  test('bingo is recorded and announced exactly once, even when two lines finish together', async () => {
    const g = await playing();
    const v = await view(g.ben, g.id);
    for (const pos of [0, 1, 3]) await call(g.ben, 'POST', `/api/squares/${squareAt(v, g.ids.ana, pos)}/mark`);
    // pos 2 finishes the top row, pos 6 the left column, at the same moment
    await Promise.all([
      call(g.ben, 'POST', `/api/squares/${squareAt(v, g.ids.ana, 2)}/mark`),
      call(g.cal, 'POST', `/api/squares/${squareAt(v, g.ids.ana, 6)}/mark`),
    ]);
    await settle();
    expect(pushes.filter((p) => p.title === 'BINGO! 🎉')).toHaveLength(1);
    expect(pushes.filter((p) => p.title.startsWith('You got BINGO'))).toEqual([
      expect.objectContaining({ to: 'ExponentPushToken[Ana-device-0001]' }),
    ]);
    const after = await view(g.cal, g.id);
    expect(after.boards[g.ids.ana].bingoAt).not.toBeNull();
    expect(after.players.find((p) => p.id === g.ids.ana)!.progress!.best).toBe(3);
    expect(after.scores.find((s) => s.name === 'Ben')!.spotted).toBe(4);
    expect(after.scores.find((s) => s.name === 'Cal')!.spotted).toBe(1);
    // Ben and Cal each wrote some of those five lines
    const written = after.scores.filter((s) => s.name !== 'Ana').reduce((n, s) => n + s.written, 0);
    expect(written).toBe(5);
  });

  test('unmarking undoes a square; the target cannot touch their own board', async () => {
    const g = await playing();
    const sq = squareAt(await view(g.ben, g.id), g.ids.cal, 0);
    await call(g.ben, 'POST', `/api/squares/${sq}/mark`);
    expect((await call(g.cal, 'POST', `/api/squares/${sq}/unmark`)).status).toBe(404);
    const r = await call(g.ana, 'POST', `/api/squares/${sq}/unmark`);
    expect(r.data.boards[g.ids.cal].squares[0].markedAt).toBeNull();
  });

  test('blackout reveals the writers, and then the target may see their board', async () => {
    const g = await playing();
    const v = await view(g.ben, g.id);
    for (let pos = 0; pos < 9; pos++) await call(g.ben, 'POST', `/api/squares/${squareAt(v, g.ids.ana, pos)}/mark`);
    await settle();
    expect(pushes.filter((p) => p.title.startsWith('Blackout'))).toHaveLength(1);
    const cal = await view(g.cal, g.id);
    expect(cal.boards[g.ids.ana].blackoutAt).not.toBeNull();
    for (const s of cal.boards[g.ids.ana].squares) expect(['Ben', 'Cal']).toContain(s.writer);
    // Boards that aren't finished keep their writers secret.
    for (const s of cal.boards[g.ids.ben].squares) expect(s.writer).toBeNull();
    const mine = await call(g.ana, 'GET', `/api/games/${g.id}/mine`);
    expect(mine.status).toBe(200);
    expect(mine.text).toContain('about-ana');
  });

  test('someone who joins late plays along without a board', async () => {
    const g = await playing();
    const dee = await signIn('Dee');
    await call(dee, 'POST', `/api/join/${g.code}`);
    const v = await view(dee, g.id);
    expect(Object.keys(v.boards)).toHaveLength(3);
    expect(v.players.find((p) => p.isMe)!.hasBoard).toBe(false);
    expect((await call(dee, 'POST', `/api/squares/${squareAt(v, g.ids.ana, 0)}/mark`)).status).toBe(200);
  });
});

describe('accounts', () => {
  test('names can be changed', async () => {
    const ana = await signIn('Ana');
    expect((await call(ana, 'PUT', '/api/me', { name: '  Annie  B ' })).data).toMatchObject({ name: 'Annie' });
    expect((await call(ana, 'GET', '/api/me')).data).toMatchObject({ name: 'Annie' });
  });

  test('deleting an account removes the person and hands the game on', async () => {
    const g = await setUp();
    await call(g.ana, 'POST', `/api/games/${g.id}/start`);
    expect((await call(g.ana, 'DELETE', '/api/account')).status).toBe(200);
    expect((await call(g.ana, 'GET', '/api/games')).status).toBe(401);
    const v = await view(g.ben, g.id);
    expect(v.players.map((p) => p.name).sort()).toEqual(['Ben', 'Cal']);
    expect(v.players.find((p) => p.name === 'Ben')!.isOwner).toBe(true);
    expect(v.boards[g.ids.ana]).toBeUndefined();
    // Ben's board survives, including lines Ana wrote (now anonymous)
    expect(v.boards[g.ids.cal].squares).toHaveLength(9);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE email = ?').bind('ana@example.com').first()).toEqual({ n: 0 });
  });

  test('the last person leaving deletes the game', async () => {
    const ana = await signIn('Ana');
    const { data: { id } } = await call(ana, 'POST', '/api/games', { name: 'Solo' });
    await call(ana, 'DELETE', '/api/account');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE id = ?').bind(id).first()).toEqual({ n: 0 });
  });
});

test('dev sign-in is off unless DEV_EMAIL is set', async () => {
  env.DEV_EMAIL = undefined;
  expect((await call(null, 'POST', '/api/auth/dev', { name: 'Ana' })).status).toBe(401);
});

test('universal links file lists the app', async () => {
  env.APPLE_TEAM_ID = 'TEAM123';
  env.APPLE_BUNDLE_ID = 'app.bingo';
  const r = await call(null, 'GET', '/.well-known/apple-app-site-association');
  expect(r.data.applinks.details[0].appIDs).toEqual(['TEAM123.app.bingo']);
});
