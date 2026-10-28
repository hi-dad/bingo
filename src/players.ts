import type { GameView } from '@shared/types';

// Player id → position in join order, which picks their avatar color.
export function playerIndex(game: GameView): Record<string, number> {
  return Object.fromEntries(game.players.map((p, i) => [p.id, i]));
}
