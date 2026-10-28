// The JSON the Worker sends the app. Every game response is built for the person asking:
// their own pool and their own board's squares are never included, only counts.

import type { Size } from './logic';

export type GameStatus = 'writing' | 'playing';

export interface GameSummary {
  id: string;
  name: string;
  code: string;
  status: GameStatus;
  players: number;
  createdAt: number;
}

// How far along a board is. `marked` and `total` leave out the free square.
export interface Progress {
  marked: number;
  total: number;
  best: number; // most squares crossed off in one line (size = bingo)
  bingoAt: number | null;
  blackoutAt: number | null;
}

export interface Player {
  id: string;
  name: string;
  isMe: boolean;
  isOwner: boolean;
  poolCount: number; // phrases written about this person so far
  hasBoard: boolean; // false for someone who joined after the boards were dealt
  progress: Progress | null; // while playing
}

export interface Phrase {
  id: string;
  text: string;
  mine: boolean; // only your own phrases can be deleted; other writers stay anonymous
}

export interface Square {
  id: string;
  pos: number;
  text: string | null; // null for the free square
  free: boolean;
  markedAt: number | null;
  markedBy: string | null; // name of who crossed it off
  markedByMe: boolean;
  writer: string | null; // revealed once the board is blacked out
}

export interface Board {
  target: string; // player id
  squares: Square[];
  bingoAt: number | null;
  blackoutAt: number | null;
}

export interface Score {
  id: string;
  name: string;
  spotted: number; // squares they crossed off
  written: number; // their phrases that got crossed off
}

export interface GameView {
  id: string;
  name: string;
  code: string;
  status: GameStatus;
  size: Size;
  needed: number; // phrases each pool needs before boards can be dealt
  me: string; // your player id
  isOwner: boolean;
  players: Player[];
  pools: Record<string, Phrase[]>; // writing phase: everyone's pool except yours
  boards: Record<string, Board>; // playing: everyone's board except yours
  scores: Score[];
}
