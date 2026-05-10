import React, { useEffect, useState, useMemo, useTransition } from 'react';
import Slider from 'rc-slider';
import { useTierDashboardStore } from '~/store/tierDashboardStore';
import { FiCalendar, FiRefreshCcw } from 'react-icons/fi';
import 'rc-slider/assets/index.css';
import { useTranslation } from 'react-i18next';

interface DateRangeSliderProps {
  distinctDays: string[];
}

export const DateRangeSlider: React.FC<DateRangeSliderProps> = ({ distinctDays }) => {
  const { dateRangeIndex, setDateRangeIndex } = useTierDashboardStore();

  const { t: t_c } = useTranslation('common');

  const [isMounted, setIsMounted] = useState(false);
  // Local state for immediate UI response
  const [localIndex, setLocalIndex] = useState<[number, number]>([dateRangeIndex[0], dateRangeIndex[1]]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  //] 04:00 Calculation of Day Change Point based on KST
  const marks = useMemo(() => {
    if (!distinctDays || distinctDays.length === 0) return {};

    const marksObj: Record<number, any> = {};
    const markedDays = new Set<string>();

    distinctDays.forEach((dayStr, index) => {
      // "Day [Number] HH:MM" parsing with a regular expression
      // ex: "Day1 22:30", "Day2 00:10"
      const match = dayStr.match(/Day(\d+)\s+(\d{1,2}):(\d{2})/);

      if (match) {
        const dayNum = match[1]; // "1", "2"...
        const hour = parseInt(match[2], 10); // 22, 00, 04...

        if (!markedDays.has(dayNum) && hour >= 4) {
          markedDays.add(dayNum);

          marksObj[index] = {
            style: {
              marginTop: '0px',
            },
            label: (
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Day {dayNum}</span>
              </div>
            ),
          };
        }
      }
    });

    return marksObj;
  }, [distinctDays]);

  if (!distinctDays || distinctDays.length === 0) return null;

  const maxIndex = distinctDays.length - 1;

  // Range check (clamp to valid range)
  const currentIndex: [number, number] = [Math.min(localIndex[0], maxIndex), Math.min(localIndex[1], maxIndex)];

  const handleChange = (value: number | number[]) => {
    if (Array.isArray(value)) {
      // High priority: slider thumb moves immediately
      setLocalIndex([value[0], value[1]]);
      // Low priority: chart recalculation deferred, won't block UI
      startTransition(() => {
        setDateRangeIndex([value[0], value[1]]);
      });
    }
  };

  // Ensure final value is always committed
  const handleChangeComplete = (value: number | number[]) => {
    if (Array.isArray(value)) {
      setDateRangeIndex([value[0], value[1]]);
    }
  };

  const handleReset = () => {
    setLocalIndex([0, maxIndex]);
    setDateRangeIndex([0, maxIndex]);
  };

  return (
    <div className="w-full flex flex-col gap-1">
      <div className="flex justify-between items-center text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mb-2">
        <div className="flex items-center gap-1.5 font-semibold">
          <FiCalendar className="text-blue-500" />
          <span>{t_c('period')}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-xs">
            {distinctDays[currentIndex[0]]} ~ {distinctDays[currentIndex[1]]}
          </span>

          <button onClick={handleReset} title="Reset to full range" className="p-1 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded-full text-neutral-500 transition-colors">
            <FiRefreshCcw size={12} />
          </button>
        </div>
      </div>

      <div className="px-3 pb-5 pt-1">
        {isMounted ? (
          <Slider
            range
            min={0}
            max={maxIndex}
            step={1}
            value={currentIndex}
            onChange={handleChange}
            onChangeComplete={handleChangeComplete}
            marks={marks}
            dots={false}
            trackStyle={[{ backgroundColor: '#3b82f6', height: 4 }]}
            handleStyle={[
              {
                borderColor: '#3b82f6',
                backgroundColor: '#fff',
                opacity: 1,
                height: 14,
                width: 14,
                marginTop: -5,
              },
              {
                borderColor: '#3b82f6',
                backgroundColor: '#fff',
                opacity: 1,
                height: 14,
                width: 14,
                marginTop: -5,
              },
            ]}
            railStyle={{ backgroundColor: '#e5e7eb', height: 4 }}
          />
        ) : (
          <div className="w-full h-1 bg-gray-200 dark:bg-neutral-700 rounded mt-2" />
        )}
      </div>
    </div>
  );
};
