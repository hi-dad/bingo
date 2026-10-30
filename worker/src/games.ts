// Games, pools, boards and marks. Every read is built for the person asking: their own pool
// and their own board's squares never leave this file, only counts about them do.

import type { Env } from './env';
import type { ArchivedBoard, Board, FinishedBoard, GameSummary, GameView, Phrase, Player, Progress, Score, Square } from '../../shared/types';
import { CODE_ALPHABET, MAX_PHRASE, bestLine, deal, freePos, hasBingo, isBlackout, phrasesNeeded, type Size } from '../../shared/logic';
import { pushTo, type Push } from './push';
import { NOT_ALLOWED, isHateful } from './filter';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_NAME = 40;
const BOARD_SIZE: Size = 5;
const REMOVED = 'Removed after a report';
const RETIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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
  const size = BOARD_SIZE; // every board is 5×5; `body.size` from older app builds is ignored
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
    `SELECT g.id, g.name, g.code, g.status, g.size, g.created_at AS createdAt,
            (SELECT COUNT(*) FROM members m2 WHERE m2.game_id = g.id) AS players,
            (SELECT COUNT(*) FROM phrases p WHERE p.game_id = g.id AND p.target = m.id AND ${UNUSED}) AS ownPoolCount
       FROM games g JOIN members m ON m.game_id = g.id
      WHERE m.email = ? ORDER BY g.created_at DESC`,
  ).bind(email).all<Omit<GameSummary, 'round' | 'progress' | 'myMarks'>>();
  if (!results.length) return [];

  // The home screen gets only the crossed-off positions on the asker's latest board.
  // It never receives the board's lines, square ids, or writers.
  const boardRows = await env.DB.prepare(
    `SELECT b.game_id AS gameId, b.round, b.bingo_at AS bingoAt, b.blackout_at AS blackoutAt,
            s.pos, s.free, s.marked_at AS markedAt
       FROM members m
       JOIN boards b ON b.game_id = m.game_id AND b.target = m.id
       LEFT JOIN retired_boards rb ON rb.board_id = b.id
       JOIN squares s ON s.board_id = b.id
      WHERE m.email = ?
        AND b.round = (SELECT MAX(b2.round) FROM boards b2 WHERE b2.game_id = b.game_id AND b2.target = m.id)
        AND rb.board_id IS NULL
      ORDER BY b.game_id, s.pos`,
  ).bind(email).all<{
    gameId: string; round: number; bingoAt: number | null; blackoutAt: number | null;
    pos: number; free: number; markedAt: number | null;
  }>();
  const byGame = new Map<string, typeof boardRows.results>();
  for (const row of boardRows.results) (byGame.get(row.gameId) ?? byGame.set(row.gameId, []).get(row.gameId)!).push(row);

  return results.map((game): GameSummary => {
    const rows = byGame.get(game.id);
    if (!rows?.length) return { ...game, round: 0, progress: null, myMarks: null };
    const marks = markedList(rows.map((row) => ({ pos: row.pos, marked_at: row.markedAt })), game.size);
    return {
      ...game,
      round: rows[0].round,
      myMarks: marks,
      progress: {
        marked: rows.filter((row) => row.markedAt && !row.free).length,
        total: rows.filter((row) => !row.free).length,
        best: bestLine(marks, game.size),
        bingoAt: rows[0].bingoAt,
        blackoutAt: rows[0].blackoutAt,
        canRetire: !!rows[0].bingoAt && !rows[0].blackoutAt && Date.now() - rows[0].bingoAt >= RETIRE_AFTER_MS,
      },
    };
  });
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
  board_id: string; target: string; round: number; bingo_at: number | null; blackout_at: number | null;
  retired_at: number | null;
  text: string | null; author: string | null; removed: number | null;
}

// Lines not yet on any board. Each board uses fresh lines, so these are what the next board
// about someone gets dealt from.
const UNUSED = 'p.removed = 0 AND NOT EXISTS (SELECT 1 FROM squares s WHERE s.phrase_id = p.id)';

