// Games, pools, boards and marks. Every read is built for the person asking: their own pool
// and their own board's squares never leave this file, only counts about them do.

import type { Env } from './env';
import type { Board, GameSummary, GameView, Phrase, Player, Progress, Score, Square } from '../../shared/types';
import { CODE_ALPHABET, MAX_PHRASE, bestLine, deal, freePos, hasBingo, isBlackout, isSize, phrasesNeeded, type Size } from '../../shared/logic';
import { pushTo, type Push } from './push';
import { NOT_ALLOWED, isHateful } from './filter';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_NAME = 40;
const MAX_POOL = 60; // phrases per person per game
const REMOVED = 'Removed after a report';

interface GameRow { id: string; code: string; name: string; owner: string; status: 'writing' | 'playing'; size: number; created_at: number }
interface MemberRow { id: string; game_id: string; email: string; joined_at: number }

// Work to finish after the response is sent (push notifications).
export type Later = (p: Promise<unknown>) => void;

const id = () => crypto.randomUUID();

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function cleanText(text: unknown, max: number): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------- games ----------

export async function createGame(env: Env, email: string, body: { name?: unknown; size?: unknown }): Promise<{ id: string }> {
  const name = cleanText(body.name, MAX_NAME);
  if (!name) throw new HttpError(400, 'Give the game a name');
  if (isHateful(name)) throw new HttpError(400, NOT_ALLOWED);
  const size = body.size === undefined ? 5 : Number(body.size);
  if (!isSize(size)) throw new HttpError(400, 'Boards are 3×3, 4×4 or 5×5');
  const gameId = id();
  const memberId = id();
  const now = Date.now();
  // A clash on the invite code is vanishingly rare; try again with a new one.
  for (let attempt = 0; ; attempt++) {
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO games (id, code, name, owner, status, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(gameId, newCode(), name, memberId, 'writing', size, now),
        env.DB.prepare('INSERT INTO members (id, game_id, email, joined_at) VALUES (?, ?, ?, ?)').bind(memberId, gameId, email, now),
      ]);
      return { id: gameId };
    } catch (err) {
      if (attempt >= 4 || !String(err).includes('UNIQUE')) throw err;
    }
  }
}

