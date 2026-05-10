// app/components/live/TierAnalysisDashboard.tsx

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, LabelList, Label, ReferenceLine } from 'recharts';
import { type FC, useMemo, useState } from 'react';
import type { TierData, TimelineData } from '~/types/livetype';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { RaidInfo } from '~/types/data';
import { type_translation, type_translation_sorted, typecolor } from '../raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { formatDateToDayString } from './formatDateToDayString';
import { useIsDarkState } from '~/store/isDarkState';
import { useTierDashboardStore } from '~/store/tierDashboardStore';

import { DateRangeSlider } from './DateRangeSlider';
import { DifficultySelector } from './DifficultySelector';
import { getKSTResetTimestamps } from './getKSTResetTimestamps';
import React from 'react';

interface TierAnalysisDashboardProps {
  readonly isRaid: boolean;
  readonly timelineData: TimelineData;
  readonly raidInfos: RaidInfo[];
}
type TierTab = 'boss1' | 'boss2' | 'boss3' | 'total' | 'change' | 'total_change';

// const calculateTotalClearsForBoss = (bossTier: any): number => {
//     return Object.values(bossTier || {}).reduce((sum: number, count: any) => sum + count, 0);
// };

const CustomTotalClearTooltip = ({ active, payload, label }: any) => {
  const { t, i18n } = useTranslation('common'); // Or appropriate namespace
  const locale = i18n.language as Locale;

  if (active && payload && payload.length) {
    // Find the original data entry for this boss/total
    const bossData = payload[0]?.payload; // Access the data for the hovered bar segment
    if (!bossData) return null;

    // Filter payload to only include actual data points (bars)
    const validPayload = payload.filter((p: any) => p.value > 0);

    return (
      <div className="p-2 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-sm rounded-md border border-gray-300 dark:border-neutral-600 shadow-lg text-xs">
        {/* Boss Name (or Total for Raid) */}
        {/* <p className="font-bold mb-1 text-neutral-800 dark:text-neutral-200">{bossData.name === 'total' ? t('total') : t(bossData.name, { ns: 'term', defaultValue: bossData.name })}</p> */}
        <p className="font-bold mb-1 text-neutral-800 dark:text-neutral-200">
          {bossData.name === 'total' ? t('total') : type_translation[String(bossData.name) as keyof typeof type_translation][getLocaleShortName(locale)]}
        </p>
        {/* Difficulty Breakdown - Sort payload by difficulty order */}
        {/* as keyof typeof type_translation */}
        {validPayload
          .sort((a: any, b: any) => {
            const order = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];
            return order.indexOf(a.dataKey) - order.indexOf(b.dataKey);
          })
          .map((entry: any) => (
            <div key={entry.dataKey} className="flex justify-between items-center gap-2">
              <span style={{ color: entry.color }}>■ {entry.dataKey}</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{entry.value.toLocaleString()}</span>
            </div>
          ))}
        {/* Total for this boss */}
        <div className="mt-1 pt-1 border-t dark:border-neutral-600 flex justify-between font-semibold text-neutral-800 dark:text-neutral-200">
          <span>{t('total')}</span>
          <span>{bossData.total.toLocaleString()}</span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomSortedLegend: React.FC = ({ payload }: any) => {
  // Define desired difficulty order *within* the component or pass as prop
  const difficultyOrder = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];

  if (!payload) return null;

  // Sort the received payload based on the defined order
  const sortedPayload = [...payload].sort((a, b) => {
    return difficultyOrder.indexOf(a.value) - difficultyOrder.indexOf(b.value);
  });

  return (
    <div className="flex justify-center items-center flex-wrap gap-x-4 gap-y-1 text-xs mt-2">
      {sortedPayload.map((entry, index) => (
        <div key={`item-${index}`} className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, backgroundColor: entry.color }} />
          <span style={{ color: entry.color }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

const DIFFICULTY_ORDER = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];

const getHighestDifficulty = (boss: any): { diff: string; count: number } | null => {
  for (const diff of DIFFICULTY_ORDER) {
    if ((boss[diff] || 0) > 0) return { diff, count: boss[diff] };
  }
  return null;
};

const CustomAreaChartTooltip = ({ active, payload, label, raidInfos }: { active?: boolean; payload?: any[]; label?: number; raidInfos: RaidInfo[] }) => {
  const difficultyOrder = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];

  if (active && payload && payload.length && label) {
    const sortedPayload = [...payload].sort((a, b) => {
      return difficultyOrder.indexOf(a.name) - difficultyOrder.indexOf(b.name);
    });

    const total = sortedPayload.reduce((sum, entry) => sum + (entry.value || 0), 0);

    return (
      <div className="p-2 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm rounded-md border border-gray-300 dark:border-neutral-600 shadow-lg text-xs">
        {/* Time label */}
        <p className="font-bold mb-1 text-neutral-800 dark:text-neutral-200">{formatDateToDayString(new Date(label), raidInfos[0])}</p>
        {/* Details by Difficulty Level */}
        {sortedPayload.map((entry: any) => (
          <div key={entry.name} className="flex justify-between items-center gap-2">
            <span style={{ color: entry.color }}>■ {entry.name}</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{entry.value.toLocaleString()}</span>
          </div>
        ))}
        {/* Total */}
        <div className="mt-1 pt-1 border-t dark:border-neutral-600 flex justify-between font-semibold text-neutral-800 dark:text-neutral-200">
          <span>Total</span> {/* {t('total')} */}
          <span>{total.toLocaleString()}</span>
        </div>
      </div>
    );
  }
  return null;
};

export const TierAnalysisDashboard: FC<TierAnalysisDashboardProps> = ({ isRaid, timelineData, raidInfos }) => {
  // console.log('[TierAnalysisDashboard]', { isRaid, timelineData, raidInfos });
  const { t, i18n } = useTranslation('liveDashboard');
  const { t: t_c } = useTranslation('common');
  const locale = i18n.language as Locale;
  const { isDark } = useIsDarkState();

  // --- Store State ---
  const { selectedDiffs, dateRangeIndex } = useTierDashboardStore();

  const TABS: { id: TierTab; name: string }[] = useMemo(
    () =>
      isRaid
        ? [
            { id: 'total', name: t('total_clear') },
            { id: 'change', name: t('hourly_change') },
            { id: 'boss1', name: 'Timeline' },
          ]
        : [
            { id: 'total', name: t('total_clear') },
            { id: 'change', name: t('hourly_change') },
            {
              id: 'boss1',
              name: type_translation[raidInfos?.[0]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 1',
            },
            {
              id: 'boss2',
              name: type_translation[raidInfos?.[1]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 2',
            },
            {
              id: 'boss3',
              name: type_translation[raidInfos?.[2]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 3',
            },
          ],
    [raidInfos, isRaid],
  );

  const [activeTab, setActiveTab] = useState<TierTab>('total');

  // --- Data Prep for Components ---

  // 1. Extract Distinct Days (For Slider)
  const distinctDays = useMemo(() => {
    if (!timelineData) return [];
    const days = new Set<string>();
    timelineData.forEach((p) => {
      const dayStr = formatDateToDayString(new Date(p.time.replace(' ', 'T') + 'Z'), raidInfos[0]);
      days.add(dayStr);
    });
    return Array.from(days);
  }, [timelineData, raidInfos]);

  // 2. Filter Timeline Data based on Slider State
  const filteredTimelineData = useMemo(() => {
    if (!timelineData || distinctDays.length === 0) return [];

    const startIndex = Math.max(0, Math.min(dateRangeIndex[0], distinctDays.length - 1));
    const endIndex = Math.max(0, Math.min(dateRangeIndex[1], distinctDays.length - 1));

    return timelineData.filter((p) => {
      const dayStr = formatDateToDayString(new Date(p.time.replace(' ', 'T') + 'Z'), raidInfos[0]);
      const dayIndex = distinctDays.indexOf(dayStr);
      return dayIndex >= startIndex && dayIndex <= endIndex;
    });
  }, [timelineData, distinctDays, dateRangeIndex, raidInfos]);

  // 3. Extract Available Difficulties (For Selector) - based on Filtered Data
  const availableDifficulties = useMemo(() => {
    const difficulties = new Set<string>();
    const sourceData = filteredTimelineData.length > 0 ? filteredTimelineData : timelineData;

    if (!sourceData || !activeTab.startsWith('boss')) return [];

    for (const timePoint of sourceData) {
      const bossTierData = isRaid ? timePoint.data.tier : timePoint.data.tier[activeTab as keyof typeof timePoint.data.tier];
      if (bossTierData) {
        for (const diff of Object.keys(bossTierData)) {
          difficulties.add(diff);
        }
      }
    }
    const difficultyOrder = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];
    return difficultyOrder.filter((d) => difficulties.has(d));
  }, [filteredTimelineData, timelineData, activeTab, isRaid]);

  // --- Analysis Data Calculation ---
  const analysisData = useMemo(() => {
    // Use filtered data for analysis
    if (!filteredTimelineData || filteredTimelineData.length === 0) return null;

    const clearsOverTime = filteredTimelineData.map((point) => {
      const time = new Date(point.time.replace(' ', 'T') + 'Z').getTime();
      const bossTiers = point.data.tier;
      const entry = { time } as any;
      if (isRaid)
        Object.entries(bossTiers).forEach(([diff, count]) => {
          entry[`${diff}`] = count;
        });
      else
        Object.entries(bossTiers).forEach(([bossId, tiers]) => {
          Object.entries(tiers).forEach(([diff, count]) => {
            entry[`${bossId}_${diff}`] = count;
          });
        });
      return entry;
    });

    const clearsChangeOverTime = filteredTimelineData.slice(1).map((point, i) => {
      const prevPoint = filteredTimelineData[i];
      const currentTimeMs = new Date(point.time.replace(' ', 'T') + 'Z').getTime();
      const prevTimeMs = new Date(prevPoint.time.replace(' ', 'T') + 'Z').getTime();
      const durationMs = currentTimeMs - prevTimeMs;
      const durationHours = durationMs / (1000 * 60 * 60);
      let currentTotal, prevTotal, change;
      if (isRaid) {
        currentTotal = Object.values(point.data.tier)
          .flat()
          .reduce((sum, t) => sum + (t as number), 0);
        prevTotal = Object.values(prevPoint.data.tier)
          .flat()
          .reduce((sum, t) => sum + (t as number), 0);
        change = currentTotal - prevTotal;
      } else {
        currentTotal = Object.values(point.data.tier as TierData)
          .flat()
          .reduce((sum, t) => sum + Object.values(t).reduce((s, c) => s + c, 0), 0);
        prevTotal = Object.values(prevPoint.data.tier as TierData)
          .flat()
          .reduce((sum, t) => sum + Object.values(t).reduce((s, c) => s + c, 0), 0);
        change = currentTotal - prevTotal;
      }
      const changePerHour = durationHours > 0 ? change / durationHours : 0;
      return {
        time: currentTimeMs,
        changePerHour,
        originalChange: change,
        durationHours,
      };
    });

    const latestPoint = filteredTimelineData[filteredTimelineData.length - 1];
    const latestTierData = latestPoint.data.tier;
    const latestData = latestPoint.data as any;

    const findRankScore = (entries: { r: number; s: number }[] | undefined, rank: number): number | null => {
      if (!Array.isArray(entries)) return null;
      return entries.find((e) => e.r === rank)?.s ?? null;
    };

    const bossNameMap = isRaid
      ? {}
      : {
          boss1: raidInfos?.[0]?.Type || 'Boss 1',
          boss2: raidInfos?.[1]?.Type || 'Boss 2',
          boss3: raidInfos?.[2]?.Type || 'Boss 3',
        };

    const latestClearsByBoss = isRaid
      ? [
          {
            name: 'total',
            ...latestTierData,
            total: Object.values(latestTierData).reduce((s: number, c: any) => s + c, 0),
            rank20000Score: findRankScore(latestData.boss?.d, 20000),
          },
        ]
      : Object.entries(latestTierData).map(([bossId, tiers]) => {
          const total = Object.values(tiers).reduce((s: number, c: any) => s + c, 0);
          return {
            name: bossNameMap[bossId as keyof typeof bossNameMap],
            ...tiers,
            total,
            rank20000Score: findRankScore(latestData[bossId]?.d, 20000),
          };
        });

    // Vertical Lines (Reset Lines)
    const startTime = clearsOverTime[0].time;
    const endTime = clearsOverTime[clearsOverTime.length - 1].time;
    const resetTimestamps = getKSTResetTimestamps(startTime, endTime);

    return {
      clearsOverTime,
      clearsChangeOverTime,
      latestClearsByBoss,
      resetTimestamps,
    };
  }, [filteredTimelineData, isRaid, raidInfos]);

  // console.log({ analysisData: analysisData?.latestClearsByBoss });

  const showDifficultySelector = activeTab.startsWith('boss');

  if (!analysisData) return <div className="p-4 text-center">Data is loading or range is empty...</div>;

  return (
    <>
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 mb-4">
        <nav className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-neutral-700 pb-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-600'}`}
            >
              {tab.name}
            </button>
          ))}
        </nav>

        {/* Components: Range Slider & Difficulty Selector */}
        <div className="bg-gray-50 dark:bg-neutral-900/50 rounded-lg border border-gray-200 dark:border-neutral-700 p-3">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
            <div className="flex-1 min-w-0">
              <DateRangeSlider distinctDays={distinctDays} />
            </div>

            {showDifficultySelector && (
              <>
                <div className="hidden lg:block w-px bg-gray-300 dark:bg-neutral-700 self-stretch"></div>

                <div className="lg:hidden w-full h-px bg-gray-200 dark:bg-neutral-700"></div>

                <div className="flex-1 lg:flex-none lg:w-1/3 min-w-0">
                  <DifficultySelector availableDifficulties={availableDifficulties} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="min-h-[500px]">
        {activeTab === 'total' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <ResponsiveContainer width="100%" height={isRaid ? 200 : 500}>
                <BarChart data={analysisData.latestClearsByBoss} layout="vertical" barCategoryGap={isRaid ? '20%' : '10%'}>
                  {/* ... Axes, Tooltip, Legend ... */}
                  <XAxis type="number" domain={[0, (dataMax: number) => Math.ceil(dataMax)]} tickFormatter={(val) => val.toLocaleString()} />
                  {/* <YAxis type="category" dataKey="name" width={isRaid ? 0 : 80} tickFormatter={(name) => isRaid ? '' : name === 'total' ? t_c('total') : t(name, { ns: 'term', defaultValue: name })} /> */}
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={isRaid ? 0 : 80}
                    tickFormatter={(name) => (isRaid ? '' : name === 'total' ? t_c('total') : type_translation[name as keyof typeof type_translation][getLocaleShortName(locale)])}
                  />
                  <Legend content={<CustomSortedLegend />} />
                  <Tooltip content={<CustomTotalClearTooltip />} cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }} />
                  {Object.keys(DIFFICULTY_COLORS).map((diff) => (
                    <Bar key={diff} dataKey={diff} stackId="a" fill={DIFFICULTY_COLORS[diff]}>
                      <LabelList
                        dataKey={diff}
                        position="center"
                        fill="#fff"
                        fontSize={10}
                        formatter={(value: any) => {
                          if ((value / analysisData.latestClearsByBoss[0].total) * 100 < 15) {
                            return null;
                          }
                          return diff + '\n' + value.toLocaleString();
                        }}
                      />
                    </Bar>
                  ))}

                  <ReferenceLine x={20000} stroke={isDark == 'dark' ? 'white' : 'black'} strokeDasharray="3 3" />
                  <ReferenceLine x={120000} stroke={isDark == 'dark' ? 'white' : 'black'} strokeDasharray="3 3" />
                  <ReferenceLine x={240000} stroke={isDark == 'dark' ? 'white' : 'black'} strokeDasharray="3 3" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Cards */}
            <div className={`flex flex-col pt-4 gap-2 md:gap-6 ${isRaid ? 'md:h-[200px]' : 'md:h-[430px]'}`}>
              {analysisData.latestClearsByBoss.map((boss) => {
                const highestDiff = getHighestDifficulty(boss);
                const accentColor = isRaid ? (highestDiff ? DIFFICULTY_COLORS[highestDiff.diff] : '#6b7280') : (typecolor[boss.name as keyof typeof typecolor] ?? '#6b7280');
                return (
                  <div
                    key={boss.name}
                    className="md:flex-1 relative flex items-center md:flex-col md:items-stretch md:justify-between gap-3 md:gap-0 pl-4 pr-3 py-2.5 md:p-3 md:pl-4 bg-white dark:bg-neutral-800/60 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden"
                  >
                    {/* Left accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: accentColor }} />

                    {/* Boss name */}
                    {!isRaid && (
                      <p className="shrink-0 w-16 md:w-auto md:mb-1.5 text-xs font-semibold text-gray-500 dark:text-neutral-400 tracking-wide truncate">
                        {type_translation_sorted[boss.name as keyof typeof type_translation_sorted]?.[getLocaleShortName(locale)]}
                      </p>
                    )}

                    {/* Total + Platinum cut */}
                    <div className="flex flex-1 md:flex-none flex-row items-center md:items-end justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-neutral-500 mb-0.5">{t_c('total')}</p>
                        <p className="text-xl font-bold text-sky-500 leading-none tabular-nums">{boss.total.toLocaleString()}</p>
                      </div>
                      {boss.rank20000Score != null && (
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400 dark:text-neutral-500 mb-0.5">{t('platinum_cut', 'Cut')}</p>
                          <p className="text-sm font-bold text-amber-400 leading-none tabular-nums">{boss.rank20000Score.toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {/* Highest difficulty — styled badge */}
                    {highestDiff && (
                      <div className="shrink-0 md:mt-2 md:pt-2 md:border-t dark:border-neutral-700">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ color: DIFFICULTY_COLORS[highestDiff.diff], backgroundColor: DIFFICULTY_COLORS[highestDiff.diff] + '22' }}
                        >
                          {highestDiff.diff}
                          <span className="font-normal opacity-70">({highestDiff.count.toLocaleString()})</span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'change' && (
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={analysisData.clearsChangeOverTime}>
              <XAxis type="number" dataKey="time" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => formatDateToDayString(new Date(ts), raidInfos[0])} fontSize={12} />
              <YAxis yAxisId="left">
                <Label value={t('changePerHourLabel')} angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888' }} />
              </YAxis>
              <Tooltip
                // labelFormatter={(label: number) => formatDateToDayString(new Date(label), raidInfos[0])}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-md border dark:border-neutral-700 text-sm">
                        <p className="font-bold mb-1">{label && formatDateToDayString(new Date(label), raidInfos[0])}</p>
                        <p>
                          <strong>{t('hourly_change')}:</strong>
                          <span className="text-green-500 font-semibold ml-1">
                            {data.changePerHour.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}{' '}
                            {t('playersPerHourUnit')}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500 dark:text-neutral-400">
                          ({data.originalChange.toLocaleString()} {t('playersUnit')} / {data.durationHours.toFixed(1)} {t('hoursUnit')})
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />

              {/* Vertical Lines (Reset Lines) - from analysisData */}
              {analysisData.resetTimestamps.map((ts) => (
                <ReferenceLine
                  key={ts}
                  x={ts}
                  stroke={isDark ? '#555' : '#ccc'}
                  strokeDasharray="3 3"
                  label={{
                    value: 'Day Change',
                    position: 'insideTop',
                    fontSize: 10,
                    fill: '#888',
                  }}
                />
              ))}

              <Line type="monotone" dataKey="changePerHour" stroke="#82ca9d" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab.startsWith('boss') && (
          <ResponsiveContainer width="100%" height={500}>
            <AreaChart data={analysisData.clearsOverTime}>
              <XAxis type="number" dataKey="time" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => formatDateToDayString(new Date(ts), raidInfos[0])} fontSize={12} />
              <YAxis tickFormatter={(val) => val.toLocaleString()} />
              <Tooltip content={<CustomAreaChartTooltip raidInfos={raidInfos} />} cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }} />
              <Legend content={<CustomSortedLegend />} />

              {/* Vertical Lines */}
              {analysisData.resetTimestamps.map((ts) => (
                <ReferenceLine key={ts} x={ts} stroke={isDark ? '#555' : '#ccc'} strokeDasharray="3 3" />
              ))}

              {/* Filtered Areas based on STORE State */}
              {Array.from(selectedDiffs)
                .filter((d) => availableDifficulties.includes(d))
                .map((diff) => (
                  <Area key={diff} type="monotone" dataKey={isRaid ? diff : `${activeTab}_${diff}`} name={diff} stackId="1" stroke={DIFFICULTY_COLORS[diff]} fill={DIFFICULTY_COLORS[diff]} />
                ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
};

export default React.memo(TierAnalysisDashboard);
