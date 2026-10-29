// Demo data for clicking through every journey in the simulator, as "Ana" (dev sign-in: An).
// Wipes the LOCAL database's games and seeds one game per journey. Never touches the real
// database. Run with the local Worker up (`npm run worker`):  npm run demo

import { execSync } from 'node:child_process';

const API = process.env.API ?? 'http://localhost:8787';
const N = 25; // lines per board (5×5, no free square)

execSync(
  'npx wrangler d1 execute bingo --local --command "DELETE FROM games; DELETE FROM members; DELETE FROM phrases; DELETE FROM boards; DELETE FROM squares; DELETE FROM reports; DELETE FROM bans; DELETE FROM blocks;"',
  { cwd: new URL('../worker', import.meta.url), stdio: 'ignore' },
);

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

// Sign-in names → display names. "An" signs in as Ana (an@example.com).
const NAMES = { An: 'Ana', Ben: 'Ben', Cal: 'Cal', Mia: 'Mia', Dan: 'Dan', Kk: 'Kk', Eve: 'Eve' };
const tok = {};
for (const [login, name] of Object.entries(NAMES)) {
  tok[name] = (await call(null, 'POST', '/api/auth/dev', { name: login })).token;
  await call(tok[name], 'PUT', '/api/me', { name });
}

const BANK = [
  '"Literally"', 'Checks the weather app', 'Late again', 'Mentions the gym', '"No because…"', 'Brings up the ex',
  'Takes a photo of the food', 'Falls asleep first', '"I’ll be there in 5"', 'Asks what we’re eating next',
  '"Let’s go to Vegas"', 'Goes to the gym 2x in one day', '"Trust me on this one"', 'Orders the same thing',
  '"Wait, who’s driving?"', 'Quotes The Office', 'Loses their sunglasses', '"I’m not even that tired"',
  'Suggests a polar plunge', 'Picks the playlist', '"Iconic"', 'Sings in the car', 'Forgets sunscreen',
  'Plans the whole day', '"Quick question"', 'Brings a speaker', '"Hear me out"', 'Texts during dinner',
  'Packs too many snacks', '"Same"', 'Reads the group chat out loud', 'Names the boat', '"One more episode"',
  'Feeds the ducks', '"Back in college…"', 'Wears a hat indoors', 'Naps on the dock', '"Is this gluten free?"',
];

// Lines for someone's next board: a line is never reused for the same person.
const NEXT = [
  '"Can we stop for snacks?"', 'Brings their own pillow', 'Knows every lyric', '"Wait, I have a story"',
  'Cannonballs off the dock', 'Reorganizes the fridge', 'Forgets their flip flops', 'Tells the bear story',
  '"It’s 5 o’clock somewhere"', 'Hums while cooking', 'Brings board games', '"Okay but listen"',
  'Takes 40 selfies', '"Lowkey"', 'Forgets a charger', '"I’m starving"', 'Grills everything',
  'Fixes something that isn’t broken', 'Brings a cooler', '"We should do this every year"', 'Finds a frog',
  'Loses at cards', 'Swims before breakfast', 'Reads on the dock', '"Technically…"', 'Has a spreadsheet for it',
];

// Writes `count` lines about `target`, spread across the other players.
async function write(game, target, count, offset = 0, bank = BANK) {
  const writers = game.names.filter((n) => n !== target);
  for (let i = 0; i < count; i++) {
    const text = bank[(i + offset) % bank.length];
    await call(tok[writers[i % writers.length]], 'POST', `/api/games/${game.id}/phrases`, { target: game.ids[target], text });
  }
}

async function makeGame(owner, name, others) {
  const { id } = await call(tok[owner], 'POST', '/api/games', { name });
  const { code } = await call(tok[owner], 'GET', `/api/games/${id}`);
  for (const n of others) await call(tok[n], 'POST', `/api/join/${code}`);
  const v = await call(tok[owner], 'GET', `/api/games/${id}`);
  return { id, code, names: [owner, ...others], ids: Object.fromEntries(v.players.map((p) => [p.name, p.id])) };
}