export async function gameView(env: Env, gameId: string, email: string): Promise<GameView> {
  const { game, me } = await membership(env, gameId, email);
  const size = game.size as Size;
  const [members, counts, pool, squares] = await Promise.all([
    env.DB.prepare(
      `SELECT m.id, m.joined_at, u.name FROM members m LEFT JOIN users u ON u.email = m.email
        WHERE m.game_id = ? ORDER BY m.joined_at`,
    ).bind(gameId).all<{ id: string; joined_at: number; name: string | null }>(),
    env.DB.prepare(`SELECT p.target, COUNT(*) AS n FROM phrases p WHERE p.game_id = ? AND ${UNUSED} GROUP BY p.target`)
      .bind(gameId).all<{ target: string; n: number }>(),
    // Never the asker's own pool.
    env.DB.prepare(`SELECT p.id, p.target, p.author, p.text FROM phrases p WHERE p.game_id = ? AND p.target != ? AND ${UNUSED} ORDER BY p.created_at`)
      .bind(gameId, me.id).all<{ id: string; target: string; author: string | null; text: string }>(),
    game.status === 'playing'
      ? env.DB.prepare(
        `SELECT s.id, s.pos, s.free, s.marked_by, s.marked_at, s.phrase_id, b.id AS board_id, b.target, b.round, b.bingo_at, b.blackout_at,
                rb.retired_at,
                p.text, p.author, p.removed
           FROM boards b JOIN squares s ON s.board_id = b.id
           LEFT JOIN retired_boards rb ON rb.board_id = b.id
           LEFT JOIN phrases p ON p.id = s.phrase_id
          WHERE b.game_id = ? ORDER BY s.pos`,
      ).bind(gameId).all<SquareRow>()
      : null,
  ]);

  const names = new Map(members.results.map((m, i) => [m.id, m.name || `Player ${i + 1}`]));
  const poolCount = new Map(counts.results.map((c) => [c.target, c.n]));

  // Each person's latest board (highest round); the asker's own is reduced to counts below.
  const latestByTarget = new Map<string, SquareRow[]>();
  const blackouts = new Map<string, number>();
  const bingos = new Map<string, number>();
  for (const s of squares?.results ?? []) {
    const cur = latestByTarget.get(s.target);
    if (!cur || cur[0].round < s.round) latestByTarget.set(s.target, [s]);
    else if (cur[0].round === s.round) cur.push(s);
    if (s.pos === 0 && s.blackout_at) blackouts.set(s.target, (blackouts.get(s.target) ?? 0) + 1);
    if (s.pos === 0 && s.bingo_at) bingos.set(s.target, (bingos.get(s.target) ?? 0) + 1);
  }
  const byTarget = new Map([...latestByTarget].filter(([, rows]) => !rows[0].retired_at));
  const needsLines = (target: string) => {
    const latest = latestByTarget.get(target)?.[0];
    return game.status === 'playing' && (!latest || !!latest.blackout_at || !!latest.retired_at);
  };

  const progress = (rows: SquareRow[] | undefined): Progress | null => {
    if (!rows?.length) return null;
    const marked = markedList(rows, size);
    return {
      marked: rows.filter((r) => r.marked_at && !r.free).length,
      total: rows.filter((r) => !r.free).length,
      best: bestLine(marked, size),
      bingoAt: rows[0].bingo_at,
      blackoutAt: rows[0].blackout_at,
      canRetire: !!rows[0].bingo_at && !rows[0].blackout_at && Date.now() - rows[0].bingo_at >= RETIRE_AFTER_MS,
    };
  };

  const players: Player[] = members.results.map((m) => ({
    id: m.id,
    name: names.get(m.id)!,
    isMe: m.id === me.id,
    isOwner: m.id === game.owner,
    poolCount: poolCount.get(m.id) ?? 0,
    hasBoard: latestByTarget.has(m.id),
    round: latestByTarget.get(m.id)?.[0].round ?? 0,
    needsLines: needsLines(m.id),
    progress: progress(byTarget.get(m.id)),
  }));

  // While playing, only people waiting on their next board can be written about.
  const pools: Record<string, Phrase[]> = {};
  for (const p of pool.results) {
    if (game.status === 'playing' && !needsLines(p.target)) continue;
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

  const scores: Score[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    bingos: bingos.get(p.id) ?? 0,
    blackouts: blackouts.get(p.id) ?? 0,
    spotted: 0,
    written: 0,
  }));
  const scoreOf = new Map(scores.map((s) => [s.id, s]));
  for (const s of squares?.results ?? []) {
    if (!s.marked_at || s.free) continue;
    if (s.marked_by) scoreOf.get(s.marked_by) && scoreOf.get(s.marked_by)!.spotted++;
    if (s.author) scoreOf.get(s.author) && scoreOf.get(s.author)!.written++;
  }
  const finishedBoards: FinishedBoard[] = (squares?.results ?? [])
    .filter((s) => s.pos === 0 && !!s.blackout_at)
    .map((s) => ({
      id: s.board_id,
      target: s.target,
      name: names.get(s.target) ?? 'Player',
      round: s.round,
      blackoutAt: s.blackout_at!,
      mine: s.target === me.id,
    }))
    .sort((a, b) => b.blackoutAt - a.blackoutAt);

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
    // Where your own board is crossed off, by position only: never the lines themselves.
    myMarks: byTarget.has(me.id) ? markedList(byTarget.get(me.id)!, size) : null,
    scores,
    finishedBoards,
  };
}

