// components/common/MinMaxControls.tsx
import { FiChevronsDown, FiChevronsUp } from 'react-icons/fi';

interface MinMaxControlsProps {
  label?: string;
  onMin: () => void;
  onMax: () => void;
  className?: string;
  isTarget?: boolean;
}

export const MinMaxControls = ({ label, onMin, onMax, className = '', isTarget = false }: MinMaxControlsProps) => {
  const btnClass = `
    flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all
    ${isTarget ? 'text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700'}
  `;

  return (
    <div className={`flex justify-between items-end mb-0.5 ${className}`}>
      {/* Label */}
      <span className={`text-[11px] font-bold tracking-tight ${isTarget ? 'text-blue-500/80 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400'}`}>{label}</span>

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMin();
          }}
          className={btnClass}
          title="Min"
        >
          <FiChevronsDown size={10} />
          <span></span>
        </button>
        {/* <span className="text-[10px] text-neutral-300 dark:text-neutral-700">/</span> */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMax();
          }}
          className={btnClass}
          title="Max"
        >
          <span></span>
          <FiChevronsUp size={10} />
        </button>
      </div>
    </div>
  );
};