// Crosses off squares on `target`'s board by position.
async function mark(game, target, positions, by) {
  const v = await call(tok[by], 'GET', `/api/games/${game.id}`);
  for (const sq of v.boards[game.ids[target]].squares) {
    if (positions.includes(sq.pos)) await call(tok[by], 'POST', `/api/squares/${sq.id}/mark`);
  }
}

const ALL = [...Array(N).keys()];
const done = [];

// 1. Brand new: just you, so the invite card shows.
{
  const g = await makeGame('Ana', 'Roommates', []);
  done.push(`Roommates (${g.code}): new game, only you in it. Invite card.`);
}

// 2. Writing, you deal: everyone's one line short except you. Write one each, then deal.
{
  const g = await makeGame('Ana', 'Book club', ['Ben', 'Cal']);
  await write(g, 'Ana', N);
  await write(g, 'Ben', N - 1);
  await write(g, 'Cal', N - 1, 5);
  done.push(`Book club (${g.code}): writing. Ben and Cal are each 1 line short. Add one each, then deal.`);
}

// 3. Writing, someone else deals.
{
  const g = await makeGame('Ben', 'Work friends', ['Ana', 'Mia']);
  await write(g, 'Ana', 18);
  await write(g, 'Ben', 10);
  await write(g, 'Mia', 6, 3);
  done.push(`Work friends (${g.code}): writing. Ben made it, so Ben deals.`);
}

// 4. Live game with every state.
{
  const g = await makeGame('Ana', 'Lake trip', ['Ben', 'Cal', 'Mia', 'Dan', 'Kk']);
  for (const [i, n] of g.names.entries()) await write(g, n, N, i * 4);
  await call(tok.Ana, 'POST', `/api/games/${g.id}/start`);
  await mark(g, 'Ana', [0, 1, 2, 3, 9, 14], 'Ben'); // 1 away for you
  await mark(g, 'Ben', [6, 12], 'Cal'); // warming up
  await mark(g, 'Cal', [5, 6, 7, 8, 20, 24], 'Mia'); // 1 away
  await mark(g, 'Mia', [0, 1, 2, 3, 4, 12, 18], 'Kk'); // bingo
  await mark(g, 'Dan', ALL, 'Ana'); // blackout
  await mark(g, 'Kk', [3, 17], 'Dan');
  await write(g, 'Dan', N - 1, 0, NEXT); // Dan's next board: one line to go
  await call(tok.Eve, 'POST', `/api/join/${g.code}`); // late joiner
  g.names.push('Eve');
  g.ids.Eve = (await call(tok.Eve, 'GET', `/api/games/${g.id}`)).players.find((p) => p.isMe).id;
  await write(g, 'Eve', 20, 3, NEXT);
  done.push(`Lake trip (${g.code}): live. You 1 away, Cal 1 away, Mia bingo, Dan blacked out with his next board 1 line short, Eve joined late (20/25).`);
}

// 5. Your board is blacked out: open it, and your next board is being written.
{
  const g = await makeGame('Mia', 'Spring break', ['Ana', 'Ben', 'Kk']);
  for (const [i, n] of g.names.entries()) await write(g, n, N, i * 6);
  await call(tok.Mia, 'POST', `/api/games/${g.id}/start`);
  await mark(g, 'Ana', ALL.filter((p) => p % 2 === 0), 'Ben');
  await mark(g, 'Ana', ALL.filter((p) => p % 2 === 1), 'Kk');
  await mark(g, 'Ben', [0, 6, 12, 18, 24, 3], 'Ana'); // bingo on the diagonal
  await mark(g, 'Kk', [10, 11], 'Mia');
  await write(g, 'Ana', 9, 0, NEXT);
  done.push(`Spring break (${g.code}): your board is blacked out. Tap it to see who wrote what. Your next board has 9/25.`);
}

console.log('Demo games ready. Sign in as "An" (Ana). Other players: Ben, Cal, Mia, Dan, Kk, Eve.\n');
for (const line of done) console.log(`- ${line}`);
