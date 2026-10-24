import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportEntry } from '../../../../types/raidReport';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BarShapeProps } from 'recharts';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import type { GameServer, RaidInfo } from '~/types/data';
import { formatTimeToTimestamp } from '~/utils/time';
import { difficultyInfo, getDifficultyFromScoreAndBoss, type DifficultyName } from '~/components/raid/Difficulty';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { computeDifficultyGroupTicks } from '~/features/raid-stats/dashboard/difficultyHistogramTicks';
import DifficultyLegend from '../DifficultyLegend';

export const ScoreDistributionChart: React.FC<{
  data: ReportEntry[];
  raid: RaidInfo;
  server: GameServer;
}> = React.memo(({ data, raid, server }) => {
  const { t: t_raidInfo } = useTranslation('raidInfo');

  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Round the size of the bucket and make it look good (e.g., 100_000, 500_000)
    const roundToNice = (num: number) => {
      const pow10 = Math.pow(10, Math.floor(Math.log10(num)));
      const multipliers = [1, 2, 5, 10];
      for (const m of multipliers) {
        const nice = m * pow10;
        if (nice >= num) return nice;
      }
      return pow10 * 10;
    };

    // A tier's score range can be orders of magnitude narrower than another's (e.g. Normal vs.
    // Lunatic), so one bucket size for the whole combined range makes every tier but the widest
    // look either flat or over-detailed. Bin each tier on its own scale instead - same idea as the
    // overview histogram's per-difficulty bin sizing - splitting the total bucket budget across
    // tiers by their share of entries, so a sparse tier doesn't get as many buckets as a common one.
    const byDifficulty = new Map<DifficultyName, number[]>();
    for (const d of data) {
      const difficulty = getDifficultyFromScoreAndBoss(d.s, server, raid.Id);
      const bucket = byDifficulty.get(difficulty);
      if (bucket) {
        bucket.push(d.s);
      } else {
        byDifficulty.set(difficulty, [d.s]);
      }
    }

    const pixelsPerBin = typeof window !== 'undefined' && window.innerWidth < 640 ? 3 : 10;
    const totalBinBudget = typeof window !== 'undefined' ? Math.max(20, (window.innerWidth - 50) / pixelsPerBin) : 100;

    const points: { key: string; scoreRange: string; time: string; axisLabel: string; count: number; difficulty: DifficultyName; color: string }[] = [];

    // Iterate low-to-high difficulty so buckets read left-to-right as ascending score, matching the original chart.
    for (const { name: difficulty } of [...difficultyInfo].reverse()) {
      const scores = byDifficulty.get(difficulty);
      if (!scores || scores.length === 0) continue;

      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      const range = maxScore - minScore;
      const tierBinBudget = Math.max(5, Math.round((totalBinBudget * scores.length) / data.length));
      const bucketSize = range > 0 ? roundToNice(range / tierBinBudget) : 1;

      const buckets = new Map<number, number>();
      for (let i = Math.floor(minScore / bucketSize) * bucketSize; i <= maxScore; i += bucketSize) {
        buckets.set(i, 0);
      }
      scores.forEach((s) => {
        const bucketStart = Math.floor(s / bucketSize) * bucketSize;
        buckets.set(bucketStart, (buckets.get(bucketStart) || 0) + 1);
      });

      const sortedEntries = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
      for (const [score, count] of sortedEntries) {
        // Time is derived from the bucket's exact raw score, not a rounded-for-display one - no
        // reason to feed the tooltip's time calculation a lossy value when the real number is
        // right here. The tooltip shows the bucket's exact range (like the overview histogram's
        // bin tooltip does) instead of a single rounded point.
        const timeTxt = formatTimeToTimestamp(calculateTimeFromScore(score, raid.Boss, server, raid.Id) || 0);
        const axisScoreTxt = `${(score / 1000000).toFixed(3)}M`;
        points.push({
          key: `${difficulty}|${score}`,
          scoreRange: `${score.toLocaleString()} ~ ${(score + bucketSize).toLocaleString()}`,
          time: timeTxt,
          axisLabel: `${axisScoreTxt} (${timeTxt})`,
          count,
          difficulty,
          color: DIFFICULTY_COLORS[difficulty] || '#8884d8',
        });
      }
    }

    return points;
  }, [data, raid.Boss, raid.Id, server]);

  // Buckets can span multiple difficulty tiers within one rank range (e.g. Gold tier), and each
  // tier's score-to-time formula differs - so ticks and dividers must stay aware of tier boundaries,
  // same as the overview histogram's Clear Time Distribution chart.
  const { groupStartNames, dividerLabels, tickLabels, distinctDifficulties } = useMemo(() => {
    const result = computeDifficultyGroupTicks(
      chartData,
      (d) => d.difficulty,
      (d) => d.key,
      10,
    );
    // Buckets are ordered by ascending score (low difficulty to high); show the legend high-to-low to match the other histograms.
    return { groupStartNames: result.groupStartNames, dividerLabels: result.dividerNames, tickLabels: result.tickNames, distinctDifficulties: [...result.distinctDifficulties].reverse() };
  }, [chartData]);

  return (
    <div className="h-100 space-y-2">
      <DifficultyLegend difficulties={distinctDifficulties} />
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          <XAxis
            dataKey="key"
            stroke="#94a3b8"
            // No `interval={0}` here: candidate ticks are `ticks` (always includes each tier's
            // first bar), but Recharts' own overlap-avoidance still measures the formatted string
            // and thins further as needed - safer than forcing every candidate to render, which
            // overlaps badly once a difficulty prefix lengthens a label.
            ticks={tickLabels}
            height={40}
            tickFormatter={(value: string) => {
              const entry = chartData.find((d) => d.key === value);
              if (!entry) return value;
              if (!groupStartNames.has(value)) return entry.axisLabel;
              return `${t_raidInfo(entry.difficulty, entry.difficulty)} ${entry.axisLabel}`;
            }}
            style={{ fontSize: '11px' }}
          />
          <YAxis stroke="#94a3b8" />
          {/* <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} /> */}
          <Tooltip
            // @ts-expect-error - Recharts type system doesn't match our custom content signature
            content={({
              active,
              payload,
            }: {
              active?: boolean;
              payload?: Array<{ fill?: string; name?: string; value?: number; payload?: { scoreRange?: string; time?: string; difficulty?: DifficultyName; color?: string } }>;
            }) => {
              if (active && payload && payload.length) {
                const item = payload[0];
                const scoreRange = item?.payload?.scoreRange ?? '';
                const time = item?.payload?.time ?? '';
                const difficulty = item?.payload?.difficulty;
                const color = item?.payload?.color ?? item?.fill ?? '#000';
                const name = item?.name ?? '';
                const value = item?.value ?? 0;
                return (
                  <div className="rounded border bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800">
                    <p className="font-semibold text-neutral-700 dark:text-neutral-200">{scoreRange}</p>
                    <p style={{ color }}>{time}</p>
                    {difficulty && (
                      <p className="font-semibold" style={{ color }}>
                        {t_raidInfo(difficulty, difficulty)}
                      </p>
                    )}
                    <p style={{ color }}>{`${name}: ${value}`}</p>
                  </div>
                );
              }

              return null;
            }}
          />
          <Bar
            dataKey="count"
            name="count"
            shape={(props: BarShapeProps) => {
              const entry = props.payload as { color?: string };
              return <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={entry?.color || '#8884d8'} />;
            }}
          />
          {/* Drawn after the bars so the tier boundary stays visible on top of them. */}
          {dividerLabels.map((key) => (
            <ReferenceLine key={key} x={key} stroke="#9ca3af" strokeOpacity={0.8} strokeDasharray="4 4" />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
