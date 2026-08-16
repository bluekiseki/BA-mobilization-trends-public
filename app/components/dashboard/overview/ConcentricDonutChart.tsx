// app/components/dashboard/ConcentricDonutChart.tsx

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ResponsiveContainer, PieChart, Pie, Sector } from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { getDifficultyFromScoreAndBoss } from '~/components/raid/Difficulty';
import { calculateTimeFromScore, getTimeoutFromBoss } from '~/utils/calculateTimeFromScore';
import type { GameServer } from '~/types/data';
import ReactDOMServer from 'react-dom/server';

interface PlayerData {
  rank: number;
  score: number;
  tier: string;
  difficulty: string;
  timeBin: string;
}
interface ChartData {
  name: string;
  value: number;
  difficultyName?: string;
  timeBinName?: string;
  percent?: number;
}

interface FilterState {
  type: 'tier' | 'difficulty' | 'timeBin';
  value: string;
}

interface ConcentricDonutChartProps {
  scores: Int32Array;
  tierCounter: { [key: string]: number };
  boss: string;
  server: GameServer;
  id: string;
}

interface InnerConcentricDonutChartProps extends ConcentricDonutChartProps {
  timeBinMinutes: number;
}

const TIER_ORDER = ['Platinum', 'Gold', 'Silver', 'Bronze'];
const DIFFICULTY_ORDER = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];

const tierColors: { [key: string]: string } = {
  Platinum: '#cda7fd',
  Gold: '#fcd34d',
  Silver: '#d1d5db',
  Bronze: '#d97706',
};
const difficultyColors: { [key: string]: string } = {
  Lunatic: '#ef4444',
  Torment: '#dc2626',
  Insane: '#f97316',
  Extreme: '#f59e0b',
  Hardcore: '#3b82f6',
  Veryhard: '#8b5cf6',
  Hard: '#14b8a6',
  Normal: '#6b7280',
};
// const timeColors = ['#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];

const calculateDistribution = (players: PlayerData[], category: keyof PlayerData): ChartData[] => {
  const counts = new Map<string, number>();
  for (const player of players) {
    const key = player[category];
    counts.set(String(key), (counts.get(String(key)) || 0) + 1);
  }

  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
};

type CustomizedLabelProps = Partial<PieLabelRenderProps> & { timeBinName?: string };

const CustomizedLabel = ({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0, name, value = 0 }: CustomizedLabelProps) => {
  if (percent < 2) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" pointerEvents="none">
      <tspan x={x} dy="-0.1em" fontSize="12px" fontWeight="bold">
        {name}
      </tspan>
      <tspan x={x} dy="1.2em" fontSize="10px" opacity={0.8}>
        {value.toLocaleString()}
      </tspan>
    </text>
  );
};

const calculateTimeDistributionByDifficulty = (players: PlayerData[]): ChartData[] => {
  const counts = new Map<string, { value: number; difficulty: string; timeBin: string }>();
  for (const player of players) {
    if (player.timeBin === 'N/A') continue;

    const key = `${player.difficulty}-${player.timeBin}`;
    const current = counts.get(key) || {
      value: 0,
      difficulty: player.difficulty,
      timeBin: player.timeBin,
    };
    current.value += 1;
    counts.set(key, current);
  }
  return Array.from(counts.entries()).map(([name, data]) => ({
    name,
    value: data.value,
    difficultyName: data.difficulty,
    timeBinName: data.timeBin,
  }));
};

const TooltipContent = ({ data, fill }: { data: ChartData; fill: string }) => {
  const name = data.timeBinName || data.name;
  const value = data.value;
  const percent = data.percent;

  const { t } = useTranslation('dashboard');

  return (
    <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm p-3 border rounded-lg shadow-lg text-sm">
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: fill }} />
        <p className="font-bold text-neutral-800 dark:text-neutral-100">{name}</p>
      </div>
      <p className="text-neutral-700 dark:text-neutral-300">{t('tooltipPlayers', { count: value })}</p>
      {percent !== undefined && <p className="text-neutral-600 dark:text-neutral-400">{t('tooltipRatio', { percent: percent.toFixed(1) })}</p>}
    </div>
  );
};

