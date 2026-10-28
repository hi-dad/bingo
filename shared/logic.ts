// Bingo rules shared by the app and the Worker. Pure functions only: no I/O, no globals.
// A board is `size` × `size`, positions numbered row by row from 0. A 5×5 board has a
// free center square; smaller boards don't.

export const SIZES = [3, 4, 5] as const;
export type Size = (typeof SIZES)[number];

export function isSize(n: unknown): n is Size {
  return SIZES.includes(n as Size);
}

// The free square's position, or -1 when the board has none.
export function freePos(size: Size): number {
  return size === 5 ? 12 : -1;
}

// How many phrases a person's pool needs before their board can be dealt.
export function phrasesNeeded(size: Size): number {
  return size * size - (freePos(size) >= 0 ? 1 : 0);
}

// Every winning line (rows, columns, both diagonals) as lists of positions.
export function lines(size: Size): number[][] {
  const out: number[][] = [];
  const range = [...Array(size).keys()];
  for (const r of range) out.push(range.map((c) => r * size + c));
  for (const c of range) out.push(range.map((r) => r * size + c));
  out.push(range.map((i) => i * size + i));
  out.push(range.map((i) => i * size + (size - 1 - i)));
  return out;
}

// `marked[pos]` is true for crossed-off squares (the free square counts as crossed off).
export function hasBingo(marked: boolean[], size: Size): boolean {
  return lines(size).some((line) => line.every((p) => marked[p]));
}

export function isBlackout(marked: boolean[], size: Size): boolean {
  return marked.length === size * size && marked.every(Boolean);
}

// The most squares crossed off in any one line: size means bingo, size - 1 means one away.
export function bestLine(marked: boolean[], size: Size): number {
  return Math.max(...lines(size).map((line) => line.filter((p) => marked[p]).length));
}

// Picks `count` items in random order (Fisher–Yates on a copy). `random` returns [0, 1).
export function deal<T>(items: T[], count: number, random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

// Invite codes: 6 characters without look-alikes (no 0/O, 1/I/L).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE = /^[A-HJKMNP-Z2-9]{6}$/;
export const MAX_PHRASE = 80;
