// app/components/dashboard/GrandAssaultTotalScoreAnalysis.tsx

const DIFFICULTY_WEIGHT: { [key: string]: number } = {
  L: 7,
  T: 6,
  I: 5,
  E: 4,
  H: 3,
  V: 2,
  A: 1,
  N: 0,
};

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
import { getDifficultyFromScoreAndBoss, getBracketFromTotalScore, getBracketColorFromTotalScore } from '~/components/raid/Difficulty';
import type { FullData, GameServer, RaidInfo } from '~/types/data';
import ReactDOMServer from 'react-dom/server';
import { TIER_COLORS, TIER_ORDER } from '~/data/raidInfo';
import { useTranslation } from 'react-i18next';
import { Card } from '../card';
import HistogramAnalysis from './GrandAssaultTotalScoreHistogram';

export interface PlayerAnalysisData {
  rank: number;
  totalScore: number;
  combination: string;
  tier: string;
}
interface ChartData {
  name: string;
  value: number;
  percent?: number;
  color?: string;
  fill?: string;
  score?: number;
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
      {percent !== undefined && <p className="text-neutral-600 dark:text-neutral-400">{t('tooltipRatio', { percent: percent.toFixed(1) })}</p>}
    </div>
  );
};

export default function GrandAssaultTotalScoreAnalysis({ fullData, raidInfos, tierCounter, server, id }: GrandAssaultTotalScoreAnalysisProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('dashboard');
  const [_isPending, startTransition] = useTransition();
  const [allPlayers, setAllPlayers] = useState<PlayerAnalysisData[]>([]);

  useEffect(() => {
    startTransition(() => {
      const scoreArrays = raidInfos.map((_, index) => fullData[`rank_${index + 1}` as keyof FullData] as Int32Array);
      if (scoreArrays.some((arr) => !arr) || !fullData.rank) {
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
        const combinationLetters = scoreArrays.map((scores) => getDifficultyFromScoreAndBoss(scores[i], server, id)[0]);

        combinationLetters.sort((a, b) => (DIFFICULTY_WEIGHT[b] || 0) - (DIFFICULTY_WEIGHT[a] || 0));
        const combination = combinationLetters.join('');

        return {
          rank: i + 1,
          totalScore,
          combination,
          tier: getTierFromRank(i + 1),
        };
      });

      // Update the status when the calculation is complete.
      setAllPlayers(calculatedPlayers);
    });
  }, [fullData, raidInfos, tierCounter, startTransition]);

  const [donutFilter, setDonutFilter] = useState<{
    grouping: 'actual' | 'bracket'; // Grouping criteria
    selectedTier: string | null; // an enlarged tier
  }>({ grouping: 'bracket', selectedTier: null });

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
    const tierCounts = new Map<string, number>();
    for (const player of allPlayers) {
      tierCounts.set(player.tier, (tierCounts.get(player.tier) || 0) + 1);
    }
    const result = Array.from(tierCounts.entries())
      .map(([name, value]) => ({
        name,
        value,
        fill: TIER_COLORS[name],
      }))
      .sort((a, b) => TIER_ORDER.indexOf(a.name) - TIER_ORDER.indexOf(b.name));

    return addPercentage(result, allPlayers.length);
  }, [allPlayers]);

  // 3-2. Doughnut: Primary filtering based on the selected tier
  const donutFilteredPlayers = useMemo(() => {
    if (donutFilter.selectedTier) {
      return allPlayers.filter((p) => p.tier === donutFilter.selectedTier);
    }
    return allPlayers;
  }, [allPlayers, donutFilter.selectedTier]);

  // 3-3. Donuts: Calculate group (combination) data based on primary filtered data
  const donutGroupData = useMemo(() => {
    const groupCounts = new Map<string, { count: number; totalScore: number }>();
    for (const player of donutFilteredPlayers) {
      const groupKey = donutFilter.grouping === 'actual' ? player.combination : getBracketFromTotalScore(player.totalScore);
      const current = groupCounts.get(groupKey) || { count: 0, totalScore: 0 };
      current.count += 1;
      current.totalScore += player.totalScore;
      groupCounts.set(groupKey, current);
    }

    const result = Array.from(groupCounts.entries())
      .map(([name, data]) => {
        const avgScore = data.count > 0 ? data.totalScore / data.count : 0;
        return {
          name,
          value: data.count,
          color: getBracketColorFromTotalScore(avgScore),
          score: avgScore,
        };
      })
      .sort((a, b) => b.score - a.score);

    return addPercentage(result, donutFilteredPlayers.length);
  }, [donutFilteredPlayers, donutFilter.grouping]);

  // 3-4. final data aggregation
  const donutData = useMemo(() => {
    return { tier: donutTierData, group: donutGroupData };
  }, [donutTierData, donutGroupData]);

  const handleMouseEnter = (data: ChartData, _event: React.MouseEvent) => {
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

  return (
    <div className="p-0 bg-neutral-50 dark:bg-neutral-900 space-y-8" onMouseLeave={handleMouseLeave}>
      <Card title={t('donutChartTitle')} className="space-y-4">
        <h3 className="text-sm mb-2">{t('donutChartSubtitle')}</h3>
        <div className="p-2 bg-neutral-50 dark:bg-neutral-800/50 border dark:border-neutral-700 rounded-lg flex justify-between items-center">
          <div>
            <label className="text-sm font-bold">{t('groupingCriteria')}</label>
            <div className="flex gap-2 mt-1">
              {/* <button onClick={() => setDonutFilter(p => ({ ...p, grouping: 'actual' }))} className={`px-2 py-1 text-xs rounded ${donutFilter.grouping === 'actual' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}>{t('actualCombination')}</button> */}
              <button
                onClick={() => setDonutFilter((p) => ({ ...p, grouping: 'bracket' }))}
                className={`px-2 py-1 text-xs rounded ${donutFilter.grouping === 'bracket' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
              >
                {t('scoreCutBracket')}
              </button>
            </div>
          </div>
          {donutFilter.selectedTier && (
            <button onClick={() => setDonutFilter((p) => ({ ...p, selectedTier: null }))} className="px-3 py-1 text-sm bg-neutral-300 dark:bg-neutral-600 rounded">
              {t('viewAll')}
            </button>
          )}
        </div>

        <div ref={containerRef} className="relative" style={{ width: '100%', height: 'min(600px, 100vw)' }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
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
                  return (
                    <Sector
                      {...props}
                      fill={entry.color}
                      className="cursor-pointer"
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

        <div className="flex flex-wrap justify-center gap-2">
          {donutData.group.map((item) => (
            <div key={item.name} className="p-1 px-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-semibold">{item.name}</span>
              <span className="font-mono text-neutral-600 dark:text-neutral-400">{item.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('histogramTitle')} defaultExpanded={true} className="space-y-4">
        {/* Now, the HistogramAnalysis component will ONLY be mounted
                  (and its logic run) when the user expands this Card.
                */}
        <HistogramAnalysis allPlayers={allPlayers} tierCounter={tierCounter} />
      </Card>
    </div>
  );
}
