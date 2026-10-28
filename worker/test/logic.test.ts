import { describe, expect, test } from 'vitest';
import { bestLine, deal, freePos, hasBingo, isBlackout, lines, phrasesNeeded, CODE, CODE_ALPHABET } from '../../shared/logic';

const board = (size: 3 | 4 | 5, marked: number[]) => {
  const out = Array(size * size).fill(false);
  for (const p of marked) out[p] = true;
  if (freePos(size) >= 0) out[freePos(size)] = true;
  return out;
};

describe('lines', () => {
  test.each([3, 4, 5] as const)('%i×%i has rows, columns and two diagonals', (size) => {
    const all = lines(size);
    expect(all).toHaveLength(size * 2 + 2);
    for (const line of all) expect(line).toHaveLength(size);
    expect(all[0]).toEqual([...Array(size).keys()]);
  });
});

describe('bingo', () => {
  test('a row, a column and each diagonal win', () => {
    expect(hasBingo(board(3, [0, 1, 2]), 3)).toBe(true);
    expect(hasBingo(board(3, [1, 4, 7]), 3)).toBe(true);
    expect(hasBingo(board(4, [0, 5, 10, 15]), 4)).toBe(true);
    expect(hasBingo(board(4, [3, 6, 9, 12]), 4)).toBe(true);
  });

  test('the free center counts on a 5×5', () => {
    expect(freePos(5)).toBe(12);
    expect(hasBingo(board(5, [10, 11, 13, 14]), 5)).toBe(true);
    expect(hasBingo(board(5, [0, 6, 18, 24]), 5)).toBe(true);
    expect(hasBingo(board(5, [10, 11, 13]), 5)).toBe(false);
  });

  test('no free square below 5×5', () => {
    expect(freePos(3)).toBe(-1);
    expect(freePos(4)).toBe(-1);
    expect(phrasesNeeded(3)).toBe(9);
    expect(phrasesNeeded(4)).toBe(16);
    expect(phrasesNeeded(5)).toBe(24);
  });

  test('scattered squares are not a bingo', () => {
    expect(hasBingo(board(3, [0, 1, 5, 6]), 3)).toBe(false);
  });

  test('bestLine counts toward the closest line', () => {
    expect(bestLine(board(5, []), 5)).toBe(1); // the free square
    expect(bestLine(board(5, [10, 11, 13]), 5)).toBe(4); // one away
    expect(bestLine(board(3, [0, 1, 2]), 3)).toBe(3);
  });

  test('blackout needs every square', () => {
    expect(isBlackout(board(3, [0, 1, 2, 3, 4, 5, 6, 7, 8]), 3)).toBe(true);
    expect(isBlackout(board(3, [0, 1, 2, 3, 4, 5, 6, 7]), 3)).toBe(false);
  });
});

describe('deal', () => {
  test('picks distinct items without changing the input', () => {
    const items = [...Array(30).keys()];
    const picked = deal(items, 24);
    expect(picked).toHaveLength(24);
    expect(new Set(picked).size).toBe(24);
    expect(items).toEqual([...Array(30).keys()]);
  });
});

test('invite codes avoid look-alike characters', () => {
  expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  for (const ch of CODE_ALPHABET) expect(CODE.test(ch.repeat(6))).toBe(true);
  expect(CODE.test('ABC1EF')).toBe(false);
});
