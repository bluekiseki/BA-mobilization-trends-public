import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

export function useIndexRange(length: number): [[number, number], (range: [number, number]) => void] {
  const [range, setRange] = useState<[number, number]>([0, Math.max(0, length - 1)]);

  useEffect(() => {
    setRange([0, Math.max(0, length - 1)]);
  }, [length]);

  return [range, setRange];
}

interface IndexRangeSliderProps {
  /** Total number of items the range indexes into. */
  length: number;
  range: [number, number];
  onChange: (range: [number, number]) => void;
  /** Renders a human-readable label (e.g. a date) for the item at the given index. */
  formatLabel: (index: number) => string;
  /** Below this item count the control hides itself — nothing to zoom into. */
  minVisible?: number;
  className?: string;
}

export function IndexRangeSlider({ length, range, onChange, formatLabel, minVisible = 8, className = '' }: IndexRangeSliderProps) {
  const { t: t_ui } = useTranslation('ui');

  if (length <= minVisible) return null;

  const maxIndex = length - 1;
  const [start, end] = range;
  const isFullRange = start === 0 && end === maxIndex;

  const handleChange = (value: number | number[]) => {
    if (!Array.isArray(value) || value.length !== 2) return;
    onChange([value[0], value[1]]);
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span className="tabular-nums">
          {formatLabel(start)} – {formatLabel(end)}
        </span>
        {!isFullRange && (
          <button type="button" onClick={() => onChange([0, maxIndex])} className="text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200">
            {t_ui('reset')}
          </button>
        )}
      </div>
      <div
        className="px-1
          dark:[&_.rc-slider-rail]:bg-neutral-700!
          dark:[&_.rc-slider-track]:bg-neutral-400!
          dark:[&_.rc-slider-handle]:border-neutral-300!
          dark:[&_.rc-slider-handle]:bg-neutral-900!"
      >
        <Slider
          range
          min={0}
          max={maxIndex}
          step={1}
          value={range}
          onChange={handleChange}
          allowCross={false}
          styles={{
            rail: { backgroundColor: '#d4d4d4', height: 4 },
            track: { backgroundColor: '#737373', height: 4 },
            handle: { borderColor: '#737373', backgroundColor: '#ffffff', opacity: 1, height: 14, width: 14, marginTop: -5 },
          }}
        />
      </div>
    </div>
  );
}