export async function listGames(env: Env, email: string): Promise<GameSummary[]> {
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.name, g.code, g.status, g.created_at AS createdAt,
            (SELECT COUNT(*) FROM members m2 WHERE m2.game_id = g.id) AS players
       FROM games g JOIN members m ON m.game_id = g.id
      WHERE m.email = ? ORDER BY g.created_at DESC`,
  ).bind(email).all<GameSummary>();
  return results;
}

export async function joinGame(env: Env, email: string, code: string): Promise<{ id: string }> {
  const game = await env.DB.prepare('SELECT id FROM games WHERE code = ?').bind(code.toUpperCase()).first<{ id: string }>();
  if (!game) throw new HttpError(404, 'No game with that code');
  // Removed from this game, or blocked by (or blocking) someone in it: no way in. The
  // message doesn't say which, so nobody learns who blocked them.
  const barred = await env.DB.prepare(
    `SELECT 1 FROM bans WHERE game_id = ?1 AND email = ?2
     UNION ALL
     SELECT 1 FROM blocks b JOIN members m ON m.game_id = ?1
      WHERE (b.blocker = m.email AND b.blocked = ?2) OR (b.blocker = ?2 AND b.blocked = m.email)
     LIMIT 1`,
  ).bind(game.id, email).first();
  const already = await env.DB.prepare('SELECT 1 FROM members WHERE game_id = ? AND email = ?').bind(game.id, email).first();
  if (barred && !already) throw new HttpError(403, 'You can’t join this game');
  await env.DB.prepare('INSERT INTO members (id, game_id, email, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT (game_id, email) DO NOTHING')
    .bind(id(), game.id, email, Date.now()).run();
  return { id: game.id };
}

// The game and the asker's membership, or a 404 (not a member looks the same as no game).
export async function membership(env: Env, gameId: string, email: string): Promise<{ game: GameRow; me: MemberRow }> {
  const [game, me] = await Promise.all([
    env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first<GameRow>(),
    env.DB.prepare('SELECT * FROM members WHERE game_id = ? AND email = ?').bind(gameId, email).first<MemberRow>(),
  ]);
  if (!game || !me) throw new HttpError(404, 'Game not found');
  return { game, me };
}

// ---------- the view of a game for one person ----------

interface SquareRow {
  id: string; pos: number; free: number; marked_by: string | null; marked_at: number | null; phrase_id: string | null;
  board_id: string; target: string; bingo_at: number | null; blackout_at: number | null;
  text: string | null; author: string | null; removed: number | null;
}

export async function gameView(env: Env, gameId: string, email: string): Promise<GameView> {
  const { game, me } = await membership(env, gameId, email);
  const size = game.size as Size;
  const [members, counts, pool, squares] = await Promise.all([
    env.DB.prepare(
      `SELECT m.id, m.joined_at, u.name FROM members m LEFT JOIN users u ON u.email = m.email
        WHERE m.game_id = ? ORDER BY m.joined_at`,
    ).bind(gameId).all<{ id: string; joined_at: number; name: string | null }>(),
    env.DB.prepare('SELECT target, COUNT(*) AS n FROM phrases WHERE game_id = ? AND removed = 0 GROUP BY target')
      .bind(gameId).all<{ target: string; n: number }>(),
    // Never the asker's own pool.
    game.status === 'writing'
      ? env.DB.prepare('SELECT id, target, author, text FROM phrases WHERE game_id = ? AND target != ? AND removed = 0 ORDER BY created_at')
        .bind(gameId, me.id).all<{ id: string; target: string; author: string | null; text: string }>()
      : null,
    game.status === 'playing'
      ? env.DB.prepare(
        `SELECT s.id, s.pos, s.free, s.marked_by, s.marked_at, s.phrase_id, b.id AS board_id, b.target, b.bingo_at, b.blackout_at,
                p.text, p.author, p.removed
           FROM boards b JOIN squares s ON s.board_id = b.id LEFT JOIN phrases p ON p.id = s.phrase_id
          WHERE b.game_id = ? ORDER BY s.pos`,
      ).bind(gameId).all<SquareRow>()
      : null,
  ]);

  const names = new Map(members.results.map((m, i) => [m.id, m.name || `Player ${i + 1}`]));
  const poolCount = new Map(counts.results.map((c) => [c.target, c.n]));

  // Group squares by board; the asker's own board is reduced to counts below.
  const byTarget = new Map<string, SquareRow[]>();
  for (const s of squares?.results ?? []) {
    if (!byTarget.has(s.target)) byTarget.set(s.target, []);
    byTarget.get(s.target)!.push(s);
  }

  const progress = (rows: SquareRow[] | undefined): Progress | null => {
    if (!rows?.length) return null;
    const marked = markedList(rows, size);
    return {
      marked: rows.filter((r) => r.marked_at && !r.free).length,
      total: rows.filter((r) => !r.free).length,
      best: bestLine(marked, size),
      bingoAt: rows[0].bingo_at,
      blackoutAt: rows[0].blackout_at,
    };
  };

  const players: Player[] = members.results.map((m) => ({
    id: m.id,
    name: names.get(m.id)!,
    isMe: m.id === me.id,
    isOwner: m.id === game.owner,
    poolCount: poolCount.get(m.id) ?? 0,
    hasBoard: byTarget.has(m.id),
    progress: progress(byTarget.get(m.id)),
  }));

  const pools: Record<string, Phrase[]> = {};
  for (const p of pool?.results ?? []) {
    (pools[p.target] ??= []).push({ id: p.id, text: p.text, mine: p.author === me.id });
  }

  const boards: Record<string, Board> = {};
  for (const [target, rows] of byTarget) {
    if (target === me.id) continue;
    const done = !!rows[0].blackout_at;
    boards[target] = {
      target,
      bingoAt: rows[0].bingo_at,
      blackoutAt: rows[0].blackout_at,
      squares: rows.map((r): Square => ({
        id: r.id,
        pos: r.pos,
        text: r.free ? null : r.removed ? REMOVED : r.text,
        phraseId: r.free || r.removed ? null : r.phrase_id,
        free: !!r.free,
        markedAt: r.marked_at,
        markedBy: r.marked_by ? names.get(r.marked_by) ?? null : null,
        markedById: r.marked_by,
        markedByMe: r.marked_by === me.id,
        // Who wrote each line stays a secret until the board is finished.
        writer: done && r.author ? names.get(r.author) ?? null : null,
      })),
    };
  }

  const scores: Score[] = players.map((p) => ({ id: p.id, name: p.name, spotted: 0, written: 0 }));
  const scoreOf = new Map(scores.map((s) => [s.id, s]));
  for (const s of squares?.results ?? []) {
    if (!s.marked_at || s.free) continue;
    if (s.marked_by) scoreOf.get(s.marked_by) && scoreOf.get(s.marked_by)!.spotted++;
    if (s.author) scoreOf.get(s.author) && scoreOf.get(s.author)!.written++;
  }

  return {
    id: game.id,
    name: game.name,
    code: game.code,
    status: game.status,
    size,
    needed: phrasesNeeded(size),
    me: me.id,
    isOwner: me.id === game.owner,
    players,
    pools,
    boards,
    scores,
  };
}

function markedList(rows: { pos: number; marked_at: number | null }[], size: Size): boolean[] {
  const marked = Array<boolean>(size * size).fill(false);
  for (const r of rows) marked[r.pos] = !!r.marked_at;
  return marked;
}

// ---------- writing ----------

export async function addPhrase(env: Env, gameId: string, email: string, body: { target?: unknown; text?: unknown }) {
  const { game, me } = await membership(env, gameId, email);
  if (game.status !== 'writing') throw new HttpError(409, 'The boards have already been dealt');
  const target = String(body.target ?? '');
  if (target === me.id) throw new HttpError(403, 'No peeking at your own board');
  const member = await env.DB.prepare('SELECT id FROM members WHERE id = ? AND game_id = ?').bind(target, gameId).first();
  if (!member) throw new HttpError(404, 'That person isn’t in this game');
  const text = cleanText(body.text, MAX_PHRASE);
  if (!text) throw new HttpError(400, 'Write something they say');
  if (isHateful(text)) throw new HttpError(400, NOT_ALLOWED);
  const { results } = await env.DB.prepare('SELECT text FROM phrases WHERE game_id = ? AND target = ? AND removed = 0')
    .bind(gameId, target).all<{ text: string }>();
  if (results.length >= MAX_POOL) throw new HttpError(409, 'That list is full');
  if (results.some((r) => r.text.toLowerCase() === text.toLowerCase())) throw new HttpError(409, 'Someone already wrote that one');
  await env.DB.prepare('INSERT INTO phrases (id, game_id, target, author, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id(), gameId, target, me.id, text, Date.now()).run();
}

export async function deletePhrase(env: Env, phraseId: string, email: string): Promise<{ gameId: string }> {
  const phrase = await env.DB.prepare('SELECT game_id, author FROM phrases WHERE id = ?').bind(phraseId).first<{ game_id: string; author: string }>();
  if (!phrase) throw new HttpError(404, 'Not found');
  const { game, me } = await membership(env, phrase.game_id, email);
  if (phrase.author !== me.id) throw new HttpError(403, 'You can only delete your own lines');
  if (game.status !== 'writing') throw new HttpError(409, 'The boards have already been dealt');
  await env.DB.prepare('DELETE FROM phrases WHERE id = ?').bind(phraseId).run();
  return { gameId: game.id };
}

// ---------- dealing the boards ----------

export async function startGame(env: Env, gameId: string, email: string, body: { size?: unknown }, later: Later) {
  const { game, me } = await membership(env, gameId, email);
  if (me.id !== game.owner) throw new HttpError(403, 'Only the person who made the game can deal the boards');
  if (game.status !== 'writing') throw new HttpError(409, 'The boards have already been dealt');
  const size = body.size === undefined ? game.size : Number(body.size);
  if (!isSize(size)) throw new HttpError(400, 'Boards are 3×3, 4×4 or 5×5');

  const [members, phrases] = await Promise.all([
    env.DB.prepare('SELECT id, email FROM members WHERE game_id = ?').bind(gameId).all<{ id: string; email: string }>(),
    env.DB.prepare('SELECT id, target FROM phrases WHERE game_id = ? AND removed = 0').bind(gameId).all<{ id: string; target: string }>(),
  ]);
  if (members.results.length < 2) throw new HttpError(409, 'Invite at least one friend first');
  const needed = phrasesNeeded(size);
  const short = members.results.filter((m) => phrases.results.filter((p) => p.target === m.id).length < needed);
  if (short.length) throw new HttpError(409, `${short.length === 1 ? 'Someone needs' : `${short.length} people need`} more lines first`);

  const now = Date.now();
  const free = freePos(size);
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('UPDATE games SET status = ?, size = ? WHERE id = ?').bind('playing', size, gameId),
  ];
  for (const m of members.results) {
    const boardId = id();
    // boards has UNIQUE (game_id, target): if two starts race, the second batch fails whole.
    stmts.push(env.DB.prepare('INSERT INTO boards (id, game_id, target) VALUES (?, ?, ?)').bind(boardId, gameId, m.id));
    const picked = deal(phrases.results.filter((p) => p.target === m.id), needed, secureRandom);
    let next = 0;
    for (let pos = 0; pos < size * size; pos++) {
      stmts.push(pos === free
        ? env.DB.prepare('INSERT INTO squares (id, board_id, pos, phrase_id, free, marked_at) VALUES (?, ?, ?, NULL, 1, ?)').bind(id(), boardId, pos, now)
        : env.DB.prepare('INSERT INTO squares (id, board_id, pos, phrase_id) VALUES (?, ?, ?, ?)').bind(id(), boardId, pos, picked[next++].id));
    }
  }
  try {
    await env.DB.batch(stmts);
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new HttpError(409, 'The boards have already been dealt');
    throw err;
  }
  later(pushTo(env, members.results.filter((m) => m.id !== me.id).map((m) => m.email), {
    title: 'Boards are live 🎲',
    body: `${game.name}: start listening.`,
    data: { gameId, url: `/game/${gameId}` },
  }));
}

function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

// ---------- crossing off ----------

// Mark (`on`) or unmark a square. These are set operations, not toggles: two people
// tapping the same square at once leaves it crossed off once. Bingo and blackout are
// recorded only the first time (conditional updates), so each is announced exactly once.
export async function setMark(env: Env, squareId: string, email: string, on: boolean, later: Later): Promise<{ gameId: string }> {
  const sq = await env.DB.prepare(
    `SELECT s.free, b.id AS board_id, b.target, b.game_id FROM squares s JOIN boards b ON b.id = s.board_id WHERE s.id = ?`,
  ).bind(squareId).first<{ free: number; board_id: string; target: string; game_id: string }>();
  if (!sq) throw new HttpError(404, 'Not found');
  const { game, me } = await membership(env, sq.game_id, email);
  if (sq.target === me.id) throw new HttpError(404, 'Not found'); // your own board doesn't exist, as far as you know
  if (sq.free) throw new HttpError(400, 'That’s the free square');
  const now = Date.now();

  if (!on) {
    await env.DB.prepare('UPDATE squares SET marked_by = NULL, marked_at = NULL WHERE id = ? AND free = 0').bind(squareId).run();
    return { gameId: game.id };
  }

  const res = await env.DB.prepare('UPDATE squares SET marked_by = ?, marked_at = ? WHERE id = ? AND marked_at IS NULL')
    .bind(me.id, now, squareId).run();
  if (!res.meta.changes) return { gameId: game.id }; // someone beat us to it

  const size = game.size as Size;
  const { results } = await env.DB.prepare('SELECT pos, marked_at FROM squares WHERE board_id = ?').bind(sq.board_id).all<{ pos: number; marked_at: number | null }>();
  const marked = markedList(results, size);
  const news: Push[] = [];
  const toTarget: Push[] = [];
  const targetName = (await env.DB.prepare('SELECT u.name FROM members m LEFT JOIN users u ON u.email = m.email WHERE m.id = ?')
    .bind(sq.target).first<{ name: string | null }>())?.name || 'Someone';
  const data = { gameId: game.id, url: `/game/${game.id}` };

  if (hasBingo(marked, size)) {
    const first = await env.DB.prepare('UPDATE boards SET bingo_at = ? WHERE id = ? AND bingo_at IS NULL').bind(now, sq.board_id).run();
    if (first.meta.changes) {
      news.push({ title: 'BINGO! 🎉', body: `${targetName} just got BINGO’d in ${game.name}.`, data });
      toTarget.push({ title: 'You got BINGO’d 😳', body: `Your friends crossed off a whole line in ${game.name}.`, data });
    }
  }
  if (isBlackout(marked, size)) {
    const first = await env.DB.prepare('UPDATE boards SET blackout_at = ? WHERE id = ? AND blackout_at IS NULL').bind(now, sq.board_id).run();
    if (first.meta.changes) {
      news.push({ title: 'Blackout! 🖤', body: `Every square on ${targetName}’s board is gone. See who wrote what.`, data });
      toTarget.push({ title: 'Your board is blacked out 🖤', body: `You said all of it. Open ${game.name} to see your board.`, data });
    }
  }
  if (news.length) {
    const { results: members } = await env.DB.prepare('SELECT id, email FROM members WHERE game_id = ?').bind(game.id).all<{ id: string; email: string }>();
    const others = members.filter((m) => m.id !== me.id && m.id !== sq.target).map((m) => m.email);
    const target = members.filter((m) => m.id === sq.target).map((m) => m.email);
    later((async () => {
      for (const p of news) await pushTo(env, others, p);
      for (const p of toTarget) await pushTo(env, target, p);
    })());
  }
  return { gameId: game.id };
}

// ---------- your own board, once it's finished ----------

// After a blackout there's nothing left to protect, so the target may see their board.
export async function ownBoard(env: Env, gameId: string, email: string): Promise<Board> {
  const { me } = await membership(env, gameId, email);
  const board = await env.DB.prepare('SELECT id, bingo_at, blackout_at FROM boards WHERE game_id = ? AND target = ?')
    .bind(gameId, me.id).first<{ id: string; bingo_at: number | null; blackout_at: number | null }>();
  if (!board?.blackout_at) throw new HttpError(403, 'Not until your board is blacked out');
  const view = await gameView(env, gameId, email);
  const names = new Map(view.players.map((p) => [p.id, p.name]));
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.pos, s.free, s.marked_by, s.marked_at, s.phrase_id, p.text, p.author, p.removed
       FROM squares s LEFT JOIN phrases p ON p.id = s.phrase_id WHERE s.board_id = ? ORDER BY s.pos`,
  ).bind(board.id).all<{ id: string; pos: number; free: number; marked_by: string | null; marked_at: number | null; phrase_id: string | null; text: string | null; author: string | null; removed: number | null }>();
  return {
    target: me.id,
    bingoAt: board.bingo_at,
    blackoutAt: board.blackout_at,
    squares: results.map((r) => ({
      id: r.id,
      pos: r.pos,
      text: r.free ? null : r.removed ? REMOVED : r.text,
      phraseId: null, // your own board: nothing to report
      free: !!r.free,
      markedAt: r.marked_at,
      markedBy: r.marked_by ? names.get(r.marked_by) ?? null : null,
      markedById: r.marked_by,
      markedByMe: false,
      writer: r.author ? names.get(r.author) ?? null : null,
    })),
  };
}

