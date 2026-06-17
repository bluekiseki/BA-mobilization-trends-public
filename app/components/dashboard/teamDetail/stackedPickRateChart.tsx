// app/components/dashboard/stackedPickRateChart.tsx
import { useCallback, useMemo, useState } from 'react';
import { useIsDarkState } from '~/store/isDarkState';
import { getBackgroundRatingColor, getCharacterStarValue, type PortraitData, type ReportEntry, type StudentData } from '../common';
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StarRating } from '~/components/StarRating';
import { useTranslation } from 'react-i18next';
import React from 'react';

// --- Constants ---
const INITIAL_ITEMS = 10;
const ITEMS_PER_LOAD = 15;
type AssistantFilter = 'include' | 'exclude' | 'only';

export const StackedPickRateChart: React.FC<{
  data: ReportEntry[];
  studentData: StudentData;
  portraitData: PortraitData;
}> = React.memo(({ data, studentData, portraitData }) => {
  const currentRank = data.length;
  const { isDark } = useIsDarkState();
  const [visibleCount, setVisibleCount] = useState(INITIAL_ITEMS); // State for load more
  const [assistantFilter, setAssistantFilter] = useState<AssistantFilter>('include'); // State for assistant filter
  const { t: t_c } = useTranslation('common');
  const { t: t_a } = useTranslation('charts', { keyPrefix: 'ranking.control' });

  const fullChartData = useMemo(() => {
    const pickCounts = new Map<number, Map<number, number>>(); // studentId -> { starValue -> count }
    data.forEach((entry) => {
      entry.t.forEach((team) =>
        [...team.m, ...team.s]
          .filter((v) => v && Object.keys(v).length)
          .forEach((char) => {
            const [id, isAssist, starValue] = [char.id, char.isAssist, getCharacterStarValue(char)];
            if (assistantFilter === 'exclude') {
              if (isAssist) return;
            } else if (assistantFilter == 'only') {
              // 'only'
              if (!isAssist) return;
            }
            if (!pickCounts.has(id)) pickCounts.set(id, new Map<number, number>());
            const starMap = pickCounts.get(id) ?? new Map<number, number>();
            starMap.set(starValue, (starMap.get(starValue) || 0) + 1);
          }),
      );
    });

    // Process into chart format
    const processed = Array.from(pickCounts.entries()).map(([id, starMap]) => {
      const entry: Record<string, number | string> = {
        id: id,
        name: studentData[id]?.Name || `ID ${id}`,
      };
      entry.total = Array.from(starMap.values()).reduce((a, b) => a + b, 0);
      starMap.forEach((count, star) => {
        entry[String(star)] = (count / currentRank) * 100;
      });
      return entry;
    });
    return processed.sort((a, b) => Number(b.total) - Number(a.total)).filter((v) => v.total);
  }, [data, studentData, currentRank, assistantFilter]);

  const displayChartData = useMemo(() => {
    return fullChartData.slice(0, visibleCount);
  }, [fullChartData, visibleCount]);

  const starLevels = useMemo(
    () => Array.from(new Set(fullChartData.flatMap((e) => Object.keys(e).filter((k) => k !== 'id' && k !== 'name' && k !== 'total')))).sort((a, b) => Number(b) - Number(a)),
    [fullChartData],
  );

  interface AxisTickProps {
    x?: number;
    y?: number;
    payload?: { value?: number | string };
  }

  const CustomYAxisTick = ({ x = 0, y = 0, payload }: AxisTickProps) => {
    const studentId = Number(payload?.value ?? 0);
    const imageUrl = portraitData[studentId] ? `data:image/webp;base64,${portraitData[studentId]}` : '';

    if (imageUrl) {
      return <image x={x - 24} y={y - 14} href={imageUrl} width={28} height={28} />;
    }

    return (
      <text x={x} y={y} dy={4} textAnchor="end" fill="#666">
        {studentData[studentId]?.Name || ''}
      </text>
    );
  };

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleMouseEnter = (index: number) => {
    setActiveIndex(index);
  };

  const handleMouseLeave = () => {
    setActiveIndex(null);
  };

  const renderCustomizedLabel = (label: number | string): string | null => {
    if (typeof label === 'number' && label > 10) {
      return `${label.toFixed(1)}%`;
    }
    return null;
  };

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prevCount) => Math.min(prevCount + ITEMS_PER_LOAD, fullChartData.length));
  }, [fullChartData.length]);

  const handleCollapseAll = useCallback(() => {
    setVisibleCount(INITIAL_ITEMS);
  }, []);

  const BAR_HEIGHT = 32;
  const CHART_VERTICAL_PADDING = 60;
  // const calculatedHeight = chartData.length * BAR_HEIGHT + CHART_VERTICAL_PADDING;
  const calculatedHeight = displayChartData.length * BAR_HEIGHT + CHART_VERTICAL_PADDING;

  const filterOptions: Array<{ value: AssistantFilter; labelKey: 'rank_all' | 'rank_normal' | 'rank_assist' }> = [
    { value: 'include', labelKey: 'rank_all' },
    { value: 'exclude', labelKey: 'rank_normal' },
    { value: 'only', labelKey: 'rank_assist' },
  ];

  return (
    <div className="space-y-4">
      {' '}
      {/* Added wrapper div */}
      {/* 1. Assistant Filter Buttons */}
      <div className="flex justify-center gap-2 mb-4">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setAssistantFilter(opt.value)}
            className={`px-2 py-1.5 text-xs font-medium rounded-sm transition-colors ${assistantFilter === opt.value ? 'bg-ba-btn-blue text-black' : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
          >
            {t_a(opt.labelKey)} {/* Translate the label key */}
          </button>
        ))}
      </div>
      {/* 2. Chart */}
      <ResponsiveContainer width="100%" height={calculatedHeight} className="animate-none">
        <BarChart layout="vertical" data={displayChartData} margin={{ left: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#404040' : '#e2e8f0'} /> {/* Adjusted dark color */}
          <XAxis type="number" stroke="#64748b" domain={[0, 'dataMax + 10']} tickFormatter={(val: number) => `${val.toPrecision(3).toLocaleString()}%`} /> {/* Added % to tick */}
          <YAxis type="category" dataKey="id" stroke="#64748b" width={2} tick={<CustomYAxisTick />} interval={0} />
          <Tooltip
            content={(props) => {
              const { active, payload, label } = props; // as { active?: boolean; payload?: Array<{ value?: number; color?: string; name?: string; payload?: Record<string, number | string> }>; label?: number | string };
              if (active && payload && payload.length) {
                const studentId = label ? Number(label) : 0;
                const studentInfo = (payload[0].payload ?? {}) as Record<string, number | string>;
                const totalPickRate = (((studentInfo.total as number) ?? 0) / currentRank) * 100; // Calculate total %

                return (
                  <div className="rounded border bg-white p-3 text-sm shadow-md dark:border-neutral-700 dark:bg-neutral-800">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">{studentData[studentId]?.Name || ''}</div>

                    {/* 3. Display Total Pick Rate */}
                    <div className="items-center w-full text-right mb-1 pb-0.5 border-b dark:border-neutral-600">
                      <span className="text-xs text-neutral-800 dark:text-neutral-200">{totalPickRate.toFixed(2)}%</span>
                    </div>

                    {/* Star Breakdown */}
                    {payload.map((entry, i) => {
                      // const star = Number(entry.name?.replace('★ ', ''));
                      const star = Number(entry.name);
                      return (
                        <div
                          key={i}
                          className="w-full min-w-[150px]"
                          style={{
                            backgroundColor: star == activeIndex ? `color-mix(in oklab, ${entry.color} 20%, transparent)` : '',
                          }}
                        >
                          <div className="mt-1.5 -mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-neutral-400">
                              <StarRating n={star} />
                            </span>
                            <span className="font-bold text-neutral-800 dark:text-neutral-200">{(entry.value as number).toFixed(2)}%</span>
                          </div>
                          <div className="h-1 w-full rounded bg-neutral-200 dark:bg-neutral-600">
                            <div
                              className="h-1 rounded"
                              style={{
                                width: `${Number(entry.value ?? 0)}%`,
                                backgroundColor: entry.color ?? '#ccc',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return null;
            }}
            cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }}
          />
          <ReferenceLine x={100} stroke={isDark == 'dark' ? 'white' : 'black'} strokeDasharray="3 3" />
          {starLevels.map((star) => (
            <Bar
              key={star}
              dataKey={star} // Use numeric star value directly
              stackId="a"
              // name={`★ ${star}`} // Name can be set dynamically in tooltip if needed
              fill={getBackgroundRatingColor(Number(star), isDark) || '#ccc'}
              onMouseEnter={() => handleMouseEnter(Number(star))}
              onMouseLeave={handleMouseLeave}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={star}
                position="center"
                fill="#fff" // Consider dark text on light bars?
                fontSize={10}
                // @ts-expect-error - LabelFormatter type compatibility
                formatter={renderCustomizedLabel}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* 3. Load More / Collapse Buttons */}
      <div className="flex justify-center mt-4">
        {visibleCount < fullChartData.length ? (
          <button
            onClick={handleLoadMore}
            className="w-full h-9 px-4 flex items-center justify-center gap-2 text-sm font-medium rounded-md bg-neutral-800 text-white hover:bg-neutral-900 dark:bg-neutral-200 dark:text-neutral-800 dark:hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500 dark:focus:ring-offset-neutral-900 transition-all shadow-sm"
          >
            {t_c('load_more')} ({fullChartData.length - visibleCount}) {/* Show remaining count */}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1z" />
            </svg>
          </button>
        ) : (
          // Only show Collapse if more than initial items were ever shown
          fullChartData.length > INITIAL_ITEMS &&
          visibleCount > INITIAL_ITEMS && (
            <button
              onClick={handleCollapseAll}
              className="w-full h-9 px-4 flex items-center justify-center gap-2 text-sm font-medium rounded-md bg-neutral-800 text-white hover:bg-neutral-900 dark:bg-neutral-200 dark:text-neutral-800 dark:hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500 dark:focus:ring-offset-neutral-900 transition-all shadow-sm"
            >
              Hide {/* Translate 'Hide' */}
              {/* Optional: Up arrow icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 2.707V14.5a.5.5 0 0 0 .5.5z" />
              </svg>
            </button>
          )
        )}
      </div>
    </div>
  );
});
