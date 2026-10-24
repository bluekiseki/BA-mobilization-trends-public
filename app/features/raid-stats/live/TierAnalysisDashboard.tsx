// app/components/live/TierAnalysisDashboard.tsx

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Label, ReferenceLine } from 'recharts';
import { type FC, useEffect, useMemo, useState } from 'react';
import type { TierData, TimelineData } from '~/features/raid-stats/live/livetype';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { RaidInfo } from '~/types/data';
import { type_translation_sorted, type_translation_tab } from '../../../components/raid/raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { formatDateToDayString } from './formatDateToDayString';
import { useIsDarkState } from '~/store/isDarkState';
import { useTierDashboardStore, resolveDateRange } from '~/features/raid-stats/live/tierDashboardStore';

import { DateRangeSlider } from './DateRangeSlider';
import { TotalClearsOverview } from './TotalClearsOverview';
import { DifficultySelector } from './DifficultySelector';
import { getKSTResetTimestamps } from './getKSTResetTimestamps';
import React from 'react';

interface TierAnalysisDashboardProps {
  readonly isRaid: boolean;
  readonly timelineData: TimelineData;
  readonly raidInfos: RaidInfo[];
}
type TierTab = 'boss1' | 'boss2' | 'boss3' | 'total' | 'change' | 'total_change';

interface LegendEntry {
  value?: string | number;
  color?: string;
}

const CustomSortedLegend: React.FC<{ payload?: LegendEntry[] }> = ({ payload }) => {
  const difficultyOrder = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];

  if (!payload) return null;

  const sortedPayload = [...payload].sort((a, b) => {
    const aValue = String(a.value ?? '');
    const bValue = String(b.value ?? '');
    return difficultyOrder.indexOf(aValue) - difficultyOrder.indexOf(bValue);
  });

  return (
    <div className="flex justify-center items-center flex-wrap gap-x-4 gap-y-1 text-xs mt-2">
      {sortedPayload.map((entry, index) => {
        const color = entry.color ?? '#000';
        const value = entry.value ?? '';
        return (
          <div key={`item-${index}`} className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, backgroundColor: color }} />
            <span style={{ color }}>{value}</span>
          </div>
        );
      })}
    </div>
  );
};

interface AreaChartPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
}

