// app/components/live/DifficultySelector.tsx
import { useTierDashboardStore } from '~/store/tierDashboardStore';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { FiFilter, FiCheck, FiX } from 'react-icons/fi';
import 'rc-slider/assets/index.css';

interface DifficultySelectorProps {
  availableDifficulties: string[];
}

export const DifficultySelector: React.FC<DifficultySelectorProps> = ({ availableDifficulties }) => {
  const { selectedDiffs, setSelectedDiffs } = useTierDashboardStore();

  const handleToggle = (diff: string) => {
    const newSet = new Set(selectedDiffs);
    if (newSet.has(diff)) newSet.delete(diff);
    else newSet.add(diff);
    setSelectedDiffs(Array.from(newSet));
  };

  const handleSelectAll = () => setSelectedDiffs([...availableDifficulties]);
  const handleClear = () => setSelectedDiffs([]);

  if (availableDifficulties.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs sm:text-sm">
        <div className="flex items-center gap-1.5 font-semibold text-neutral-600 dark:text-neutral-400">
          <FiFilter className="text-emerald-500" />
          <span>Difficulty</span>
        </div>
        <div className="flex gap-1">
          <button onClick={handleSelectAll} title="Select All" className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-500 transition-colors">
            <FiCheck size={14} />
          </button>
          <button onClick={handleClear} title="Clear All" className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-500 transition-colors">
            <FiX size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {availableDifficulties.map((diff) => {
          const isSelected = selectedDiffs.includes(diff);
          const color = DIFFICULTY_COLORS[diff] || '#999';

          return (
            <button
              key={diff}
              onClick={() => handleToggle(diff)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all border ${isSelected ? 'bg-white dark:bg-neutral-800 shadow-sm' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border-transparent opacity-60'}`}
              style={{
                borderColor: isSelected ? color : 'transparent',
                color: isSelected ? color : undefined,
              }}
            >
              {diff}
            </button>
          );
        })}
      </div>
    </div>
  );
};
