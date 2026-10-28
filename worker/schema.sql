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
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS phrases_game ON phrases (game_id, target);

-- One board per person once the game starts.
CREATE TABLE IF NOT EXISTS boards (
  id          TEXT    PRIMARY KEY,
  game_id     TEXT    NOT NULL,
  target      TEXT    NOT NULL,
  bingo_at    INTEGER,
  blackout_at INTEGER,
  UNIQUE (game_id, target)
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

-- Expo push tokens, one per device.
CREATE TABLE IF NOT EXISTS devices (
  token      TEXT    PRIMARY KEY,
  email      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_email ON devices (email);