// ---------- account deletion ----------

// Statements that take one member out of their game. Their own pool and board go; lines
// they wrote about friends and squares they crossed off stay (anonymous), so friends'
// boards keep working. The game passes to whoever joined next, and a game nobody is left
// in is deleted.
export function leaveStatements(env: Env, m: { id: string; game_id: string }): D1PreparedStatement[] {
  return [
    env.DB.prepare('DELETE FROM squares WHERE board_id IN (SELECT id FROM boards WHERE target = ?)').bind(m.id),
    env.DB.prepare('DELETE FROM boards WHERE target = ?').bind(m.id),
    env.DB.prepare('DELETE FROM phrases WHERE target = ?').bind(m.id),
    env.DB.prepare('UPDATE phrases SET author = NULL WHERE author = ?').bind(m.id),
    env.DB.prepare('UPDATE squares SET marked_by = NULL WHERE marked_by = ?').bind(m.id),
    env.DB.prepare('DELETE FROM members WHERE id = ?').bind(m.id),
    env.DB.prepare(
      `UPDATE games SET owner = COALESCE((SELECT id FROM members WHERE game_id = ?1 ORDER BY joined_at LIMIT 1), owner)
        WHERE id = ?1 AND owner = ?2`,
    ).bind(m.game_id, m.id),
    env.DB.prepare('DELETE FROM squares WHERE board_id IN (SELECT id FROM boards WHERE game_id = ?1) AND NOT EXISTS (SELECT 1 FROM members WHERE game_id = ?1)').bind(m.game_id),
    env.DB.prepare('DELETE FROM boards WHERE game_id = ?1 AND NOT EXISTS (SELECT 1 FROM members WHERE game_id = ?1)').bind(m.game_id),
    env.DB.prepare('DELETE FROM phrases WHERE game_id = ?1 AND NOT EXISTS (SELECT 1 FROM members WHERE game_id = ?1)').bind(m.game_id),
    env.DB.prepare('DELETE FROM bans WHERE game_id = ?1 AND NOT EXISTS (SELECT 1 FROM members WHERE game_id = ?1)').bind(m.game_id),
    env.DB.prepare('DELETE FROM games WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM members WHERE game_id = ?1)').bind(m.game_id),
  ];
}

// Removes a person from every game and forgets them.
export async function deleteAccount(env: Env, email: string) {
  const { results: mine } = await env.DB.prepare('SELECT id, game_id FROM members WHERE email = ?').bind(email).all<{ id: string; game_id: string }>();
  await env.DB.batch([
    ...mine.flatMap((m) => leaveStatements(env, m)),
    env.DB.prepare('DELETE FROM sessions WHERE owner = ?').bind(email),
    env.DB.prepare('DELETE FROM devices WHERE email = ?').bind(email),
    env.DB.prepare('DELETE FROM blocks WHERE blocker = ?1 OR blocked = ?1').bind(email),
    env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email),
  ]);
}