function markedList(rows: { pos: number; marked_at: number | null }[], size: Size): boolean[] {
  const marked = Array<boolean>(size * size).fill(false);
  for (const r of rows) marked[r.pos] = !!r.marked_at;
  return marked;
}

// ---------- writing ----------

export async function addPhrase(env: Env, gameId: string, email: string, body: { target?: unknown; text?: unknown }, later: Later) {
  const { game, me } = await membership(env, gameId, email);
  const target = String(body.target ?? '');
  if (target === me.id) throw new HttpError(403, 'No peeking at your own board');
  const member = await env.DB.prepare('SELECT id FROM members WHERE id = ? AND game_id = ?').bind(target, gameId).first();
  if (!member) throw new HttpError(404, 'That person isn’t in this game');
  if (game.status === 'playing' && !(await waitingForBoard(env, gameId, target))) {
    throw new HttpError(409, 'Their board is still going. You can write more once it’s blacked out');
  }
  const text = cleanText(body.text, MAX_PHRASE);
  if (!text) throw new HttpError(400, 'Write something they say');
  if (isHateful(text)) throw new HttpError(400, NOT_ALLOWED);
  // Duplicates are checked against every round, so a later board never repeats a line.
  const { results } = await env.DB.prepare(
    `SELECT p.text, ${UNUSED} AS unused FROM phrases p WHERE p.game_id = ? AND p.target = ? AND p.removed = 0`,
  ).bind(gameId, target).all<{ text: string; unused: number }>();
  if (results.filter((r) => r.unused).length >= phrasesNeeded(game.size as Size)) throw new HttpError(409, 'That board already has 25 lines');
  if (results.some((r) => r.text.toLowerCase() === text.toLowerCase())) throw new HttpError(409, 'Someone already wrote that one');
  // Keep the 25-line cap inside the insert so two simultaneous last lines cannot make 26.
  const inserted = await env.DB.prepare(
    `INSERT INTO phrases (id, game_id, target, author, text, created_at)
     SELECT ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM phrases p WHERE p.game_id = ? AND p.target = ? AND ${UNUSED}) < ?`,
  ).bind(id(), gameId, target, me.id, text, Date.now(), gameId, target, phrasesNeeded(game.size as Size)).run();
  if (!inserted.meta.changes) throw new HttpError(409, 'That board already has 25 lines');
  if (game.status === 'playing') await dealNext(env, game, target, later);
  else await dealFirstBoards(env, game, me.id, later, false);
}