export function ConcentricDonutChartItem({ boss, server, id, scores, tierCounter, timeBinMinutes }: InnerConcentricDonutChartProps) {
  const [filter, setFilter] = useState<FilterState | null>(null);
  const { t } = useTranslation('dashboard');
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allPlayers = useMemo(() => {
    if (!scores || !tierCounter) return [];

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

    return [...scores].map((score, index) => {
      const timeInSeconds = calculateTimeFromScore(score, boss, server, id);
      const timeBinIndex = timeInSeconds !== undefined ? Math.floor(timeInSeconds / (timeBinMinutes * 60)) : -1;
      const startTime = timeBinIndex * timeBinMinutes;

      return {
        rank: index + 1,
        score,
        tier: getTierFromRank(index + 1),
        difficulty: getDifficultyFromScoreAndBoss(score, server, id),
        timeBin: timeInSeconds !== undefined ? `${startTime}-${startTime + timeBinMinutes}m` : 'N/A',
      };
    });
  }, [scores, tierCounter, boss, server, id, timeBinMinutes]);

  // 2. Dynamic calculation of data to display when changing filters
  const displayData = useMemo(() => {
    if (allPlayers.length === 0) return { tier: [], difficulty: [], timeBin: [] };

    const addPercentage = (data: ChartData[]) => {
      const total = data.reduce((sum, entry) => sum + entry.value, 0);
      if (total === 0) return data;
      return data.map((entry) => ({
        ...entry,
        percent: (entry.value / total) * 100,
      }));
    };

    const playersForDifficultyAndBeyond = filter?.type === 'tier' ? allPlayers.filter((p) => p.tier === filter.value) : allPlayers;
    const playersForTime = filter?.type === 'difficulty' ? playersForDifficultyAndBeyond.filter((p) => p.difficulty === filter.value) : playersForDifficultyAndBeyond;

    return {
      tier: addPercentage(calculateDistribution(allPlayers, 'tier').sort((a, b) => TIER_ORDER.indexOf(a.name) - TIER_ORDER.indexOf(b.name))),
      difficulty: addPercentage(calculateDistribution(playersForDifficultyAndBeyond, 'difficulty').sort((a, b) => DIFFICULTY_ORDER.indexOf(a.name) - DIFFICULTY_ORDER.indexOf(b.name))),
      timeBin: addPercentage(calculateTimeDistributionByDifficulty(playersForTime)),
    };
  }, [allPlayers, filter]);

  const totalDifficultyPlayers = useMemo(() => displayData.difficulty.reduce((sum, entry) => sum + entry.value, 0), [displayData.difficulty]);

  const handleFilter = (type: FilterState['type'], value: string) => {
    if (filter?.type === type && filter?.value === value) setFilter(null);
    else setFilter({ type, value });
  };

  const handleMouseEnter = (data: ChartData, event: React.MouseEvent, fill: string) => {
    // const name = data.timeBinName || data.name;
    // const value = data.value;
    // const percent = data.percent;

    const tooltipNode = tooltipRef.current;
    if (!tooltipNode) return;

    if (!event.clientX || !event.clientY) return;

    const htmlContent = ReactDOMServer.renderToStaticMarkup(<TooltipContent data={data} fill={fill} />);

    // Insert and display content
    tooltipNode.innerHTML = htmlContent;
    tooltipNode.style.opacity = '1';
    tooltipNode.style.transform = `translate(${event.clientX + 10}px, ${event.clientY + 10}px)`;
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    const tooltipNode = tooltipRef.current;
    if (!tooltipNode) return;

    tooltipNode.style.transform = `translate(${event.clientX + 10}px, ${event.clientY + 10}px)`;
  };

  const handleMouseLeave = () => {
    const tooltipNode = tooltipRef.current;
    if (!tooltipNode) return;

    // Tooltip hide
    tooltipNode.style.opacity = '0';
  };

  const handleTouchStart = (data: ChartData, event: React.TouchEvent, fill: string) => {
    const touch = event.touches[0];
    if (!touch) return;

    const tooltipNode = tooltipRef.current;
    if (!tooltipNode) return;

    const htmlContent = ReactDOMServer.renderToStaticMarkup(<TooltipContent data={data} fill={fill} />);
    tooltipNode.innerHTML = htmlContent;
    tooltipNode.style.opacity = '1';
    tooltipNode.style.transform = `translate(${touch.clientX + 10}px, ${touch.clientY + 10}px)`;
  };

  // Hide tooltip when tapping outside the chart
  useEffect(() => {
    const handleOutsidePointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const tooltipNode = tooltipRef.current;
        if (tooltipNode) tooltipNode.style.opacity = '0';
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, []);

  return (
    <div ref={containerRef}>
      <div className="py-4" style={{ width: '100%', height: 'min(600px, 100vw)' }} onMouseMove={handleMouseMove}>
        <ResponsiveContainer>
          <PieChart>
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="central"
              className="cursor-pointer text-lg font-bold fill-current text-neutral-800 dark:text-neutral-200"
              onClick={() => setFilter(null)}
            >
              {filter ? filter.value : t('totalStatus')}
            </text>
            {filter && (
              <text x="50%" y="50%" dy={20} textAnchor="middle" className="cursor-pointer text-xs fill-current text-neutral-500 dark:text-neutral-400" onClick={() => setFilter(null)}>
                {t('clickToReset')}
              </text>
            )}

            <Pie
              data={displayData.tier}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="39%"
              innerRadius="20%"
              onClick={(_, i) => handleFilter('tier', displayData.tier[i].name)}
              shape={(props) => {
                const { index } = props as { index: number };
                const entry = displayData.tier[index];
                if (!entry) return <Sector {...props} />;
                const fill = tierColors[entry.name] ?? '#8884d8';
                return (
                  <Sector
                    {...props}
                    fill={fill}
                    className={`cursor-pointer transition-opacity ${filter?.type === 'tier' && filter.value !== entry.name ? 'opacity-30' : 'opacity-100'}`}
                    onMouseEnter={(e) => handleMouseEnter(entry, e, fill)}
                    onMouseLeave={handleMouseLeave}
                    onTouchStart={(e) => handleTouchStart(entry, e, fill)}
                  />
                );
              }}
            />

            <Pie
              data={displayData.difficulty}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="69%"
              innerRadius="41%"
              labelLine={false}
              label={<CustomizedLabel />}
              onClick={(_, i) => handleFilter('difficulty', displayData.difficulty[i].name)}
              shape={(props) => {
                const { index } = props as { index: number };
                const entry = displayData.difficulty[index];
                if (!entry) return <Sector {...props} />;
                const fill = difficultyColors[entry.name] ?? '#82ca9d';
                return (
                  <Sector
                    {...props}
                    fill={fill}
                    className={`cursor-pointer transition-opacity ${filter?.type === 'difficulty' && filter.value !== entry.name ? 'opacity-30' : 'opacity-100'}`}
                    onMouseEnter={(e) => handleMouseEnter(entry, e, fill)}
                    onMouseLeave={handleMouseLeave}
                    onTouchStart={(e) => handleTouchStart(entry, e, fill)}
                  />
                );
              }}
            />

            <Pie
              data={displayData.timeBin}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="100%"
              innerRadius="71%"
              labelLine={false}
              label={(labelProps) => {
                const timeBinName = (labelProps as PieLabelRenderProps & { timeBinName?: string }).timeBinName;
                return <CustomizedLabel {...labelProps} name={timeBinName} />;
              }}
              shape={(props) => {
                const { index } = props as { index: number };
                const entry = displayData.timeBin[index];
                if (!entry) return <Sector {...props} />;
                const fill = difficultyColors[entry.difficultyName as keyof typeof difficultyColors];
                return <Sector {...props} fill={fill} onMouseEnter={(e) => handleMouseEnter(entry, e, fill)} onMouseLeave={handleMouseLeave} onTouchStart={(e) => handleTouchStart(entry, e, fill)} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="lg:col-span-1 self-start">
        <h3 className="font-bold text-center mb-3">{t('statsByDifficulty')}</h3>
        <div className="flex flex-wrap justify-center gap-2">
          {displayData.difficulty.map((diff) => {
            const percentage = totalDifficultyPlayers > 0 ? ((diff.value / totalDifficultyPlayers) * 100).toFixed(1) : '0.0';
            const isActive = filter?.type === 'difficulty' && filter?.value === diff.name;
            const isFiltered = filter?.type === 'difficulty' && !isActive;

            return (
              <div
                key={diff.name}
                className={` p-1.5 rounded-lg cursor-pointer transition-all duration-200 ${isActive ? 'bg-neutral-200 dark:bg-neutral-700 ring-2 ring-blue-500' : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'} ${isFiltered ? 'opacity-50' : 'opacity-100'}`}
                onClick={() => handleFilter('difficulty', diff.name)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">{diff.name}</span>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 " style={{ backgroundColor: difficultyColors[diff.name] }} />
                </div>
                <div className="mt-1 flex flex-raw items-center gap-x-0.5">
                  <div className="text-xs font-mono font-bold">{diff.value.toLocaleString()}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">({percentage}%)</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={tooltipRef}
        className="pointer-events-none transition-opacity duration-200"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          opacity: 0,
          zIndex: 999,
        }}
      />
    </div>
  );
}

const ConcentricDonutChart: React.FC<ConcentricDonutChartProps> = React.memo(({ boss, server, id, scores, tierCounter }: ConcentricDonutChartProps) => {
  const [timeBinMinutes, setTimeBinMinutes] = useState<number>(getTimeoutFromBoss(boss));
  const { t } = useTranslation('dashboard');

  return (
    <>
      {/* <h2 className="text-xl font-bold py-2 mx-2 text-center">{t('totalClearStatus')}</h2> */}
      <h3 className="text-sm mb-2">Tip. {t('chartInteractionGuide')}</h3>
      <ConcentricDonutChartItem boss={boss} server={server} id={id} timeBinMinutes={timeBinMinutes} scores={scores} tierCounter={tierCounter} />

      <div className="py-4">
        <h3 className="font-bold text-center mb-3">{t('timeIntervalSettings')}</h3>
        <div className="flex items-center justify-center gap-2">
          {[0.5, 1, 3, 4].map((min) => (
            <button
              key={min}
              onClick={() => setTimeBinMinutes(min)}
              className={`cursor-pointer px-4 py-1.5 text-sm rounded-md font-semibold transition-colors ${timeBinMinutes === min ? 'bg-blue-500 text-white shadow' : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
            >
              {min >= 1 ? `${min}${t('unitMinute')}` : `${min * 60}${t('unitSecond')}`}
            </button>
          ))}
          <input
            type="text"
            value={timeBinMinutes}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (val > 0 && val <= 60) setTimeBinMinutes(val);
            }}
            min="1"
            max="60"
            className="w-16 p-1 text-center border border-neutral-300 dark:border-neutral-600 bg-transparent rounded-md"
          />
        </div>
      </div>
    </>
  );
});

export default ConcentricDonutChart;
