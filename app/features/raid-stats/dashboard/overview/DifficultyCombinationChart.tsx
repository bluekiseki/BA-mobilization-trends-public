// app/components/dashboard/GrandAssaultTotalScoreAnalysis.tsx

interface GrandAssaultTotalScoreAnalysisProps {
  fullData: FullData;
  raidInfos: RaidInfo[];
  tierCounter: { [key: string]: number };
  boss: string;
  server: GameServer;
  id: string;
}

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ResponsiveContainer, PieChart, Pie, Sector } from 'recharts';
import type { PieLabelRenderProps, PieSectorShapeProps } from 'recharts';
import { getBracketFromTotalScore, getBracketColorFromTotalScore, SCORE_BRACKETS } from '~/components/raid/Difficulty';
import type { FullData, GameServer, RaidInfo } from '~/types/data';
import { HiSquares2X2, HiTableCells } from 'react-icons/hi2';
import ReactDOMServer from 'react-dom/server';
import { TIER_COLORS, TIER_ORDER } from '~/data/raidInfo';
import { useTranslation } from 'react-i18next';
import { Card } from '../card';
import HistogramAnalysis from './GrandAssaultTotalScoreHistogram';
import type { PlayerAnalysisData } from './types';
import { useERaidAnalysis } from '~/features/raid-stats/dashboard/useERaidAnalysis';
import type { TierName } from '~/features/raid-stats/dashboard/types/eraidAnalysis';
import { type_translation_tab } from '~/components/raid/raidToString';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

// Same hue family as the score bracket the combination belongs to; combinations inside one bracket alternate lighter/darker.
const SHADE_STEPS = [0, 0.22, -0.22, 0.4, -0.4, 0.55, -0.55];
const shadeColor = (color: string, step: number) => {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const amount = SHADE_STEPS[step % SHADE_STEPS.length];
  const target = amount < 0 ? 0 : 255;
  const channels = [0, 2, 4].map((offset) => Math.round(parseInt(match[1].slice(offset, offset + 2), 16) * (1 - Math.abs(amount)) + target * Math.abs(amount)));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
};
const ratioText = (value: number) => (value > 0 && value < 0.01 ? '<0.01' : value.toFixed(2));

interface ChartData {
  name: string;
  value: number;
  percent?: number;
  color?: string;
  fill?: string;
  score?: number;
  denominator?: number;
  scoreMin?: number;
  scoreMax?: number;
  rankMin?: number;
  rankMax?: number;
}

const CustomizedLabel = ({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0, name, value = 0 }: Partial<PieLabelRenderProps>) => {
  if (percent < 2) return null;

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="white" pointerEvents="none">
      <tspan x={x} dy="-0.1em" fontSize="12px" fontWeight="bold">
        {name}
      </tspan>
      <tspan x={x} dy="1.2em" fontSize="10px" opacity={0.8}>
        {value.toLocaleString()}
      </tspan>
    </text>
  );
};

const TooltipContent = ({ data }: { data: ChartData }) => {
  const { t } = useTranslation('dashboard');

  const name = data.name;
  const value = data.value.toLocaleString() as unknown;
  const percent = data.percent;
  return (
    <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm p-3 border rounded-lg shadow-lg text-sm">
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: data.color || data.fill }} />
        <p className="font-bold text-neutral-800 dark:text-neutral-100">{name}</p>
      </div>
      <p className="text-neutral-700 dark:text-neutral-300">{t('tooltipPlayers', { count: value })}</p>
      {data.scoreMin !== undefined && data.scoreMax !== undefined && (
        <p className="text-neutral-600 dark:text-neutral-400">{t('tooltipScore', { name: `${data.scoreMin.toLocaleString()} ~ ${data.scoreMax.toLocaleString()}` })}</p>
      )}
      {data.rankMin !== undefined && data.rankMax !== undefined && (
        <p className="text-neutral-600 dark:text-neutral-400">
          {t('byRank', 'rank')}: {data.rankMin.toLocaleString()} — {data.rankMax.toLocaleString()}
        </p>
      )}
      {percent !== undefined && (
        <p className="text-neutral-600 dark:text-neutral-400">
          {data.denominator !== undefined ? t('actualStats.ratio', { count: data.denominator.toLocaleString(), percent: ratioText(percent) }) : t('tooltipRatio', { percent: percent.toFixed(1) })}
        </p>
      )}
    </div>
  );
};

