// Plays whole games through the real Worker (dev sign-in, D1 over SQLite) as several people.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/env';
import type { GameView } from '../../shared/types';
import { testDb } from './d1';
import { BLOCKLIST_B64 as BLOCKLIST } from '../src/blocklist';

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

// Ana makes a game (boards are 5×5, so 25 lines each); Ben and Cal join; everyone writes 26
// lines about each other, 13 from each writer.
// Lines are tagged with who they're about ("about-ana-…") so leaks are easy to spot.
async function setUp() {
  const ana = await signIn('Ana');
  const ben = await signIn('Ben');
  const cal = await signIn('Cal');
  const { data: { id } } = await call(ana, 'POST', '/api/games', { name: 'Lake trip' });
  const { code } = await view(ana, id);
  expect((await call(ben, 'POST', `/api/join/${code}`)).data).toEqual({ id });
  expect((await call(cal, 'POST', `/api/join/${code.toLowerCase()}`)).data).toEqual({ id });
  const v = await view(ana, id);
  const people = { Ana: ana, Ben: ben, Cal: cal };
  for (const [writer, token] of Object.entries(people)) {
    for (const target of Object.keys(people)) {
      if (target === writer) continue;
      for (let i = 0; i < 13; i++) {
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
    expect(a.data.players.find((p: { isMe: boolean }) => p.isMe).poolCount).toBe(26);
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

describe('editing lines', () => {
  test('writers can edit their own unused lines, nobody else can', async () => {
    const g = await setUp();
    const mine = (await view(g.ben, g.id)).pools[g.ids.ana].find((p) => p.mine)!;
    const r = await call(g.ben, 'PUT', `/api/phrases/${mine.id}`, { text: '  Says   literally ' });
    expect(r.status).toBe(200);
    expect(r.data.pools[g.ids.ana].find((p: { id: string }) => p.id === mine.id).text).toBe('Says literally');
    expect((await call(g.cal, 'PUT', `/api/phrases/${mine.id}`, { text: 'hijack' })).status).toBe(403);
    const other = (await view(g.ben, g.id)).pools[g.ids.ana].find((p) => p.mine && p.id !== mine.id)!;
    expect((await call(g.ben, 'PUT', `/api/phrases/${other.id}`, { text: 'says LITERALLY' })).status).toBe(409);
    // Once a line is on a board it's fixed.
    await call(g.ana, 'POST', `/api/games/${g.id}/start`);
    const used = await env.DB.prepare('SELECT p.id FROM phrases p JOIN squares s ON s.phrase_id = p.id JOIN members m ON m.id = p.author WHERE m.email = ? LIMIT 1')
      .bind('ben@example.com').first<{ id: string }>();
    expect((await call(g.ben, 'PUT', `/api/phrases/${used!.id}`, { text: 'too late' })).status).toBe(409);
  });
});

describe('dealing', () => {
  test('waits for full pools, only the owner deals, and only once', async () => {
    const g = await setUp();
    // 25 needed; drop Ana's pool from 26 to 24 lines
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

  test('boards are 5×5 with no free square', async () => {
    const g = await setUp();
    // Older app builds sent a size; boards are 5×5 regardless.
    expect((await call(g.ana, 'POST', `/api/games/${g.id}/start`, { size: 3 })).status).toBe(200);
    const v = await view(g.ben, g.id);
    const squares = v.boards[g.ids.ana].squares;
    expect(squares).toHaveLength(25);
    expect(squares.some((s) => s.free)).toBe(false);
    expect(new Set(squares.map((s) => s.text)).size).toBe(25);
    expect(v.players.find((p) => p.id === g.ids.ana)!.progress).toMatchObject({ marked: 0, total: 25, best: 0 });
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
    expect(a.data.players.find((p: { isMe: boolean }) => p.isMe).progress).toMatchObject({ marked: 0, total: 25 });
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
    expect(square.markedById).toBe(square.markedBy === 'Ben' ? g.ids.ben : g.ids.cal);
    const credit = (await view(g.ana, g.id)).scores.filter((x) => x.spotted > 0);
    expect(credit).toHaveLength(1);
  });

  test('bingo is recorded and announced exactly once, even when two lines finish together', async () => {
    const g = await playing();
    const v = await view(g.ben, g.id);
    for (const pos of [0, 1, 2, 3, 5, 10, 15]) await call(g.ben, 'POST', `/api/squares/${squareAt(v, g.ids.ana, pos)}/mark`);
    // pos 4 finishes the top row, pos 20 the left column, at the same moment
    await Promise.all([
      call(g.ben, 'POST', `/api/squares/${squareAt(v, g.ids.ana, 4)}/mark`),
      call(g.cal, 'POST', `/api/squares/${squareAt(v, g.ids.ana, 20)}/mark`),
    ]);
    await settle();
    expect(pushes.filter((p) => p.title === 'BINGO!')).toHaveLength(1);
    expect(pushes.filter((p) => p.title.startsWith('You got BINGO'))).toEqual([
      expect.objectContaining({ to: 'ExponentPushToken[Ana-device-0001]' }),
    ]);
    const after = await view(g.cal, g.id);
    expect(after.boards[g.ids.ana].bingoAt).not.toBeNull();
    expect(after.players.find((p) => p.id === g.ids.ana)!.progress!.best).toBe(5);
    expect(after.scores.find((s) => s.name === 'Ben')!.spotted).toBe(8);
    expect(after.scores.find((s) => s.name === 'Cal')!.spotted).toBe(1);
    // Ben and Cal each wrote some of those nine lines
    const written = after.scores.filter((s) => s.name !== 'Ana').reduce((n, s) => n + s.written, 0);
    expect(written).toBe(9);
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
    for (let pos = 0; pos < 25; pos++) await call(g.ben, 'POST', `/api/squares/${squareAt(v, g.ids.ana, pos)}/mark`);
    await settle();
    expect(pushes.filter((p) => p.title.startsWith('Blackout'))).toHaveLength(1);
    const cal = await view(g.cal, g.id);
    expect(cal.boards[g.ids.ana].blackoutAt).not.toBeNull();
    for (const s of cal.boards[g.ids.ana].squares) expect(['Ben', 'Cal']).toContain(s.writer);
    // Boards that aren't finished keep their writers secret.
    for (const s of cal.boards[g.ids.ben].squares) expect(s.writer).toBeNull();
    // A blacked-out board is done: squares can't be undone, so it never reads "8/9 · Blacked out".
    expect((await call(g.cal, 'POST', `/api/squares/${squareAt(cal, g.ids.ana, 0)}/unmark`)).status).toBe(400);
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

  test('a late joiner collects lines and gets a board dealt once there are enough', async () => {
    const g = await playing();
    const dee = await signIn('Dee');
    await call(dee, 'POST', `/api/join/${g.code}`);
    const deeId = (await view(dee, g.id)).players.find((p) => p.isMe)!.id;
    expect((await view(g.ben, g.id)).players.find((p) => p.id === deeId)).toMatchObject({ needsLines: true, round: 0 });
    // Ben's board is still going, so nobody can add lines about him.
    expect((await call(g.cal, 'POST', `/api/games/${g.id}/phrases`, { target: g.ids.ben, text: 'new-ben' })).status).toBe(409);
    for (let i = 0; i < 25; i++) {
      const r = await call(i % 2 ? g.ben : g.cal, 'POST', `/api/games/${g.id}/phrases`, { target: deeId, text: `about-dee-${i}` });
      expect(r.status).toBe(200);
    }
    await settle();
    expect(pushes.filter((p) => p.title === 'Dee has a new board')).toHaveLength(3);
    const ben = await view(g.ben, g.id);
    expect(ben.players.find((p) => p.id === deeId)).toMatchObject({ needsLines: false, round: 1, hasBoard: true });
    expect(ben.boards[deeId].squares).toHaveLength(25);
    const mine = await call(dee, 'GET', `/api/games/${g.id}`);
    expect(mine.text).not.toContain('about-dee');
    expect(mine.data.myMarks).toEqual(Array(25).fill(false));
  });

  test('after a blackout the next board is dealt from new lines only', async () => {
    const g = await playing();
    let v = await view(g.ben, g.id);
    for (let pos = 0; pos < 25; pos++) await call(g.ben, 'POST', `/api/squares/${squareAt(v, g.ids.ana, pos)}/mark`);
    const ana = await view(g.ana, g.id);
    expect(ana.players.find((p) => p.isMe)).toMatchObject({ needsLines: true, round: 1, poolCount: 1 });
    expect(ana.myMarks).toEqual(Array(25).fill(true));
    expect(JSON.stringify(ana)).not.toContain('about-ana');
    const firstBoard = new Set(v.boards[g.ids.ana].squares.map((s) => s.text));
    // One line was left over from the first deal; 24 more make 25.
    for (let i = 0; i < 24; i++) await call(g.cal, 'POST', `/api/games/${g.id}/phrases`, { target: g.ids.ana, text: `round2-ana-${i}` });
    v = await view(g.ben, g.id);
    expect(v.players.find((p) => p.id === g.ids.ana)).toMatchObject({ round: 2, needsLines: false });
    for (const s of v.boards[g.ids.ana].squares) expect(firstBoard.has(s.text)).toBe(false);
    expect(v.scores.find((s) => s.id === g.ids.ana)!.boards).toBe(1);
    // Ana can still look back at the board that blacked out.
    expect((await call(g.ana, 'GET', `/api/games/${g.id}/mine`)).text).toContain('about-ana');
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
    expect(v.boards[g.ids.cal].squares).toHaveLength(25);
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

describe('keeping it friendly', () => {
  const slur = atob(BLOCKLIST).split(',')[0];

  test('hateful lines, names and game names are refused', async () => {
    const g = await setUp();
    const r = await call(g.ben, 'POST', `/api/games/${g.id}/phrases`, { target: g.ids.ana, text: `always says ${slur}` });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/friendly/);
    expect((await call(g.ben, 'PUT', '/api/me', { name: slur })).status).toBe(400);
    expect((await call(g.ben, 'POST', '/api/games', { name: `${slur} club` })).status).toBe(400);
  });

  test('a reported line disappears for everyone and is kept for review', async () => {
    const g = await setUp();
    const line = (await view(g.cal, g.id)).pools[g.ids.ana].find((p) => !p.mine)!; // Ben's line about Ana
    expect((await call(g.ana, 'POST', `/api/phrases/${line.id}/report`)).status).toBe(404); // Ana can't see it
    expect((await call(g.ben, 'POST', `/api/phrases/${line.id}/report`)).status).toBe(400); // Ben wrote it
    const r = await call(g.cal, 'POST', `/api/phrases/${line.id}/report`, { reason: 'mean' });
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(line.text);
    expect((await call(g.ben, 'GET', `/api/games/${g.id}`)).text).not.toContain(line.text);
    // It no longer counts toward Ana's pool, so the deal waits for a replacement.
    expect((await view(g.ana, g.id)).players.find((p) => p.isMe)!.poolCount).toBe(25); // 26 minus the reported one
    expect((await call(g.ana, 'POST', `/api/games/${g.id}/start`)).status).toBe(200);
    const report = await env.DB.prepare('SELECT reporter, author, text, reason FROM reports').first();
    expect(report).toEqual({ reporter: 'cal@example.com', author: 'ben@example.com', text: line.text, reason: 'mean' });
  });

  test('a line reported mid-game shows as removed on the board', async () => {
    const g = await setUp();
    await call(g.ana, 'POST', `/api/games/${g.id}/start`);
    const sq = (await view(g.ben, g.id)).boards[g.ids.ana].squares[0];
    const phrase = await env.DB.prepare('SELECT phrase_id FROM squares WHERE id = ?').bind(sq.id).first<{ phrase_id: string }>();
    const author = await env.DB.prepare('SELECT m.email FROM phrases p JOIN members m ON m.id = p.author WHERE p.id = ?').bind(phrase!.phrase_id).first<{ email: string }>();
    const reporter = author!.email === 'ben@example.com' ? g.cal : g.ben;
    const r = await call(reporter, 'POST', `/api/phrases/${phrase!.phrase_id}/report`);
    expect(r.data.boards[g.ids.ana].squares[0].text).toBe('Removed after a report');
    expect(r.text).not.toContain(`"${sq.text}"`); // quoted: "…-1" is also the start of "…-10"
  });

  test('leaving a game takes you and your board out', async () => {
    const g = await setUp();
    expect((await call(g.cal, 'POST', `/api/games/${g.id}/leave`)).status).toBe(200);
    expect((await call(g.cal, 'GET', `/api/games/${g.id}`)).status).toBe(404);
    expect((await view(g.ana, g.id)).players.map((p) => p.name).sort()).toEqual(['Ana', 'Ben']);
    // Leaving isn't a ban: the code still works.
    expect((await call(g.cal, 'POST', `/api/join/${g.code}`)).status).toBe(200);
  });

  test('only the owner removes people, and removed people stay out', async () => {
    const g = await setUp();
    expect((await call(g.ben, 'POST', `/api/games/${g.id}/remove`, { player: g.ids.cal })).status).toBe(403);
    expect((await call(g.ana, 'POST', `/api/games/${g.id}/remove`, { player: g.ids.ana })).status).toBe(400);
    const r = await call(g.ana, 'POST', `/api/games/${g.id}/remove`, { player: g.ids.cal });
    expect(r.data.players.map((p: { name: string }) => p.name).sort()).toEqual(['Ana', 'Ben']);
    expect((await call(g.cal, 'POST', `/api/join/${g.code}`)).data.error).toMatch(/can’t join/);
  });

  test('blocking: you leave, and neither of you can join the other’s games', async () => {
    const g = await setUp();
    expect((await call(g.cal, 'POST', `/api/games/${g.id}/block`, { player: g.ids.ben })).status).toBe(200);
    expect((await call(g.cal, 'GET', `/api/games/${g.id}`)).status).toBe(404);
    expect((await call(g.cal, 'POST', `/api/join/${g.code}`)).status).toBe(403);
    // Cal starts a new game: Ben can't get in, Ana can.
    const { data: { id } } = await call(g.cal, 'POST', '/api/games', { name: 'No Ben' });
    const { code } = await view(g.cal, id);
    expect((await call(g.ben, 'POST', `/api/join/${code}`)).status).toBe(403);
    expect((await call(g.ana, 'POST', `/api/join/${code}`)).status).toBe(200);
    // Unblocking lets Ben in.
    const blocks = (await call(g.cal, 'GET', '/api/blocks')).data;
    expect(blocks).toEqual([{ id: expect.any(String), name: 'Ben' }]);
    expect((await call(g.ben, 'DELETE', `/api/blocks/${blocks[0].id}`)).status).toBe(200); // not Ben's to undo
    expect((await call(g.ben, 'POST', `/api/join/${code}`)).status).toBe(403);
    await call(g.cal, 'DELETE', `/api/blocks/${blocks[0].id}`);
    expect((await call(g.ben, 'POST', `/api/join/${code}`)).status).toBe(200);
  });
});
