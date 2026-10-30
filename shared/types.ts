// The JSON the Worker sends the app. Every game response is built for the person asking:
// their own pool and their own board's squares are never included, only counts.

import type { Size } from './logic';

export type GameStatus = 'writing' | 'playing';

export interface GameSummary {
  id: string;
  name: string;
  code: string;
  status: GameStatus;
  size: Size;
  players: number;
  ownPoolCount: number; // safe count only: how many unused lines exist about the asker
  createdAt: number;
  round: number;
  progress: Progress | null;
  myMarks: boolean[] | null; // positions only; the lines on your own board remain secret
}

// How far along a board is. `marked` and `total` leave out the free square.
export interface Progress {
  marked: number;
  total: number;
  best: number; // most squares crossed off in one line (size = bingo)
  bingoAt: number | null;
  blackoutAt: number | null;
  canRetire: boolean; // bingo was at least seven days ago and the board has not blacked out
}

export interface Player {
  id: string;
  name: string;
  isMe: boolean;
  isOwner: boolean;
  poolCount: number; // unused lines about this person (not yet on a board)
  hasBoard: boolean; // has been dealt at least one board
  round: number; // their latest board's number (1, 2, …), 0 before their first
  needsLines: boolean; // playing, and waiting for lines for their next board (late joiner, or after a blackout)
  progress: Progress | null; // their latest board
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
  phraseId: string | null; // to report the line
  free: boolean;
  markedAt: number | null;
  markedBy: string | null; // name of who crossed it off
  markedById: string | null; // their player id (for avatar colors)
  markedByMe: boolean;
  writer: string | null; // revealed once the board is blacked out
}

export interface Board {
  target: string; // player id
  squares: Square[];
  bingoAt: number | null;
  blackoutAt: number | null;
}

export interface FinishedBoard {
  id: string;
  target: string;
  name: string;
  round: number;
  blackoutAt: number;
  mine: boolean;
}

export interface ArchivedBoard extends Board {
  id: string;
  name: string;
  round: number;
}

export interface Score {
  id: string;
  name: string;
  bingos: number; // boards about them that reached bingo
  blackouts: number; // boards about them that fully blacked out
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
  pools: Record<string, Phrase[]>; // unused lines for everyone you can write about (never yours)
  boards: Record<string, Board>; // everyone's latest board except yours
  myMarks: boolean[] | null; // which spots on your latest board are crossed off, by position; never what they say
  scores: Score[];
  finishedBoards: FinishedBoard[]; // blacked-out rounds only; their contents are safe to reveal
}