// Playing, and this person has no board going: none yet (joined late) or their last one blacked out.
async function waitingForBoard(env: Env, gameId: string, target: string): Promise<boolean> {
  const latest = await env.DB.prepare(
    `SELECT b.blackout_at, rb.retired_at FROM boards b LEFT JOIN retired_boards rb ON rb.board_id = b.id
      WHERE b.game_id = ? AND b.target = ? ORDER BY b.round DESC LIMIT 1`,
  ).bind(gameId, target).first<{ blackout_at: number | null; retired_at: number | null }>();
  return !latest || !!latest.blackout_at || !!latest.retired_at;
}

// Rewrite a line you wrote, until it's on a board.
export async function editPhrase(env: Env, phraseId: string, email: string, body: { text?: unknown }): Promise<{ gameId: string }> {
  const phrase = await env.DB.prepare('SELECT game_id, target, author FROM phrases WHERE id = ? AND removed = 0')
    .bind(phraseId).first<{ game_id: string; target: string; author: string }>();
  if (!phrase) throw new HttpError(404, 'Not found');
  const { game, me } = await membership(env, phrase.game_id, email);
  if (phrase.author !== me.id) throw new HttpError(403, 'You can only edit your own lines');
  const used = await env.DB.prepare('SELECT 1 FROM squares WHERE phrase_id = ?').bind(phraseId).first();
  if (used) throw new HttpError(409, 'That line is already on a board');
  const text = cleanText(body.text, MAX_PHRASE);
  if (!text) throw new HttpError(400, 'Write something they say');
  if (isHateful(text)) throw new HttpError(400, NOT_ALLOWED);
  const clash = await env.DB.prepare('SELECT 1 FROM phrases WHERE game_id = ? AND target = ? AND id != ? AND removed = 0 AND lower(text) = lower(?)')
    .bind(game.id, phrase.target, phraseId, text).first();
  if (clash) throw new HttpError(409, 'Someone already wrote that one');
  await env.DB.prepare('UPDATE phrases SET text = ? WHERE id = ?').bind(text, phraseId).run();
  return { gameId: game.id };
}

export async function deletePhrase(env: Env, phraseId: string, email: string): Promise<{ gameId: string }> {
  const phrase = await env.DB.prepare('SELECT game_id, author FROM phrases WHERE id = ?').bind(phraseId).first<{ game_id: string; author: string }>();
  if (!phrase) throw new HttpError(404, 'Not found');
  const { game, me } = await membership(env, phrase.game_id, email);
  if (phrase.author !== me.id) throw new HttpError(403, 'You can only delete your own lines');
  const used = await env.DB.prepare('SELECT 1 FROM squares WHERE phrase_id = ?').bind(phraseId).first();
  if (used) throw new HttpError(409, 'That line is already on a board');
  await env.DB.prepare('DELETE FROM phrases WHERE id = ?').bind(phraseId).run();
  return { gameId: game.id };
}

// ---------- dealing the boards ----------

export async function startGame(env: Env, gameId: string, email: string, body: { size?: unknown }, later: Later) {
  const { game, me } = await membership(env, gameId, email);
  await dealFirstBoards(env, game, me.id, later, true);
}