const CustomAreaChartTooltip = ({ active, payload, label, raidInfos }: { active?: boolean; payload?: AreaChartPayloadEntry[]; label?: number; raidInfos: RaidInfo[] }) => {
  const difficultyOrder = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];

  if (active && payload && payload.length && label) {
    const sortedPayload = [...payload].sort((a, b) => {
      const aName = typeof a.name === 'string' ? a.name : '';
      const bName = typeof b.name === 'string' ? b.name : '';
      return difficultyOrder.indexOf(aName) - difficultyOrder.indexOf(bName);
    });

    const total = sortedPayload.reduce((sum, entry) => sum + (entry.value ?? 0), 0);

    return (
      <div className="p-2 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm rounded-md border border-neutral-300 dark:border-neutral-600 shadow-lg text-xs">
        <p className="font-bold mb-1 text-neutral-800 dark:text-neutral-200">{formatDateToDayString(new Date(label), raidInfos[0])}</p>
        {sortedPayload.map((entry) => {
          const name = typeof entry.name === 'string' ? entry.name : '';
          const value = typeof entry.value === 'number' ? entry.value : 0;
          const color = entry.color ?? '#000';
          return (
            <div key={name || String(Math.random())} className="flex justify-between items-center gap-2">
              <span style={{ color }}>■ {name}</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{value.toLocaleString()}</span>
            </div>
          );
        })}
        <div className="mt-1 pt-1 border-t dark:border-neutral-600 flex justify-between font-semibold text-neutral-800 dark:text-neutral-200">
          <span>Total</span>
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
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const { isDark } = useIsDarkState();

  // --- Store State ---
  const dateRangeIndex = useTierDashboardStore((s) => s.dateRangeIndex);
  // Overview keeps its own difficulty selection; the other live charts share the store's one.
  const [selectedDiffs, setSelectedDiffs] = useState<string[]>(['Lunatic', 'Torment', 'Insane']);
  const [hasPickedDiffs, setHasPickedDiffs] = useState(false);
  const pickDiffs = (diffs: string[]) => {
    setHasPickedDiffs(true);
    setSelectedDiffs(diffs);
  };

  const TABS: { id: TierTab; name: string }[] = useMemo(
    () =>
      isRaid
        ? [
            { id: 'total', name: t_ui('totalClears') },
            { id: 'change', name: t('hourly_change') },
            { id: 'boss1', name: 'Timeline' },
          ]
        : [
            { id: 'total', name: t_ui('totalClears') },
            { id: 'change', name: t('hourly_change') },
            {
              id: 'boss1',
              name: type_translation_tab[raidInfos?.[0]?.Type as keyof typeof type_translation_tab][getLocaleShortName(locale)] || 'Boss 1',
            },
            {
              id: 'boss2',
              name: type_translation_tab[raidInfos?.[1]?.Type as keyof typeof type_translation_tab][getLocaleShortName(locale)] || 'Boss 2',
            },
            {
              id: 'boss3',
              name: type_translation_tab[raidInfos?.[2]?.Type as keyof typeof type_translation_tab][getLocaleShortName(locale)] || 'Boss 3',
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

    const [startIndex, endIndex] = resolveDateRange(dateRangeIndex, distinctDays.length);

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

  // Until the user picks, seed with everything available when the default selection doesn't exist for this boss/range.
  useEffect(() => {
    if (hasPickedDiffs || availableDifficulties.length === 0 || selectedDiffs.some((d) => availableDifficulties.includes(d))) return;
    setSelectedDiffs([...availableDifficulties]);
  }, [hasPickedDiffs, availableDifficulties, selectedDiffs]);

  // --- Analysis Data Calculation ---
  const analysisData = useMemo(() => {
    // Use filtered data for analysis
    if (!filteredTimelineData || filteredTimelineData.length === 0) return null;

    const clearsOverTime = filteredTimelineData.map((point) => {
      const time = new Date(point.time.replace(' ', 'T') + 'Z').getTime();
      const bossTiers = point.data.tier as Record<string, number | Record<string, number>>;
      const entry: Record<string, number> = { time };
      if (isRaid) {
        Object.entries(bossTiers).forEach(([diff, count]) => {
          entry[diff] = typeof count === 'number' ? count : Number(count);
        });
      } else {
        Object.entries(bossTiers).forEach(([bossId, tiers]) => {
          const tierRecord = tiers as Record<string, number>;
          Object.entries(tierRecord).forEach(([diff, count]) => {
            entry[`${bossId}_${diff}`] = typeof count === 'number' ? count : Number(count);
          });
        });
      }
      return entry;
    });

    const clearsChangeOverTime = filteredTimelineData.slice(1).map((point, i) => {
      const prevPoint = filteredTimelineData[i];
      const currentTimeMs = new Date(point.time.replace(' ', 'T') + 'Z').getTime();
      const prevTimeMs = new Date(prevPoint.time.replace(' ', 'T') + 'Z').getTime();
      const durationMs = currentTimeMs - prevTimeMs;
      const durationHours = durationMs / (1000 * 60 * 60);
      let currentTotal: number;
      let prevTotal: number;
      let change: number;
      if (isRaid) {
        const currentTierEntries = Object.values(point.data.tier as Record<string, number>);
        const prevTierEntries = Object.values(prevPoint.data.tier as Record<string, number>);
        currentTotal = currentTierEntries.reduce((sum, t) => sum + (typeof t === 'number' ? t : Number(t)), 0);
        prevTotal = prevTierEntries.reduce((sum, t) => sum + (typeof t === 'number' ? t : Number(t)), 0);
        change = currentTotal - prevTotal;
      } else {
        const currentTierData = point.data.tier as TierData;
        const prevTierData = prevPoint.data.tier as TierData;
        currentTotal = Object.values(currentTierData).reduce((sum, t) => {
          const tierValues = Object.values(t as Record<string, number>);
          return sum + tierValues.reduce((s, c) => s + (typeof c === 'number' ? c : Number(c)), 0);
        }, 0);
        prevTotal = Object.values(prevTierData).reduce((sum, t) => {
          const tierValues = Object.values(t as Record<string, number>);
          return sum + tierValues.reduce((s, c) => s + (typeof c === 'number' ? c : Number(c)), 0);
        }, 0);
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
    const latestData = latestPoint.data as Record<string, { d?: { r: number; s: number }[] }>;

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

    interface BossEntry {
      name: string;
      total: number;
      rank20000Score: number | null;
      [key: string]: number | string | null;
    }

    const latestClearsByBoss: BossEntry[] = isRaid
      ? [
          {
            name: 'total',
            ...Object.fromEntries(Object.entries(latestTierData).map(([key, val]) => [key, typeof val === 'number' ? val : Number(val)])),
            total: Object.values(latestTierData).reduce((s: number, c) => s + (typeof c === 'number' ? c : Number(c)), 0),
            rank20000Score: findRankScore((latestData.boss as { d?: { r: number; s: number }[] } | undefined)?.d, 20000),
          },
        ]
      : Object.entries(latestTierData).map(([bossId, tiers]) => {
          const tiersObj = tiers as Record<string, number>;
          const total = Object.values(tiersObj).reduce((s: number, c) => s + (typeof c === 'number' ? c : Number(c)), 0);
          const bossName = bossNameMap[bossId as keyof typeof bossNameMap] || bossId;
          return {
            name: bossName,
            ...Object.fromEntries(Object.entries(tiersObj).map(([key, val]) => [key, typeof val === 'number' ? val : Number(val)])),
            total,
            rank20000Score: findRankScore((latestData[bossId] as { d?: { r: number; s: number }[] } | undefined)?.d, 20000),
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
        <nav className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-700 pb-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600'}`}
            >
              {tab.name}
            </button>
          ))}
        </nav>

        {/* Components: Range Slider & Difficulty Selector */}
        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
            <div className="flex-1 min-w-0">
              <DateRangeSlider distinctDays={distinctDays} />
            </div>

            {showDifficultySelector && (
              <>
                <div className="hidden lg:block w-px bg-neutral-300 dark:bg-neutral-700 self-stretch"></div>

                <div className="lg:hidden w-full h-px bg-neutral-200 dark:bg-neutral-700"></div>

                <div className="flex-1 lg:flex-none lg:w-1/3 min-w-0">
                  <DifficultySelector availableDifficulties={availableDifficulties} selectedDiffs={selectedDiffs} setSelectedDiffs={pickDiffs} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="min-h-125">
        {activeTab === 'total' && (
          <TotalClearsOverview
            isRaid={isRaid}
            rows={analysisData.latestClearsByBoss.map((boss) => ({
              id: boss.name,
              label: isRaid ? undefined : type_translation_sorted[boss.name as keyof typeof type_translation_sorted]?.[getLocaleShortName(locale)],
              total: boss.total,
              rank20000Score: boss.rank20000Score,
              tiers: Object.fromEntries(Object.entries(boss).filter(([key, value]) => key in DIFFICULTY_COLORS && typeof value === 'number')) as Record<string, number>,
            }))}
          />
        )}

        {activeTab === 'change' && (
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={analysisData.clearsChangeOverTime}>
              <XAxis type="number" dataKey="time" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts: number) => formatDateToDayString(new Date(ts), raidInfos[0])} fontSize={12} />
              <YAxis yAxisId="left">
                <Label value={t('changePerHourLabel')} angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888' }} />
              </YAxis>
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length && label) {
                    const data = payload[0]?.payload as { changePerHour?: number; originalChange?: number; durationHours?: number } | undefined;
                    if (!data) return null;
                    const changePerHour = typeof data.changePerHour === 'number' ? data.changePerHour : 0;
                    const originalChange = typeof data.originalChange === 'number' ? data.originalChange : 0;
                    const durationHours = typeof data.durationHours === 'number' ? data.durationHours : 0;
                    return (
                      <div className="p-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-md border dark:border-neutral-700 text-sm">
                        <p className="font-bold mb-1">{formatDateToDayString(new Date(label), raidInfos[0])}</p>
                        <p>
                          <strong>{t('hourly_change')}:</strong>
                          <span className="text-green-500 font-semibold ml-1">
                            {changePerHour.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}{' '}
                            {t('playersPerHourUnit')}
                          </span>
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          ({originalChange.toLocaleString()} {t('playersUnit')} / {durationHours.toFixed(1)} {t_ui('hour')})
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
                <ReferenceLine key={ts} x={ts} stroke={isDark ? '#555' : '#ccc'} strokeDasharray="3 3" />
              ))}

              <Line type="monotone" dataKey="changePerHour" name={t('hourly_change')} stroke="#82ca9d" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab.startsWith('boss') && (
          <ResponsiveContainer width="100%" height={500}>
            <AreaChart data={analysisData.clearsOverTime}>
              <XAxis type="number" dataKey="time" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts: number) => formatDateToDayString(new Date(ts), raidInfos[0])} fontSize={12} />
              <YAxis tickFormatter={(val: number) => val.toLocaleString()} />
              <Tooltip content={<CustomAreaChartTooltip raidInfos={raidInfos} />} cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }} />
              <Legend content={<CustomSortedLegend />} />

              {/* Vertical Lines */}
              {analysisData.resetTimestamps.map((ts) => (
                <ReferenceLine key={ts} x={ts} stroke={isDark ? '#555' : '#ccc'} strokeDasharray="3 3" />
              ))}

              {/* Filtered Areas based on STORE State */}
              {Array.from(selectedDiffs)
                .filter((d) => availableDifficulties.includes(d))
                .map((diff) => {
                  const dataKey = isRaid ? diff : `${activeTab}_${diff}`;
                  return <Area key={diff} type="monotone" dataKey={dataKey} name={diff} stackId="1" stroke={DIFFICULTY_COLORS[diff]} fill={DIFFICULTY_COLORS[diff]} />;
                })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
};

export default React.memo(TierAnalysisDashboard);
