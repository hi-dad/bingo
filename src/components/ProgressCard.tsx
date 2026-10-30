import type { Progress } from '@shared/types';
import type { Size } from '@shared/logic';

// How a board is going, in a few words, under its name on the board screen.
export function progressLine(p: Progress, size: Size): string {
  if (p.blackoutAt) return 'Blackout';
  if (p.bingoAt) return 'Bingo · Going for blackout';
  if (p.best === size - 1) return '1 away from bingo';
  return 'Goal: Bingo';
}
