import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceLine } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { HiArrowsUpDown } from 'react-icons/hi2';

// Store
import { useChartControlsStore } from '~/store/chartControlsStore';
import { useIsDarkState } from '~/store/isDarkState';

// Common & Utils
import { getBackgroundRatingColor } from '../dashboard/common';
import { StarRating } from '../StarRatingProps';
import { raidToString } from '../raidToString';
import type { Locale } from '~/utils/i18n/config';

interface RaidUsageData {
  raidId: string;
  displayName: string;
  bossName: string;
  teran: string;
  dateLabel: string;
  totalCount: number;
  breakdown: Record<number, number>;

  _anchor?: number;
}

type AssistantFilter = 'all' | 'own' | 'assist';

export const RaidUsageStackChart: React.FC = () => {
  const { isDark } = useIsDarkState();
  const { t, i18n } = useTranslation('charts', { keyPrefix: 'heatmap' });
  const locale = i18n.language as Locale;

  const { t: t_chart } = useTranslation('charts', {
    keyPrefix: 'ranking.control',
  });

  const { chartDataByZ, getFilteredRaidInfoByDifficulty } = useChartControlsStore(
    useShallow((state) => ({
      chartDataByZ: state.chartDataByZ,
      getFilteredRaidInfoByDifficulty: state.getFilteredRaidInfoByDifficulty,
    })),
  );

  // --- Mobile Check ---
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --- Controls ---
  const [assistantFilter, setAssistantFilter] = useState<AssistantFilter>('all');
  const [isReversed, setIsReversed] = useState(true);

  // --- Data Processing ---
  const { processedData, starKeys } = useMemo(() => {
    if (!chartDataByZ || chartDataByZ.size === 0) {
      return { processedData: [], starKeys: [] };
    }

    const xLabels = getFilteredRaidInfoByDifficulty();
    const raidInfoMap = new Map<string, any>();

    if (xLabels && xLabels.length > 0) {
      xLabels.forEach((info) => {
        const chartLabelKey = raidToString(info, locale, false, false, false, true);
        if (chartLabelKey) {
          raidInfoMap.set(chartLabelKey, info);
        }
      });
    }

    const firstChartData = chartDataByZ.values().next().value;
    if (!firstChartData) return { processedData: [], starKeys: [] };

    const raidLabels = firstChartData.topBar.x;
    const tempMap = new Map<string, RaidUsageData>();

    raidLabels.forEach((label: string) => {
      const matchedInfo = raidInfoMap.get(label);
      const bossName = matchedInfo ? matchedInfo.Boss : '';
      const teran = matchedInfo ? matchedInfo.Location : '';

      let dateLabel = '';
      if (matchedInfo && matchedInfo.Date) {
        dateLabel = `${matchedInfo.Date}`;
      }

      tempMap.set(label, {
        raidId: label,
        displayName: label,
        teran: teran,
        bossName: bossName,
        dateLabel: dateLabel,
        totalCount: 0,
        breakdown: {},
        _anchor: 0,
      });
    });

    const allStars = new Set<number>();

    chartDataByZ.forEach((data, zValue) => {
      const star = zValue;
      const isAssist = zValue < 0;

      if (assistantFilter === 'own' && isAssist) return;
      if (assistantFilter === 'assist' && !isAssist) return;

      data.topBar.values.forEach((val, index) => {
        const label = raidLabels[index];
        const entry = tempMap.get(label);

        if (entry && val > 0) {
          entry.breakdown[star] = (entry.breakdown[star] || 0) + val;
          entry.totalCount += val;
          allStars.add(star);
        }
      });
    });

    let processed = Array.from(tempMap.values()).filter((row) => row.totalCount > 0);

    if (isReversed) {
      processed = processed.reverse();
    }

    const flattenedData = processed.map((row) => {
      const newRow: any = { ...row };
      Object.entries(row.breakdown).forEach(([s, val]) => {
        const starKey = Number(s);
        newRow[starKey] = val;
      });

      newRow._anchor = 0;
      return newRow;
    });

    return {
      processedData: flattenedData,
      starKeys: Array.from(allStars).sort((a, b) => b - a),
    };
  }, [chartDataByZ, assistantFilter, getFilteredRaidInfoByDifficulty, locale, t, isReversed]);

  if (processedData.length === 0) return null;

  const BAR_HEIGHT = 45;
  const PADDING = 60;
  const chartHeight = Math.max(processedData.length * BAR_HEIGHT + PADDING, 300);

  // --- Renderers ---

  const CustomYAxisTick = ({ x, y, payload }: any) => {
    const entry = processedData.find((d) => d.raidId === payload.value);
    if (!entry) return null;

    const hasBossName = !!entry.bossName;
    const limit = isMobile ? 12 : 20;
    const trunc = (str: string) => (str.length > limit ? str.substring(0, limit) + '..' : str);

    const line1 = hasBossName ? trunc(entry.bossName) : trunc(entry.displayName);
    const line2 = hasBossName ? trunc(entry.displayName) : '';

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={-10} y={0} textAnchor="end" fill={'currentColor'} className="text-neutral-700 dark:text-neutral-300 font-medium" style={{ fontSize: isMobile ? '10px' : '11px' }}>
          <tspan x={-10} dy={hasBossName ? -6 : 4}>
            {line1}
          </tspan>
          {hasBossName && (
            <tspan x={-10} dy="1.2em" fill={isDark ? '#9ca3af' : '#64748b'} fontWeight="normal">
              {line2}
            </tspan>
          )}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataRow = payload[0].payload;
      const total = dataRow.totalCount;

      return (
        <div className="rounded border bg-white p-3 text-sm shadow-xl dark:border-neutral-700 dark:bg-neutral-800 z-50">
          <div className="font-bold mb-1 text-neutral-800 dark:text-neutral-100">
            {dataRow.bossName} {dataRow.teran ? dataRow.teran : ''}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 border-b pb-1 dark:border-neutral-600 flex items-center gap-1">
            {dataRow.dateLabel && <span>{dataRow.dateLabel}</span>}
            {dataRow.dateLabel && <span className="mx-0.5 opacity-50">|</span>}
            <span>{dataRow.displayName}</span>
          </div>

          {payload.map((entry: any, index: number) => {
            const star = entry.dataKey;

            if (star === '_anchor') return null;

            const val = entry.value;

            return (
              <div key={index} className="flex items-center gap-3 mb-1 min-w-[120px]">
                <div className="flex items-center gap-1 w-16">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: entry.color }}></span>
                  <span className="text-neutral-600 dark:text-neutral-300">
                    <StarRating n={Math.abs(Number(star))} />
                  </span>
                </div>
                <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200 ml-auto">{val.toLocaleString()}%</span>
              </div>
            );
          })}
          <div className="mt-2 pt-1 border-t dark:border-neutral-600 text-right text-xs text-neutral-500">Total Pick: {total.toLocaleString()} %</div>
        </div>
      );
    }
    return null;
  };

  const renderCustomizedLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    if (!width || width < 50 || !value) return null;

    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fontWeight="bold"
        style={{
          pointerEvents: 'none',
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}
      >
        {value.toLocaleString()}%
      </text>
    );
  };

  const renderTotalLabel = (props: any) => {
    const { x, y, width, height, value } = props;

    return (
      <text
        x={x + width + 5}
        y={y + height / 2}
        fill={isDark == 'light' ? '#404040' : '#d4d4d4'}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight="bold"
        style={{ pointerEvents: 'none' }}
      >
        {value.toLocaleString()}%
      </text>
    );
  };

  return (
    <div data-component-name="RaidUsageStackChart" className="w-full mt-8 animate-fade-in-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">{t('usage_statistics', { defaultValue: 'Usage Statistics' })}</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {t('usage_desc', {
              defaultValue: 'Compare pick rates by star level across raids.',
            })}
          </p>
        </div>

        <div className="flex items-center gap-2 self-end">
          <button
            onClick={() => setIsReversed(!isReversed)}
            className="p-1.5 rounded-md bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            title={isReversed ? 'Oldest First' : 'Newest First'}
          >
            <HiArrowsUpDown className="w-4 h-4" />
          </button>

          <div className="flex rounded-md bg-neutral-100 dark:bg-neutral-700 p-1">
            {(['all', 'own', 'assist'] as AssistantFilter[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setAssistantFilter(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${assistantFilter === mode ? 'bg-white dark:bg-neutral-600 shadow-sm text-blue-600 dark:text-blue-300' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
              >
                {mode === 'all' ? t_chart('rank_all') : mode === 'own' ? t_chart('rank_normal') : t_chart('rank_assist')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart layout="vertical" data={processedData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }} barCategoryGap={8}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? '#404040' : '#e5e5e5'} />

          <XAxis type="number" domain={[0, 'auto']} tickFormatter={(val) => `${val}%`} stroke="#94a3b8" fontSize={11} />

          <YAxis dataKey="displayName" type="category" width={isMobile ? 80 : 130} tick={<CustomYAxisTick />} interval={0} />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />

          {starKeys.map((star) => (
            <Bar key={star} dataKey={star} stackId="a" fill={getBackgroundRatingColor(star, isDark) || '#8884d8'} animationDuration={500}>
              <LabelList dataKey={star} content={renderCustomizedLabel} />
            </Bar>
          ))}

          <Bar key={`bar-anchor-${assistantFilter}`} dataKey="_anchor" stackId="a" fill="transparent" stroke="none" isAnimationActive={false} legendType="none">
            <LabelList dataKey="totalCount" content={renderTotalLabel} position="right" />
          </Bar>

          <ReferenceLine x={100} stroke={isDark == 'dark' ? 'white' : 'black'} strokeDasharray="3 3" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