// The last line that makes every pool complete deals the first round automatically. The
// public start route remains as a backwards-compatible fallback for older app builds, and
// any member may call it: there is no dedicated dealer.
async function dealFirstBoards(env: Env, game: GameRow, actor: string, later: Later, strict: boolean): Promise<boolean> {
  if (game.status !== 'writing') {
    if (strict) throw new HttpError(409, 'The boards have already been dealt');
    return false;
  }
  const size = BOARD_SIZE;

  const [members, phrases] = await Promise.all([
    env.DB.prepare('SELECT id, email FROM members WHERE game_id = ?').bind(game.id).all<{ id: string; email: string }>(),
    env.DB.prepare('SELECT id, target FROM phrases WHERE game_id = ? AND removed = 0').bind(game.id).all<{ id: string; target: string }>(),
  ]);
  if (members.results.length < 2) {
    if (strict) throw new HttpError(409, 'Invite at least one friend first');
    return false;
  }
  const needed = phrasesNeeded(size);
  const short = members.results.filter((m) => phrases.results.filter((p) => p.target === m.id).length < needed);
  if (short.length) {
    if (strict) throw new HttpError(409, `${short.length === 1 ? 'Someone needs' : `${short.length} people need`} more lines first`);
    return false;
  }

  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('UPDATE games SET status = ?, size = ? WHERE id = ?').bind('playing', size, game.id),
  ];
  // boards has UNIQUE (game_id, target, round): if two starts race, the second batch fails whole.
  for (const m of members.results) stmts.push(...boardStatements(env, game.id, m.id, 1, phrases.results.filter((p) => p.target === m.id), size));
  try {
    await env.DB.batch(stmts);
  } catch (err) {
    // Two last-line submissions can both notice that every pool is full. The unique board
    // key makes one batch win; the other quietly returns the already-started game.
    if (String(err).includes('UNIQUE')) {
      if (strict) throw new HttpError(409, 'The boards have already been dealt');
      return false;
    }
    throw err;
  }
  later(pushTo(env, members.results.filter((m) => m.id !== actor).map((m) => m.email), {
    title: 'Boards are live',
    body: `${game.name}: start listening.`,
    data: { gameId: game.id, url: `/game/${game.id}` },
  }));
  return true;
}

// A board about `target`, dealt at random from their unused lines.
function boardStatements(env: Env, gameId: string, target: string, round: number, lines: { id: string }[], size: Size): D1PreparedStatement[] {
  const boardId = id();
  const now = Date.now();
  const free = freePos(size);
  const picked = deal(lines, phrasesNeeded(size), secureRandom);
  const stmts = [env.DB.prepare('INSERT INTO boards (id, game_id, target, round) VALUES (?, ?, ?, ?)').bind(boardId, gameId, target, round)];
  let next = 0;
  for (let pos = 0; pos < size * size; pos++) {
    stmts.push(pos === free
      ? env.DB.prepare('INSERT INTO squares (id, board_id, pos, phrase_id, free, marked_at) VALUES (?, ?, ?, NULL, 1, ?)').bind(id(), boardId, pos, now)
      : env.DB.prepare('INSERT INTO squares (id, board_id, pos, phrase_id) VALUES (?, ?, ?, ?)').bind(id(), boardId, pos, picked[next++].id));
  }
  return stmts;
}

// Mid-game, a person without a board going gets their next one as soon as there are enough
// unused lines about them: someone who joined late, or anyone whose last board blacked out.
async function dealNext(env: Env, game: GameRow, target: string, later: Later) {
  const size = game.size as Size;
  const latest = await env.DB.prepare(
    `SELECT b.round, b.blackout_at, rb.retired_at FROM boards b LEFT JOIN retired_boards rb ON rb.board_id = b.id
      WHERE b.game_id = ? AND b.target = ? ORDER BY b.round DESC LIMIT 1`,
  ).bind(game.id, target).first<{ round: number; blackout_at: number | null; retired_at: number | null }>();
  if (latest && !latest.blackout_at && !latest.retired_at) return;
  const { results: lines } = await env.DB.prepare(`SELECT p.id FROM phrases p WHERE p.game_id = ? AND p.target = ? AND ${UNUSED}`)
    .bind(game.id, target).all<{ id: string }>();
  if (lines.length < phrasesNeeded(size)) return;
  const round = (latest?.round ?? 0) + 1;
  try {
    await env.DB.batch(boardStatements(env, game.id, target, round, lines, size));
  } catch (err) {
    if (String(err).includes('UNIQUE')) return; // two writers raced; the other one dealt it
    throw err;
  }
  const { results: members } = await env.DB.prepare(
    'SELECT m.id, m.email, u.name FROM members m LEFT JOIN users u ON u.email = m.email WHERE m.game_id = ?',
  ).bind(game.id).all<{ id: string; email: string; name: string | null }>();
  const name = members.find((m) => m.id === target)?.name || 'Someone';
  const data = { gameId: game.id, url: `/game/${game.id}` };
  later((async () => {
    await pushTo(env, members.filter((m) => m.id !== target).map((m) => m.email),
      { title: `${name} has a new board`, body: `Board ${round} in ${game.name}. Start listening.`, data });
    await pushTo(env, members.filter((m) => m.id === target).map((m) => m.email),
      { title: 'There’s a new board about you', body: `Board ${round} in ${game.name} is live.`, data });
  })());
}

