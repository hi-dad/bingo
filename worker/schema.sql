-- D1 tables. Every statement is IF NOT EXISTS, so this file can be re-applied safely:
--   npm run db:local   /   npm run db:remote

-- One row per signed-in device. Only a hash of the session token is stored, so a copy of
-- this table can't be used to sign in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  owner      TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions (owner);

-- Display names other players see.
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name  TEXT
);

-- A group of friends. status: 'writing' (filling in pools) → 'playing' (boards dealt).
-- owner is a members.id (the person who can deal the boards).
CREATE TABLE IF NOT EXISTS games (
  id         TEXT    PRIMARY KEY,
  code       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  owner      TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'writing',
  size       INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL
);

-- A person in a game. Phrases, boards and marks refer to members.id, never to emails, so
-- emails never leave the server.
CREATE TABLE IF NOT EXISTS members (
  id        TEXT    PRIMARY KEY,
  game_id   TEXT    NOT NULL,
  email     TEXT    NOT NULL,
  joined_at INTEGER NOT NULL,
  UNIQUE (game_id, email)
);
CREATE INDEX IF NOT EXISTS members_email ON members (email);

-- Things a person always says, written by their friends. author is NULL once the writer
-- deletes their account (the phrase stays on the board).
CREATE TABLE IF NOT EXISTS phrases (
  id         TEXT    PRIMARY KEY,
  game_id    TEXT    NOT NULL,
  target     TEXT    NOT NULL,
  author     TEXT,
  text       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  removed    INTEGER NOT NULL DEFAULT 0  -- 1 once reported: hidden everywhere
);
CREATE INDEX IF NOT EXISTS phrases_game ON phrases (game_id, target);

-- Boards about a person. Round 1 is dealt when the game starts; once a board blacks out
-- (or for someone who joined late), the next round deals itself when enough unused lines
-- are written about them. A line is used once it's on a square.
CREATE TABLE IF NOT EXISTS boards (
  id          TEXT    PRIMARY KEY,
  game_id     TEXT    NOT NULL,
  target      TEXT    NOT NULL,
  round       INTEGER NOT NULL DEFAULT 1,
  bingo_at    INTEGER,
  blackout_at INTEGER,
  UNIQUE (game_id, target, round)
);

-- The squares of a board. marked_at is set when crossed off; the free square starts
-- crossed off. marked_by is a members.id (NULL for the free square or a deleted account).
CREATE TABLE IF NOT EXISTS squares (
  id        TEXT    PRIMARY KEY,
  board_id  TEXT    NOT NULL,
  pos       INTEGER NOT NULL,
  phrase_id TEXT,
  free      INTEGER NOT NULL DEFAULT 0,
  marked_by TEXT,
  marked_at INTEGER,
  UNIQUE (board_id, pos)
);
CREATE INDEX IF NOT EXISTS squares_phrase ON squares (phrase_id);

-- Expo push tokens, one per device.
CREATE TABLE IF NOT EXISTS devices (
  token      TEXT    PRIMARY KEY,
  email      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_email ON devices (email);

-- Lines people reported (App Store rule 1.2). A reported line is hidden right away; the
-- report stays here for review: npx wrangler d1 execute bingo --remote --command
-- "SELECT * FROM reports WHERE resolved = 0"
CREATE TABLE IF NOT EXISTS reports (
  id         TEXT    PRIMARY KEY,
  phrase_id  TEXT    NOT NULL,
  game_id    TEXT    NOT NULL,
  reporter   TEXT    NOT NULL,  -- email
  author     TEXT,              -- email of who wrote it, if still known
  text       TEXT    NOT NULL,  -- the line as it was
  reason     TEXT,
  created_at INTEGER NOT NULL,
  resolved   INTEGER NOT NULL DEFAULT 0
);

-- People the game's owner removed; they can't rejoin that game.
CREATE TABLE IF NOT EXISTS bans (
  game_id TEXT NOT NULL,
  email   TEXT NOT NULL,
  PRIMARY KEY (game_id, email)
);

-- Blocks between people: neither can join a game the other is in.
CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT    PRIMARY KEY,
  blocker    TEXT    NOT NULL,  -- email
  blocked    TEXT    NOT NULL,  -- email
  name       TEXT,              -- their name when blocked, for the Settings list
  created_at INTEGER NOT NULL,
  UNIQUE (blocker, blocked)
);
CREATE INDEX IF NOT EXISTS blocks_blocked ON blocks (blocked);