export default function GrandAssaultTotalScoreAnalysis({ fullData, tierCounter, server, id }: GrandAssaultTotalScoreAnalysisProps) {
  const { t, i18n } = useTranslation('dashboard');
  const { t: t_game } = useTranslation('game');
  const locale = getLocaleShortName(i18n.language as Locale);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [bracketContext, setBracketContext] = useState<string | null>(null);
  const [selectedCombination, setSelectedCombination] = useState<string | null>(null);
  const histogramRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [_isPending, startTransition] = useTransition();
  const [allPlayers, setAllPlayers] = useState<PlayerAnalysisData[]>([]);

  useEffect(() => {
    startTransition(() => {
      if (!fullData.rank) {
        setAllPlayers([]);
        return;
      }

      const tierBoundaries = {
        platinum: tierCounter['4'],
        gold: tierCounter['4'] + tierCounter['3'],
        silver: tierCounter['4'] + tierCounter['3'] + tierCounter['2'],
      };
      const getTierFromRank = (rank: number) => {
        if (rank <= tierBoundaries.platinum) return 'Platinum';
        if (rank <= tierBoundaries.gold) return 'Gold';
        if (rank <= tierBoundaries.silver) return 'Silver';
        return 'Bronze';
      };

      const calculatedPlayers = [...fullData.rank].map((totalScore: number, i: number) => {
        return {
          rank: i + 1,
          totalScore,
          tier: getTierFromRank(i + 1),
        };
      });

      // Update the status when the calculation is complete.
      setAllPlayers(calculatedPlayers);
    });
  }, [fullData, tierCounter, startTransition]);

  const [donutFilter, setDonutFilter] = useState<{
    grouping: 'bracket' | 'actual'; // Grouping criteria
    selectedTier: string | null; // an enlarged tier
  }>({ grouping: 'bracket', selectedTier: null });

  const analysis = useERaidAnalysis({
    server,
    season: id,
    scores: fullData.rank,
    tierCounter,
    enabled: analysisEnabled,
    filters: { tier: donutFilter.selectedTier as TierName | null, bracket: bracketContext },
  });
  const showActual = (bracket: string | null = null) => {
    setAnalysisEnabled(true);
    setBracketContext(bracket);
    setSelectedCombination(null);
    setDonutFilter((previous) => ({ ...previous, grouping: 'actual' }));
  };
  const actualSelection = donutFilter.grouping === 'actual' && analysis.status === 'ready' ? (analysis.data?.combinations.find((item) => item.combination === selectedCombination) ?? null) : null;
  const chooseCombination = (name: string) => {
    setSelectedCombination(name === selectedCombination ? null : name);
    if (name && name !== selectedCombination) histogramRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const readyData = analysis.status === 'ready' ? analysis.data : null;
  const actualColors = useMemo(() => {
    const colors = new Map<string, string>();
    const used = new Map<string, number>();
    for (const item of readyData?.combinations ?? []) {
      const bracket = getBracketFromTotalScore(item.average);
      const step = used.get(bracket) ?? 0;
      used.set(bracket, step + 1);
      colors.set(item.combination, shadeColor(getBracketColorFromTotalScore(item.average), step));
    }
    return colors;
  }, [readyData]);
  // Rank span of each combination: best = 1 + players scoring above its max, worst = players scoring at or above its min.
  const actualRanks = useMemo(() => {
    const ranks = new Map<string, { rankMin: number; rankMax: number }>();
    for (const item of readyData?.combinations ?? []) {
      let above = 0;
      let atOrAbove = 0;
      for (const player of allPlayers) {
        if (player.totalScore > item.max) above += 1;
        if (player.totalScore >= item.min) atOrAbove += 1;
      }
      ranks.set(item.combination, { rankMin: above + 1, rankMax: atOrAbove });
    }
    return ranks;
  }, [readyData, allPlayers]);
  const actualGroups: ChartData[] = readyData
    ? readyData.combinations.map((item) => ({
        name: item.combination,
        value: item.count,
        percent: (item.count / readyData.summary.recordCount) * 100,
        denominator: readyData.summary.recordCount,
        scoreMin: item.min,
        scoreMax: item.max,
        ...actualRanks.get(item.combination),
        color: actualColors.get(item.combination),
      }))
    : [];

  // Score brackets that actually have players, offered in the difficulty dropdown.
  const presentBracketNames = useMemo(() => {
    const present = new Set(allPlayers.map((player) => getBracketFromTotalScore(player.totalScore)));
    return SCORE_BRACKETS.filter((bracket) => present.has(bracket.name)).map((bracket) => bracket.name);
  }, [allPlayers]);

  const [legendView, setLegendView] = useState<'chips' | 'table'>('chips');
  const [legendExpanded, setLegendExpanded] = useState(false);
  const LEGEND_PREVIEW = 8;
  const actualLegend = legendExpanded ? actualGroups : actualGroups.slice(0, LEGEND_PREVIEW);
  const selectedGroup = actualGroups.find((item) => item.name === selectedCombination);
  if (selectedGroup && !actualLegend.some((item) => item.name === selectedGroup.name)) actualLegend.push(selectedGroup);

  // 2. Calculate data for doughnut charts
  const addPercentage = (data: ChartData[], total: number) => {
    return total > 0
      ? data.map((entry) => ({
          ...entry,
          percent: (entry.value / total) * 100,
        }))
      : data;
  };
  const donutTierData = useMemo(() => {
    const scopedPlayers = donutFilter.grouping === 'actual' && bracketContext ? allPlayers.filter((player) => getBracketFromTotalScore(player.totalScore) === bracketContext) : allPlayers;
    const tierCounts = new Map<string, number>();
    for (const player of scopedPlayers) {
      tierCounts.set(player.tier, (tierCounts.get(player.tier) || 0) + 1);
    }
    const result = Array.from(tierCounts.entries())
      .map(([name, value]) => ({
        name,
        value,
        fill: TIER_COLORS[name],
      }))
      .sort((a, b) => TIER_ORDER.indexOf(a.name) - TIER_ORDER.indexOf(b.name));

    return addPercentage(result, scopedPlayers.length);
  }, [allPlayers, donutFilter.grouping, bracketContext]);

  // 3-2. Doughnut: Primary filtering based on the selected tier
  const donutFilteredPlayers = useMemo(() => {
    if (donutFilter.selectedTier) {
      return allPlayers.filter((p) => p.tier === donutFilter.selectedTier);
    }
    return allPlayers;
  }, [allPlayers, donutFilter.selectedTier]);

  // 3-3. Donuts: Calculate group (combination) data based on primary filtered data
  const donutGroupData = useMemo(() => {
    const groupCounts = new Map<string, { count: number; totalScore: number; scoreMin: number; scoreMax: number; rankMin: number; rankMax: number }>();
    for (const player of donutFilteredPlayers) {
      const groupKey = getBracketFromTotalScore(player.totalScore);
      const current = groupCounts.get(groupKey);
      if (current) {
        current.count += 1;
        current.totalScore += player.totalScore;
        current.scoreMin = Math.min(current.scoreMin, player.totalScore);
        current.scoreMax = Math.max(current.scoreMax, player.totalScore);
        current.rankMin = Math.min(current.rankMin, player.rank);
        current.rankMax = Math.max(current.rankMax, player.rank);
      } else {
        groupCounts.set(groupKey, { count: 1, totalScore: player.totalScore, scoreMin: player.totalScore, scoreMax: player.totalScore, rankMin: player.rank, rankMax: player.rank });
      }
    }

    const result = Array.from(groupCounts.entries())
      .map(([name, data]) => {
        const avgScore = data.count > 0 ? data.totalScore / data.count : 0;
        return {
          name,
          value: data.count,
          color: getBracketColorFromTotalScore(avgScore),
          score: avgScore,
          scoreMin: data.scoreMin,
          scoreMax: data.scoreMax,
          rankMin: data.rankMin,
          rankMax: data.rankMax,
        };
      })
      .sort((a, b) => b.score - a.score);

    return addPercentage(result, donutFilteredPlayers.length);
  }, [donutFilteredPlayers, donutFilter.grouping]);

  // 3-4. final data aggregation
  const donutData = useMemo(() => {
    return { tier: donutTierData, group: donutFilter.grouping === 'actual' ? actualGroups : donutGroupData };
  }, [donutTierData, donutGroupData, donutFilter.grouping, actualGroups]);

  const handleMouseEnter = (data: ChartData, _event?: React.MouseEvent) => {
    const tooltipNode = tooltipRef.current;
    if (!tooltipNode) return;
    const htmlContent = ReactDOMServer.renderToStaticMarkup(<TooltipContent data={data} />);
    tooltipNode.innerHTML = htmlContent;
    tooltipNode.style.opacity = '1';
  };
  const handleMouseMove = (event: React.MouseEvent) => {
    if (tooltipRef.current) {
      // tooltipRef.current.style.transform = `translate(${event.clientX + 10}px, ${event.clientY + 10}px)`;
      tooltipRef.current.style.transform = `translate(${event.nativeEvent.offsetX + 10}px, ${event.nativeEvent.offsetY + 10}px)`;
    }
  };
  const handleMouseLeave = () => {
    if (tooltipRef.current) {
      tooltipRef.current.style.opacity = '0';
    }
  };

  // Legend chips sit below the chart, so the tooltip is placed just above the hovered/focused chip.
  const showLegendTooltip = (data: ChartData, anchor: HTMLElement) => {
    handleMouseEnter(data);
    const tooltipNode = tooltipRef.current;
    const containerNode = containerRef.current;
    if (!tooltipNode || !containerNode) return;
    const containerRect = containerNode.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const maxX = Math.max(0, containerRect.width - tooltipNode.offsetWidth);
    const x = Math.min(Math.max(0, anchorRect.left - containerRect.left), maxX);
    const y = anchorRect.top - containerRect.top - tooltipNode.offsetHeight - 6;
    tooltipNode.style.transform = `translate(${x}px, ${y}px)`;
  };

  const handleTouchStart = (data: ChartData, event: React.TouchEvent) => {
    const touch = event.touches[0];
    const tooltipNode = tooltipRef.current;
    const containerNode = containerRef.current;
    if (!touch || !tooltipNode || !containerNode) return;

    const rect = containerNode.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const htmlContent = ReactDOMServer.renderToStaticMarkup(<TooltipContent data={data} />);
    tooltipNode.innerHTML = htmlContent;
    tooltipNode.style.opacity = '1';
    tooltipNode.style.transform = `translate(${x + 10}px, ${y + 10}px)`;
  };

  // Hide tooltip when tapping outside the chart
  useEffect(() => {
    const handleOutsidePointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, []);

  const tableRows = donutFilter.grouping === 'actual' ? actualGroups : donutData.group;

  return (
    <div className="p-0 bg-neutral-50 dark:bg-neutral-900 space-y-8" onMouseLeave={handleMouseLeave}>
      <Card title={t('donutChartTitle')} className="space-y-4">
        <h3 className="text-sm mb-2">
          {donutFilter.grouping === 'actual' && analysis.data
            ? t('actualStats.order', { armors: analysis.data.armorTypes.map((armor) => type_translation_tab[armor][locale]).join(' · ') })
            : t('donutChartSubtitle')}
        </h3>
        <div className="p-2 bg-neutral-50 dark:bg-neutral-800/50 border dark:border-neutral-700 rounded-lg">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold">{t('groupingCriteria')}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDonutFilter((p) => ({ ...p, grouping: 'bracket' }));
                    setSelectedCombination(null);
                    setBracketContext(null);
                  }}
                  className={`h-7 px-2 text-xs rounded ${donutFilter.grouping === 'bracket' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                >
                  {t('scoreCutBracket')}
                </button>
                <button
                  type="button"
                  aria-pressed={donutFilter.grouping === 'actual'}
                  onClick={() => showActual()}
                  className={`h-7 px-2 text-xs rounded ${donutFilter.grouping === 'actual' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                >
                  {t('actualCombination')}
                </button>
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold">Tier</span>
              <select
                value={donutFilter.selectedTier ?? ''}
                onChange={(e) => {
                  setDonutFilter((p) => ({ ...p, selectedTier: e.target.value || null }));
                  setSelectedCombination(null);
                }}
                className="h-7 px-2 text-xs rounded bg-neutral-200 dark:bg-neutral-700"
              >
                <option value="">{t('actualStats.all')}</option>
                {TIER_ORDER.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
            {donutFilter.grouping === 'actual' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold">{t_game('difficulty')}</span>
                <select
                  value={bracketContext ?? ''}
                  onChange={(e) => {
                    setBracketContext(e.target.value || null);
                    setSelectedCombination(null);
                  }}
                  className="h-7 px-2 text-xs rounded bg-neutral-200 dark:bg-neutral-700"
                >
                  <option value="">{t('actualStats.all')}</option>
                  {presentBracketNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(donutFilter.selectedTier || bracketContext || selectedCombination) && (
              <button
                onClick={() => {
                  setDonutFilter((p) => ({ ...p, selectedTier: null }));
                  setBracketContext(null);
                  setSelectedCombination(null);
                }}
                className="h-7 px-2 text-xs whitespace-nowrap ml-auto bg-neutral-300 dark:bg-neutral-600 rounded"
              >
                {t('viewAll')}
              </button>
            )}
          </div>
        </div>

        <div ref={containerRef} className="relative" style={{ width: '100%', height: 'min(600px, 100vw)' }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          {donutFilter.grouping === 'actual' && analysis.status !== 'ready' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85 dark:bg-neutral-900/85 text-sm" role="status">
              {analysis.status === 'error' ? (
                <button type="button" onClick={analysis.retry} className="underline">
                  {t('actualStats.retry')}
                </button>
              ) : (
                t('actualStats.loading')
              )}
            </div>
          )}
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={donutData.tier}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="59%"
                innerRadius="30%"
                onClick={(_, i) =>
                  setDonutFilter((p) => ({
                    ...p,
                    selectedTier: donutData.tier[i].name,
                  }))
                }
                labelLine={false}
                label={<CustomizedLabel />}
                shape={(props: PieSectorShapeProps) => {
                  const entry = donutData.tier[props.index];
                  if (!entry) return <Sector {...props} />;
                  const fill = TIER_COLORS[entry.name];
                  return (
                    <Sector
                      {...props}
                      fill={fill}
                      className={`cursor-pointer transition-opacity duration-300 ${donutFilter.selectedTier && donutFilter.selectedTier !== entry.name ? 'opacity-30' : 'opacity-100'}`}
                      onMouseEnter={(e) => handleMouseEnter(entry, e)}
                      onMouseLeave={handleMouseLeave}
                      onTouchStart={(e) => handleTouchStart(entry, e)}
                    />
                  );
                }}
              />
              <Pie
                data={donutData.group}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="90%"
                innerRadius="61%"
                labelLine={false}
                label={<CustomizedLabel />}
                shape={(props: PieSectorShapeProps) => {
                  const entry = donutData.group[props.index];
                  if (!entry) return <Sector {...props} />;
                  const clickable = donutFilter.grouping === 'actual' && Boolean(analysis.data?.combinations.some((item) => item.combination === entry.name));
                  return (
                    <Sector
                      {...props}
                      fill={entry.color}
                      opacity={donutFilter.grouping === 'actual' && selectedCombination && selectedCombination !== entry.name ? 0.25 : 1}
                      onClick={() => {
                        if (clickable) chooseCombination(entry.name);
                      }}
                      className={clickable ? 'cursor-pointer' : undefined}
                      onMouseEnter={(e) => handleMouseEnter(entry, e)}
                      onMouseLeave={handleMouseLeave}
                      onTouchStart={(e) => handleTouchStart(entry, e)}
                    />
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div
            ref={tooltipRef}
            className="pointer-events-none transition-opacity duration-200"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: 0,
              zIndex: 999,
            }}
          />
        </div>

        {legendView === 'chips' ? (
          <div className={donutFilter.grouping === 'actual' ? 'flex flex-wrap justify-center gap-2 max-h-40 overflow-y-auto' : 'flex flex-wrap justify-center gap-2'}>
            {(donutFilter.grouping === 'actual' ? actualLegend : donutData.group).map((item) => (
              <button
                type="button"
                key={item.name}
                onFocus={(e) => showLegendTooltip(item, e.currentTarget)}
                onMouseEnter={(e) => showLegendTooltip(item, e.currentTarget)}
                onMouseLeave={handleMouseLeave}
                onBlur={handleMouseLeave}
                title={item.denominator !== undefined ? t('actualStats.ratio', { count: item.denominator.toLocaleString(), percent: ratioText(item.percent ?? 0) }) : undefined}
                disabled={donutFilter.grouping === 'actual' && !analysis.data?.combinations.some((combo) => combo.combination === item.name)}
                aria-pressed={donutFilter.grouping === 'actual' ? selectedCombination === item.name : undefined}
                onClick={() => (donutFilter.grouping === 'actual' ? chooseCombination(item.name) : showActual(item.name))}
                className={`p-1 px-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs flex items-center gap-2 ${selectedCombination === item.name ? 'ring-2 ring-blue-500' : ''}`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-semibold">{item.name}</span>
                <span className="font-mono text-neutral-600 dark:text-neutral-400">{item.value.toLocaleString()}</span>
              </button>
            ))}
            {donutFilter.grouping === 'actual' && actualGroups.length > LEGEND_PREVIEW && (
              <button type="button" onClick={() => setLegendExpanded((value) => !value)} aria-expanded={legendExpanded} className="p-1 px-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-700 text-xs">
                {legendExpanded ? t('actualStats.less') : t('actualStats.more', { count: actualGroups.length - LEGEND_PREVIEW })}
              </button>
            )}
            <button
              type="button"
              onClick={() => setLegendView('table')}
              title={t('actualStats.viewTable')}
              aria-label={t('actualStats.viewTable')}
              className="p-1 px-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-700 text-xs flex items-center"
            >
              <HiTableCells />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setLegendView('chips')}
              title={t('actualStats.viewChips')}
              aria-label={t('actualStats.viewChips')}
              className="h-7 w-7 flex items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700"
            >
              <HiSquares2X2 />
            </button>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 text-left text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900">
                  <tr className="border-b dark:border-neutral-700">
                    <th className="py-1 pr-2 font-semibold">
                      {donutFilter.grouping === 'actual' ? t('actualCombination') : t('scoreCutBracket')}
                      {donutFilter.grouping === 'actual' && analysis.data && (
                        <span className="block font-normal">({analysis.data.armorTypes.map((armor) => type_translation_tab[armor][locale]).join(' · ')})</span>
                      )}
                    </th>
                    <th className="py-1 px-2 font-semibold text-right">{t('playerCount')}</th>
                    <th className="py-1 px-2 font-semibold text-right">{t('actualStats.share')}</th>
                    <th className="py-1 pl-2 font-semibold sm:hidden">
                      {t('byScore')} / {t('byRank')}
                    </th>
                    <th className="py-1 px-2 font-semibold hidden sm:table-cell">{t('byScore')}</th>
                    <th className="py-1 pl-2 font-semibold hidden sm:table-cell">{t('byRank')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((item) => {
                    const selectable = donutFilter.grouping === 'actual' ? Boolean(analysis.data?.combinations.some((combo) => combo.combination === item.name)) : true;
                    const scoreText = item.scoreMin !== undefined && item.scoreMax !== undefined ? `${item.scoreMin.toLocaleString()} ~ ${item.scoreMax.toLocaleString()}` : '-';
                    const rankText = item.rankMin !== undefined && item.rankMax !== undefined ? `${item.rankMin.toLocaleString()} — ${item.rankMax.toLocaleString()}` : '-';
                    return (
                      <tr
                        key={item.name}
                        onClick={selectable ? () => (donutFilter.grouping === 'actual' ? chooseCombination(item.name) : showActual(item.name)) : undefined}
                        className={`border-b last:border-b-0 dark:border-neutral-800 ${selectable ? 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800' : 'opacity-50'} ${selectedCombination === item.name ? 'bg-blue-500/10' : ''}`}
                      >
                        <td className="py-1 pr-2">
                          <button
                            type="button"
                            disabled={!selectable}
                            aria-pressed={donutFilter.grouping === 'actual' ? selectedCombination === item.name : undefined}
                            className="flex items-center gap-2 font-semibold"
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            {item.name}
                          </button>
                        </td>
                        <td className="py-1 px-2 text-right font-mono">{item.value.toLocaleString()}</td>
                        <td className="py-1 px-2 text-right font-mono">{item.percent !== undefined ? `${ratioText(item.percent)}%` : '-'}</td>
                        <td className="py-1 pl-2 font-mono sm:hidden">
                          <div>{scoreText}</div>
                          <div className="text-neutral-500 dark:text-neutral-400">{rankText}</div>
                        </td>
                        <td className="py-1 px-2 font-mono whitespace-nowrap hidden sm:table-cell">{scoreText}</td>
                        <td className="py-1 pl-2 font-mono whitespace-nowrap hidden sm:table-cell">{rankText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <div ref={histogramRef} className="scroll-mt-20">
        <Card title={t('histogramTitle')} defaultExpanded={true} className="space-y-4">
          {/* Now, the HistogramAnalysis component will ONLY be mounted
                  (and its logic run) when the user expands this Card.
                */}
          <HistogramAnalysis
            allPlayers={allPlayers}
            tierCounter={tierCounter}
            actualSelection={actualSelection}
            actualColor={selectedCombination ? actualColors.get(selectedCombination) : undefined}
            actualTier={donutFilter.selectedTier as TierName | null}
            actualBracket={bracketContext}
            actualHistogram={analysis.histogram}
            onHistogramQuery={analysis.requestHistogram}
            onClearSelection={() => setSelectedCombination(null)}
          />
        </Card>
      </div>
    </div>
  );
}
