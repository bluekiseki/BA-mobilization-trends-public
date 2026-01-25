// app/components/live/RankSelector.tsx
import React from 'react';
import { FiCheckSquare } from 'react-icons/fi'; // Or any suitable icons
import 'rc-slider/assets/index.css';

interface RankSelectorProps {
  ranksToPlot: number[];
  selectedRanks: Set<number>;
  rankColorMap: Map<number, string>;
  onToggleRank: (rank: number) => void;
}

export const RankSelector: React.FC<RankSelectorProps> = ({ ranksToPlot, selectedRanks, rankColorMap, onToggleRank }) => {
  return (
    <div className="w-full bg-gray-50 dark:bg-neutral-900/50 ">
      <div className="flex items-center mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        <FiCheckSquare className="mr-1.5 text-purple-500" />
        <span>Ranks</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {ranksToPlot.map((rank) => {
          const isSelected = selectedRanks.has(rank);
          const color = rankColorMap.get(rank) || '#999';
          return (
            <label key={rank} className="flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer select-none hover:bg-black/5 dark:hover:bg-white/5 px-1 py-0.5 rounded transition-colors">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleRank(rank)}
                className="w-3.5 h-3.5 rounded border-gray-300 focus:ring-offset-0 focus:ring-1"
                style={{ accentColor: color }}
              />
              <span
                style={{
                  color: isSelected ? color : undefined,
                  opacity: isSelected ? 1 : 0.6,
                }}
              >
                {rank.toLocaleString()}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};
