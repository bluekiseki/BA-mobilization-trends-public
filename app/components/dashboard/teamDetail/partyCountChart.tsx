import { useEffect, useMemo, useState, useTransition } from 'react';
import type { ReportEntry, ReportEntryRank } from '../common';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { difficultyInfo } from '~/components/raid/Difficulty';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { RaidInfo } from '~/types/data';

export const PARTY_COUNT_COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1'];

const CrispBar = (props: Record<string, unknown>) => {
  const { x, y, width, height, fill } = props as { x: number; y: number; width: number; height: number; fill: string };
  if (!width || !height) return null;
  const x1 = Math.floor(x);
  const x2 = Math.ceil(x + width);
  return <rect x={x1} y={Math.floor(y)} width={x2 - x1} height={Math.ceil(height)} fill={fill} />;
};

interface StackedBarLabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  label?: string;
  count?: number;
}

const StackedBarLabel = ({ x = 0, y = 0, width = 0, height = 0, value = 0, label = '', count = 0 }: StackedBarLabelProps) => {
  if (width < 45) return null;
  const cx = x + width / 2;
  const cy = y + height / 2;

  if (width >= 80 && count > 0) {
    return (
      <g transform={`translate(${cx}, ${cy})`}>
        <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="bold" fontSize={13}>
          <tspan x="0" dy="-0.7em">{`${label}: ${count.toLocaleString()}`}</tspan>
          <tspan x="0" dy="1.4em">{`(${(value ?? 0).toFixed(1)}%)`}</tspan>
        </text>
      </g>
    );
  }

  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="bold" fontSize={12}>
      {label}
    </text>
  );
};

