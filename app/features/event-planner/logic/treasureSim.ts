import type { TreasureReward, TreasureRound } from '~/types/plannerData';

// Random sequential placement: largest treasures first, random rotation/position with retries.
export const placeTreasures = (roundData: TreasureRound, rewards: Record<string, TreasureReward>) => {
  const [width, height] = roundData.TreasureRoundSize;
  const board: (number | null)[][] = Array.from({ length: height }, () => Array<number | null>(width).fill(null));
  const treasuresToPlace: TreasureReward[] = [];

  roundData.RewardId.forEach((id, index) => {
    for (let i = 0; i < roundData.RewardAmount[index]; i++) {
      treasuresToPlace.push(rewards[id]);
    }
  });

  treasuresToPlace.sort((a, b) => b.CellUnderImageWidth * b.CellUnderImageHeight - a.CellUnderImageWidth * a.CellUnderImageHeight);

  const placedTreasures: {
    instanceId: string;
    treasureId: number;
    cells: { x: number; y: number }[];
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];

  for (const [index, treasure] of treasuresToPlace.entries()) {
    let placed = false;
    for (let attempts = 0; attempts < 100; attempts++) {
      const rotates = Math.random() < 0.5;
      const tw = rotates ? treasure.CellUnderImageHeight : treasure.CellUnderImageWidth;
      const th = rotates ? treasure.CellUnderImageWidth : treasure.CellUnderImageHeight;

      if (width < tw || height < th) continue;

      const x = Math.floor(Math.random() * (width - tw + 1));
      const y = Math.floor(Math.random() * (height - th + 1));

      let collision = false;
      const treasureCells: { x: number; y: number }[] = [];
      for (let i = 0; i < tw; i++) {
        for (let j = 0; j < th; j++) {
          if (board[y + j][x + i] !== null) {
            collision = true;
            break;
          }
          treasureCells.push({ x: x + i, y: y + j });
        }
        if (collision) break;
      }

      if (!collision) {
        const instanceId = `${treasure.Id}_${index}`;
        treasureCells.forEach((cell) => {
          board[cell.y][cell.x] = treasure.Id;
        });
        placedTreasures.push({
          instanceId,
          treasureId: treasure.Id,
          cells: treasureCells,
          x,
          y,
          width: tw,
          height: th,
        });
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }
  return { placedTreasures, board };
};
