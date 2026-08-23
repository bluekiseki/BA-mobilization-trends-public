import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceLine, useXAxisScale, useYAxisScale, type TooltipContentProps } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { HiArrowsUpDown } from 'react-icons/hi2';

// Store
import { useChartControlsStore } from '~/store/chartControlsStore';
import { useIsDarkState } from '~/store/isDarkState';

// Common & Utils
import { getBackgroundRatingColor } from '../dashboard/common';
import { StarRating } from '../StarRating';
import { raidToString } from '../raid/raidToString';
import type { Locale } from '~/utils/i18n/config';
import { difficultyInfo, type DifficultySelect } from '../raid/Difficulty';
import { CheckboxSelect, type CheckboxSelectOption } from '../common/CheckboxSelect';

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
  const { t: t_ui } = useTranslation('ui');
  const { t: t_raids } = useTranslation('raidInfo');
  const difficultyOptions = useMemo<CheckboxSelectOption<DifficultySelect>[]>(
    () => difficultyInfo.filter(({ name }) => name !== 'Extreme').map(({ name }) => ({ value: name, label: t_raids(name) })),
    [t_raids],
  );

  const { chartDataByZ, getFilteredRaidInfoByDifficulty, selectedDifficulties, setSelectedDifficulties } = useChartControlsStore(
    useShallow((state) => ({
      chartDataByZ: state.chartDataByZ,
      getFilteredRaidInfoByDifficulty: state.getFilteredRaidInfoByDifficulty,
      selectedDifficulties: state.selectedDifficulties,
      setSelectedDifficulties: state.setSelectedDifficulties,
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
    type RaidInfo = { Boss?: string; Location?: string; Date?: string };
    const raidInfoMap = new Map<string, RaidInfo>();

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
      const bossName = matchedInfo?.Boss ?? '';
      const teran = matchedInfo?.Location ?? '';

      const dateLabel = matchedInfo?.Date ?? '';

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
      const newRow: RaidUsageData & Record<number, number> = { ...row };
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

  interface CustomYAxisTickProps {
    x?: number;
    y?: number;
    payload?: { value: string };
  }

  const CustomYAxisTick: React.FC<CustomYAxisTickProps> = ({ x = 0, y = 0, payload }: CustomYAxisTickProps) => {
    if (!payload) return null;
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

  interface TooltipPayloadEntry {
    dataKey?: string | number;
    value?: number;
    color?: string;
    payload?: RaidUsageData & Record<number, number>;
  }

  const CustomTooltip = ({ active, payload }: Partial<TooltipContentProps<number, string>> & { payload?: TooltipPayloadEntry[] }) => {
    if (active && payload && payload.length) {
      const dataRow = payload[0]?.payload as (RaidUsageData & Record<number, number>) | undefined;
      if (!dataRow) return null;
      const total = dataRow.totalCount ?? 0;

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

          {payload.map((entry, index) => {
            const star = entry.dataKey;

            if (star === '_anchor') return null;

            const val = Number(entry.value ?? 0);
            const color = entry.color ?? '#8884d8';

            return (
              <div key={index} className="flex items-center gap-3 mb-1 min-w-30">
                <div className="flex items-center gap-1 w-16">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }}></span>
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

  interface CustomLabelProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    value?: number;
  }

  const CustomLabel: React.FC<CustomLabelProps> = ({ x = 0, y = 0, width, height = 0, value }) => {
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

  const TotalCountLabels = () => {
    const xScale = useXAxisScale();
    const yScale = useYAxisScale();

    if (!xScale || !yScale) return null;

    return (
      <>
        {processedData.map((item) => {
          const xPos = xScale(item.totalCount);
          const yPos = yScale(item.displayName, { position: 'middle' });
          if (xPos == null || yPos == null) return null;

          return (
            <text
              key={item.raidId}
              x={xPos + 5}
              y={yPos}
              fill={isDark === 'light' ? '#404040' : '#d4d4d4'}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={11}
              fontWeight="bold"
              style={{ pointerEvents: 'none' }}
            >
              {item.totalCount.toLocaleString()}%
            </text>
          );
        })}
      </>
    );
  };

  return (
    <div data-component-name="RaidUsageStackChart" className="w-full animate-fade-in-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h3 className="text-base font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-2">{t('usage_statistics', { defaultValue: 'Usage Statistics' })}</h3>
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
                {mode === 'all' ? t_ui('all') : mode === 'own' ? t_chart('rank_normal') : t_chart('rank_assist')}
              </button>
            ))}
          </div>

          <CheckboxSelect<DifficultySelect>
            ariaLabel={t_raids('allDifficulties')}
            options={difficultyOptions}
            selectedValues={selectedDifficulties}
            onChange={(next) => setSelectedDifficulties(next.size === 0 ? new Set(['All']) : next)}
            allOption={{ value: 'All', label: t_ui('all') }}
            className="w-32"
          />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={chartHeight} className="[&>svg]:overflow-visible">
        <BarChart layout="vertical" data={processedData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }} barCategoryGap={8}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? '#404040' : '#e5e5e5'} />

          <XAxis type="number" domain={[0, 'auto']} tickFormatter={(val) => `${val}%`} stroke="#94a3b8" fontSize={11} />

          <YAxis dataKey="displayName" type="category" width={isMobile ? 80 : 130} tick={<CustomYAxisTick />} interval={0} />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />

          {starKeys.map((star) => (
            <Bar key={star} dataKey={star} stackId="a" fill={getBackgroundRatingColor(star, isDark) || '#8884d8'} animationDuration={500}>
              <LabelList dataKey={star} content={<CustomLabel />} />
            </Bar>
          ))}

          <ReferenceLine x={100} stroke={isDark == 'dark' ? 'white' : 'black'} strokeDasharray="3 3" />

          <TotalCountLabels />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