export const PartyCountChart: React.FC<{
  data: ReportEntry[];
  compIds?: number[];
}> = React.memo(({ data, compIds }) => {
  const { t } = useTranslation('dashboard');

  const { chartData, rawCounts, sortedKeys } = useMemo(() => {
    const total = data.length;
    if (total === 0) return { chartData: [], rawCounts: new Map<number, number>(), sortedKeys: [] };

    const counts = new Map<number, number>();

    for (const entry of data) {
      counts.set(entry.t.length, (counts.get(entry.t.length) ?? 0) + 1);
    }

    const current = counts;
    const sorted = Array.from(current.keys()).sort((a, b) => a - b);
    const row: Record<string, number | string> = { name: '' };
    current.forEach((count, key) => {
      row[String(key)] = (count / total) * 100;
    });

    return { chartData: [row], rawCounts: current, sortedKeys: sorted.map(String) };
  }, [data, compIds]);

  const getLabel = (key: string) => {
    const n = Number(key);
    return t('nPartyCount', { n });
  };

  if (data.length === 0) return null;

  return (
    <div className="w-full overflow-visible">
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
          <XAxis type="number" domain={[0, 100]} unit="%" hide stroke="#94a3b8" ticks={[0, 25, 50, 75, 100]} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            wrapperStyle={{ zIndex: 1000, pointerEvents: 'auto' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const total = Array.from(rawCounts.values()).reduce((a, b) => a + b, 0);
              return (
                <div className="bg-white/90 dark:bg-neutral-800/90 p-2 border dark:border-neutral-600 rounded text-sm space-y-0.5">
                  {payload
                    .filter((p) => Number(p.value) > 0.01)
                    .map((p, i) => {
                      const n = Number(p.dataKey);
                      const count = rawCounts.get(n) ?? 0;
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full block shrink-0" style={{ backgroundColor: p.fill }} />
                          <span className="font-medium">{getLabel(String(p.dataKey))}</span>
                          <span className="font-bold">{count.toLocaleString()}</span>
                          <span className="text-neutral-500 dark:text-neutral-400">({((count / total) * 100).toFixed(1)}%)</span>
                        </div>
                      );
                    })}
                </div>
              );
            }}
          />
          {sortedKeys.map((key, index) => (
            <Bar key={key} dataKey={key} stackId="a" fill={PARTY_COUNT_COLORS[index % PARTY_COUNT_COLORS.length]} isAnimationActive={false}>
              <LabelList
                dataKey={key}
                content={React.cloneElement(<StackedBarLabel />, {
                  label: getLabel(key),
                  count: rawCounts.get(Number(key)) ?? 0,
                })}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

const MIN_BAR_PX = 5;

export const PartyCountRankChart: React.FC<{
  data: ReportEntryRank[];
  raidInfo?: RaidInfo;
}> = React.memo(({ data, raidInfo }) => {
  const { t } = useTranslation('dashboard');

  const [, startTransition] = useTransition();
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 800));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => startTransition(() => setWindowWidth(window.innerWidth)), 150);
    };
    window.addEventListener('resize', handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handler);
    };
  }, []);

  const { chartData, teamCounts } = useMemo(() => {
    if (data.length === 0) return { chartData: [], teamCounts: [] };

    const startRank = data[0].typeRanking;
    const endRank = data[data.length - 1].typeRanking;
    const rankRange = Math.max(1, endRank - startRank + 1);
    const chartWidth = Math.max(200, windowWidth - 64);
    const maxBuckets = Math.floor(chartWidth / MIN_BAR_PX);
    const bucketSize = Math.max(10, Math.ceil(rankRange / maxBuckets));
    const buckets = new Map<number, Map<number, number>>();
    const allTeamCounts = new Set<number>();

    data.forEach((entry) => {
      const bucketStart = Math.floor((entry.typeRanking - 1) / bucketSize) * bucketSize + 1;
      const tc = entry.t.length;
      allTeamCounts.add(tc);
      const m = buckets.get(bucketStart) ?? new Map<number, number>();
      m.set(tc, (m.get(tc) ?? 0) + 1);
      buckets.set(bucketStart, m);
    });

    const chartData = Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([start, tcMap]) => {
        const bucketTotal = Array.from(tcMap.values()).reduce((a, b) => a + b, 0);
        const obj: Record<string, number | string> = {
          rank: `${startRank + start - 1}-${startRank + start + bucketSize - 2}`,
        };
        tcMap.forEach((count, tc) => {
          obj[`tc${tc}`] = (count / bucketTotal) * 100;
          obj[`raw_${tc}`] = count;
        });
        return obj;
      });

    return { chartData, teamCounts: Array.from(allTeamCounts).sort((a, b) => a - b) };
  }, [data, windowWidth]);

  const difficultyBands = useMemo(() => {
    if (!raidInfo || data.length === 0) return [];
    const startRank = data[0].typeRanking;
    const endRank = data[data.length - 1].typeRanking;
    const visibleRange = endRank - startRank + 1;
    const bands: { name: string; width: number; color: string }[] = [];
    let c = 1;
    for (const { name } of difficultyInfo) {
      const cnt = raidInfo.Cnt[name as keyof typeof raidInfo.Cnt] ?? 0;
      if (cnt > 0) {
        const clippedMin = Math.max(c, startRank);
        const clippedMax = Math.min(c + cnt - 1, endRank);
        if (clippedMax >= clippedMin) {
          bands.push({
            name,
            width: ((clippedMax - clippedMin + 1) / visibleRange) * 100,
            color: DIFFICULTY_COLORS[name] ?? '#888',
          });
        }
        c += cnt;
      }
    }
    return bands;
  }, [data, raidInfo]);

  if (data.length === 0) return null;

  return (
    <div>
      {difficultyBands.length > 0 && (
        <div className="flex w-full">
          {difficultyBands.map((band) => (
            <div key={band.name} style={{ width: `${band.width}%` }} className="flex flex-col min-w-0">
              <div className="h-5">{band.width >= 5 && <span className="block text-xs text-neutral-500 dark:text-neutral-400 truncate leading-5">{band.name}</span>}</div>
              <div className="h-1 w-full" style={{ backgroundColor: band.color }} />
            </div>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={200} style={{ marginTop: -15 }}>
        <BarChart data={chartData} barGap={0} barCategoryGap={0} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="rank" fontSize={10} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white/90 dark:bg-neutral-800/90 p-2 border dark:border-neutral-600 rounded text-sm space-y-0.5">
                  <p className="font-bold text-center border-b pb-1 mb-1">{label}</p>
                  {payload
                    .filter((p) => Number(p.value) > 0)
                    .map((p) => {
                      const n = Number(String(p.dataKey).replace('tc', ''));
                      const rawCount = Number((p.payload as Record<string, unknown>)[`raw_${n}`] ?? 0);
                      return (
                        <div key={String(p.dataKey)} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full block shrink-0" style={{ backgroundColor: p.fill }} />
                          <span className="font-medium">{t('nPartyCount', { n })}</span>
                          <span className="font-bold">{rawCount.toLocaleString()}</span>
                          <span className="text-neutral-500 dark:text-neutral-400">({Number(p.value).toFixed(1)}%)</span>
                        </div>
                      );
                    })}
                </div>
              );
            }}
            cursor={{ fill: 'rgba(150,150,150,0.1)' }}
          />
          {teamCounts.map((tc, i) => (
            <Bar key={`tc${tc}`} dataKey={`tc${tc}`} stackId="a" fill={PARTY_COUNT_COLORS[i % PARTY_COUNT_COLORS.length]} stroke="none" isAnimationActive={false} shape={<CrispBar />} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
