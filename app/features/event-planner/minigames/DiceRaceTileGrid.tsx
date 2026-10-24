// app/components/planner/minigame/DiceRaceTileGrid.tsx
import type { ReactNode } from 'react';

// Largest divisor of `size` that is <= `max`, so the last row is never left with a lone tile.
const evenColumns = (size: number, max: number): number => {
  for (let cols = Math.min(max, size); cols > 1; cols--) {
    if (size % cols === 0) return cols;
  }
  return Math.min(max, size);
};

interface DiceRaceTileGridProps<T> {
  items: T[];
  renderTile: (item: T, index: number) => ReactNode;
}

export const DiceRaceTileGrid = <T,>({ items, renderTile }: DiceRaceTileGridProps<T>) => (
  <div
    className="grid grid-cols-[repeat(var(--cols-sm),minmax(0,1fr))] md:grid-cols-[repeat(var(--cols-md),minmax(0,5.5rem))] auto-rows-[4.75rem] gap-1.5"
    style={{ '--cols-sm': evenColumns(items.length, 6), '--cols-md': evenColumns(items.length, 9) } as React.CSSProperties}
  >
    {items.map((item, i) => (
      <div key={i} className="min-w-0">
        {renderTile(item, i)}
      </div>
    ))}
  </div>
);
