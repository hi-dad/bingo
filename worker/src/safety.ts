// Keeping games friendly (App Store rule 1.2 for user-generated content): report a line,
// leave a game, the owner removes someone, and blocking. The word filter is in filter.ts.

import type { Env } from './env';
import { HttpError, leaveStatements, membership } from './games';

const MAX_REASON = 200;

// Anyone who can see a line can report it. It's hidden at once, everywhere (pools and
// boards), and the report is kept for review.
export async function reportPhrase(env: Env, phraseId: string, email: string, body: { reason?: unknown }): Promise<{ gameId: string }> {
  const phrase = await env.DB.prepare(
    `SELECT p.game_id, p.target, p.text, p.removed, m.email AS author_email
       FROM phrases p LEFT JOIN members m ON m.id = p.author WHERE p.id = ?`,
  ).bind(phraseId).first<{ game_id: string; target: string; text: string; removed: number; author_email: string | null }>();
  if (!phrase) throw new HttpError(404, 'Not found');
  const { me } = await membership(env, phrase.game_id, email);
  if (phrase.target === me.id) throw new HttpError(404, 'Not found'); // you can't see lines about you
  if (phrase.author_email === email) throw new HttpError(400, 'That’s your own line. Delete it instead.');
  if (phrase.removed) return { gameId: phrase.game_id };
  const reason = String(body.reason ?? '').trim().slice(0, MAX_REASON) || null;
  await env.DB.batch([
    env.DB.prepare('UPDATE phrases SET removed = 1 WHERE id = ?').bind(phraseId),
    env.DB.prepare(
      'INSERT INTO reports (id, phrase_id, game_id, reporter, author, text, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(crypto.randomUUID(), phraseId, phrase.game_id, email, phrase.author_email, phrase.text, reason, Date.now()),
  ]);
  return { gameId: phrase.game_id };
}

export async function leaveGame(env: Env, gameId: string, email: string) {
  const { me } = await membership(env, gameId, email);
  await env.DB.batch(leaveStatements(env, me));
}

// The owner takes someone out of the game for good: they can't rejoin with the code.
export async function removePlayer(env: Env, gameId: string, email: string, body: { player?: unknown }) {
  const { game, me } = await membership(env, gameId, email);
  if (me.id !== game.owner) throw new HttpError(403, 'Only the person who made the game can remove people');
  const target = await playerIn(env, gameId, body.player);
  if (target.id === me.id) throw new HttpError(400, 'Leave the game instead');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO bans (game_id, email) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(gameId, target.email),
    ...leaveStatements(env, target),
  ]);
}

// Blocking someone takes you out of this game, and from then on neither of you can join a
// game the other is in.
export async function blockPlayer(env: Env, gameId: string, email: string, body: { player?: unknown }) {
  const { me } = await membership(env, gameId, email);
  const target = await playerIn(env, gameId, body.player);
  if (target.id === me.id) throw new HttpError(400, 'You can’t block yourself');
  const name = (await env.DB.prepare('SELECT name FROM users WHERE email = ?').bind(target.email).first<{ name: string | null }>())?.name ?? null;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO blocks (id, blocker, blocked, name, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (blocker, blocked) DO NOTHING')
      .bind(crypto.randomUUID(), email, target.email, name, Date.now()),
    ...leaveStatements(env, me),
  ]);
}

export async function listBlocks(env: Env, email: string): Promise<{ id: string; name: string }[]> {
  const { results } = await env.DB.prepare('SELECT id, name FROM blocks WHERE blocker = ? ORDER BY created_at DESC')
    .bind(email).all<{ id: string; name: string | null }>();
  return results.map((r) => ({ id: r.id, name: r.name || 'Someone' }));
}

export async function unblock(env: Env, blockId: string, email: string) {
  await env.DB.prepare('DELETE FROM blocks WHERE id = ? AND blocker = ?').bind(blockId, email).run();
}

async function playerIn(env: Env, gameId: string, player: unknown) {
  const target = await env.DB.prepare('SELECT id, game_id, email FROM members WHERE id = ? AND game_id = ?')
    .bind(String(player ?? ''), gameId).first<{ id: string; game_id: string; email: string }>();
  if (!target) throw new HttpError(404, 'That person isn’t in this game');
  return target;
}
