import React, { useMemo } from 'react';
import type { ReportEntry } from '../common';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import type { GameServer, RaidInfo } from '~/types/data';
import { formatTimeToTimestamp } from '~/utils/time';

const CustomizedAxisTick = ({ x, y, payload }: any) => {
  const { value } = payload;

  const parts = value.match(/(.*) \((.*)\)/);

  if (!parts) {
    return null;
  }

  const scoreText = parts[1]; // ex: "1.23M"
  const timeText = `(${parts[2]})`; // ex: "(04:56)"

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill="#94a3b8" fontSize={12}>
        <tspan x="0" textAnchor="middle">
          {scoreText}
        </tspan>
        <tspan x="0" textAnchor="middle" dy="1.2em">
          {timeText}
        </tspan>
      </text>
    </g>
  );
};

export const ScoreDistributionChart: React.FC<{
  data: ReportEntry[];
  raid: RaidInfo;
  server: GameServer;
}> = ({ data, raid, server }) => {
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    const scores = data.map((d) => d.s);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const range = maxScore - minScore;

    const targetBuckets = 100;
    const rawBucketSize = range / targetBuckets;

    // Round the size of the bucket and make it look good (e.g., 100_000, 500_000)
    const roundToNice = (num: number) => {
      const pow10 = Math.pow(10, Math.floor(Math.log10(num)));
      const multipliers = [1, 2, 5, 10];
      for (let m of multipliers) {
        const nice = m * pow10;
        if (nice >= num) return nice;
      }
      return pow10 * 10;
    };

    const bucketSize = roundToNice(rawBucketSize);

    const buckets = new Map<number, number>();
    for (let i = Math.floor(minScore / bucketSize) * bucketSize; i <= maxScore; i += bucketSize) {
      buckets.set(i, 0);
    }

    data.forEach((d) => {
      const bucketStart = Math.floor(d.s / bucketSize) * bucketSize;
      buckets.set(bucketStart, (buckets.get(bucketStart) || 0) + 1);
    });

    return Array.from(buckets.entries()).map(([score, count]) => {
      const roundedScore = (score / 1000000).toFixed(3);
      const scoreTxt = `${roundedScore}M`;
      const timeTxt = formatTimeToTimestamp(calculateTimeFromScore(Number(roundedScore) * 1000000, raid.Boss, server, raid.Id) || 0);
      return {
        score: scoreTxt,
        time: timeTxt,
        label: `${scoreTxt} (${timeTxt})`,
        count,
      };
    });
    // .filter(d => d.count > 0);
  }, [data]);

  return (
    <div className="h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          {/* <XAxis dataKey="label" stroke="#94a3b8" /> */}
          <XAxis dataKey="label" stroke="#94a3b8" tick={<CustomizedAxisTick />} height={40} />
          <YAxis stroke="#94a3b8" />
          {/* <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} /> */}
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded border bg-white p-3 text-sm shadow-md dark:border-neutral-700 dark:bg-neutral-800">
                    <p className="font-semibold text-neutral-700 dark:text-neutral-200">{`${payload[0]?.payload?.score}`}</p>
                    {/* <p className="font-semibold text-neutral-700 dark:text-neutral-200">{`??: ${JSON.stringify(payload[0].payload)}`}</p> */}
                    <p style={{ color: payload[0].fill }}>{`${payload[0]?.payload?.time}`}</p>
                    <p style={{ color: payload[0].fill }}>{`${payload[0].name}: ${payload[0].value}`}</p>
                  </div>
                );
              }

              return null;
            }}
          />
          <Bar dataKey="count" name="count" fill="#8884d8" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