// After a bingo has stalled for a week, any member may retire it. Unheard lines are copied
// back into the unused pool; heard lines stay retired with the old board. The board remains
// private because it never reached blackout.
export async function retireBoard(env: Env, gameId: string, email: string, body: { target?: unknown }): Promise<{ gameId: string }> {
  const { game } = await membership(env, gameId, email);
  const target = String(body.target ?? '');
  const board = await env.DB.prepare(
    `SELECT b.id, b.bingo_at, b.blackout_at, rb.retired_at
       FROM boards b LEFT JOIN retired_boards rb ON rb.board_id = b.id
      WHERE b.game_id = ? AND b.target = ? ORDER BY b.round DESC LIMIT 1`,
  ).bind(game.id, target).first<{ id: string; bingo_at: number | null; blackout_at: number | null; retired_at: number | null }>();
  if (!board) throw new HttpError(404, 'Board not found');
  if (board.retired_at) throw new HttpError(409, 'That board has already been retired');
  if (board.blackout_at) throw new HttpError(409, 'That board is already complete');
  if (!board.bingo_at) throw new HttpError(409, 'A board needs bingo before it can be retired');
  if (Date.now() - board.bingo_at < RETIRE_AFTER_MS) throw new HttpError(409, 'A board can be retired seven days after bingo');

  const { results: unheard } = await env.DB.prepare(
    `SELECT p.id FROM squares s JOIN phrases p ON p.id = s.phrase_id
      WHERE s.board_id = ? AND s.marked_at IS NULL AND p.removed = 0`,
  ).bind(board.id).all<{ id: string }>();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO retired_boards (board_id, retired_at) VALUES (?, ?)').bind(board.id, now),
    ...unheard.map((phrase, index) => env.DB.prepare(
      `INSERT INTO phrases (id, game_id, target, author, text, created_at)
       SELECT ?, game_id, target, author, text, ? FROM phrases WHERE id = ? AND removed = 0`,
    ).bind(id(), now + index, phrase.id)),
  ]);
  return { gameId: game.id };
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
    `SELECT s.free, s.marked_by, b.id AS board_id, b.target, b.game_id, b.blackout_at, rb.retired_at
       FROM squares s JOIN boards b ON b.id = s.board_id LEFT JOIN retired_boards rb ON rb.board_id = b.id WHERE s.id = ?`,
  ).bind(squareId).first<{ free: number; marked_by: string | null; board_id: string; target: string; game_id: string; blackout_at: number | null; retired_at: number | null }>();
  if (!sq) throw new HttpError(404, 'Not found');
  const { game, me } = await membership(env, sq.game_id, email);
  if (sq.target === me.id) throw new HttpError(404, 'Not found'); // your own board doesn't exist, as far as you know
  if (sq.free) throw new HttpError(400, 'That’s the free square');
  if (sq.blackout_at) throw new HttpError(400, 'That board is blacked out, so it’s done'); // writers are revealed; no going back
  if (sq.retired_at) throw new HttpError(400, 'That board has been retired');
  const now = Date.now();

  if (!on) {
    if (sq.marked_by !== me.id) throw new HttpError(403, 'Only the person who spotted this can undo it');
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
      news.push({ title: 'BINGO!', body: `${targetName} just got BINGO’d in ${game.name}.`, data });
      toTarget.push({ title: 'You got BINGO’d', body: `Your friends crossed off a whole line in ${game.name}.`, data });
    }
  }
  if (isBlackout(marked, size)) {
    const first = await env.DB.prepare('UPDATE boards SET blackout_at = ? WHERE id = ? AND blackout_at IS NULL').bind(now, sq.board_id).run();
    if (first.meta.changes) {
      news.push({ title: 'Blackout!', body: `Every square on ${targetName}’s board is gone. See who wrote what.`, data });
      toTarget.push({ title: 'Your board is blacked out', body: `You said all of it. Open ${game.name} to see your board.`, data });
      await dealNext(env, game, sq.target, later); // leftover lines may already be enough for the next board
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
  const board = await env.DB.prepare(
    'SELECT id, bingo_at, blackout_at FROM boards WHERE game_id = ? AND target = ? AND blackout_at IS NOT NULL ORDER BY round DESC LIMIT 1',
  ).bind(gameId, me.id).first<{ id: string; bingo_at: number | null; blackout_at: number | null }>();
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

// Any member can revisit a blacked-out board. Before blackout this deliberately returns
// nothing, including for the person the board is about.
export async function archivedBoard(env: Env, boardId: string, email: string): Promise<ArchivedBoard> {
  const board = await env.DB.prepare(
    `SELECT b.id, b.game_id, b.target, b.round, b.bingo_at, b.blackout_at, u.name
       FROM boards b
       JOIN members viewer ON viewer.game_id = b.game_id AND viewer.email = ?
       JOIN members target ON target.id = b.target
       LEFT JOIN users u ON u.email = target.email
      WHERE b.id = ? AND b.blackout_at IS NOT NULL`,
  ).bind(email, boardId).first<{ id: string; game_id: string; target: string; round: number; bingo_at: number | null; blackout_at: number; name: string | null }>();
  if (!board) throw new HttpError(404, 'Finished board not found');
  const { results: members } = await env.DB.prepare(
    'SELECT m.id, u.name FROM members m LEFT JOIN users u ON u.email = m.email WHERE m.game_id = ?',
  ).bind(board.game_id).all<{ id: string; name: string | null }>();
  const names = new Map(members.map((m, i) => [m.id, m.name || `Player ${i + 1}`]));
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.pos, s.free, s.marked_by, s.marked_at, s.phrase_id, p.text, p.author, p.removed
       FROM squares s LEFT JOIN phrases p ON p.id = s.phrase_id WHERE s.board_id = ? ORDER BY s.pos`,
  ).bind(board.id).all<{ id: string; pos: number; free: number; marked_by: string | null; marked_at: number | null; phrase_id: string | null; text: string | null; author: string | null; removed: number | null }>();
  return {
    id: board.id,
    target: board.target,
    name: board.name || names.get(board.target) || 'Player',
    round: board.round,
    bingoAt: board.bingo_at,
    blackoutAt: board.blackout_at,
    squares: results.map((r) => ({
      id: r.id,
      pos: r.pos,
      text: r.free ? null : r.removed ? REMOVED : r.text,
      phraseId: null,
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
    env.DB.prepare('DELETE FROM retired_boards WHERE board_id IN (SELECT id FROM boards WHERE target = ?)').bind(m.id),
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
    env.DB.prepare('DELETE FROM retired_boards WHERE board_id IN (SELECT id FROM boards WHERE game_id = ?1) AND NOT EXISTS (SELECT 1 FROM members WHERE game_id = ?1)').bind(m.game_id),
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
