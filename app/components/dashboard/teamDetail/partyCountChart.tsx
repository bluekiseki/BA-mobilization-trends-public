import { useMemo, useState } from 'react';
import type { ReportEntry } from '../common';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const BAR_COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1'];

const CustomBarLabel = (props: any) => {
  const { x, y, width, height, value, dataKey, rawCounts } = props;

  // dataKey is something like "3PT", we need the number 3
  const partyNum = parseInt(dataKey);
  const count = rawCounts.get(partyNum) || 0;

  // Don't render label if the bar is too small
  if (width < 60) {
    return null;
  }

  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    // Use a <g> element to position the text block
    <g transform={`translate(${cx}, ${cy})`}>
      <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="bold" fontSize="14">
        {/* First line of text */}
        <tspan x="0" dy="-0.7em">{`${dataKey}: ${count}`}</tspan>
        {/* Second line of text */}
        <tspan x="0" dy="1.4em">{`(${(Number(value) || 0).toFixed(1)}%)`}</tspan>
      </text>
    </g>
  );
};

export const PartyCountChart: React.FC<{ data: ReportEntry[] }> = ({ data }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleMouseEnter = (index: number) => {
    setActiveIndex(index);
  };

  const handleMouseLeave = () => {
    setActiveIndex(null);
  };

  const { chartData, rawCounts } = useMemo(() => {
    const counts = new Map<number, number>();
    data.forEach((entry) => {
      const numParties = entry.t.length;
      counts.set(numParties, (counts.get(numParties) || 0) + 1);
    });

    const totalEntries = data.length;
    if (totalEntries === 0) return { chartData: [], rawCounts: new Map() };

    const percentages: { [key: string]: any } = { name: '' };
    counts.forEach((count, parties) => {
      percentages[`${parties}PT`] = (count / totalEntries) * 100;
    });

    return { chartData: [percentages], rawCounts: counts };
  }, [data]);

  // Sort keys to ensure consistent bar order (e.g., 2PT, 3PT, 4PT)
  const sortedKeys = Object.keys(chartData[0] || {})
    .filter((key) => key !== 'name')
    .sort((a, b) => parseInt(a) - parseInt(b));
  return (
    <div className="w-full h-20">
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <XAxis type="number" domain={[0, 100]} unit="%" stroke="#94a3b8" ticks={[0, 25, 50, 75, 100]} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
            }}
            content={({ payload, label, active }) => {
              const maxKey =
                payload &&
                payload[0] &&
                Object.entries(payload[0].payload)
                  .filter(([key]) => key !== 'name') // name is a string, except
                  .reduce((a, b) => (Number(a[1]) > Number(b[1]) ? a : b))[0];
              const maxPT = Number(String(maxKey).replace('PT', '')) || Infinity;

              if (active && payload?.length) {
                return (
                  <div className="rounded border bg-white p-2 text-sm text-neutral-700 shadow-md dark:border-neutral-600 dark:bg-neutral-800 dark:text-white">
                    <div> {label}</div>
                    {payload
                      .filter((v) => v.value > 0.01 || Number(v.dataKey.replace('PT', '')) < maxPT)
                      .map((entry, i) => (
                        <div key={i} className={'flex justify-between gap-x-2 ' + (Number(entry.name.replace('PT', '')) == activeIndex ? 'font-bold' : '')}>
                          <span className="text-left">{entry.name}:</span>
                          <span className="text-right tabular-nums">{rawCounts.get(Number(entry.name.replace('PT', '')))}</span>
                          <span className="text-right tabular-nums">{entry.value.toFixed(2)}% </span>
                        </div>
                      ))}

                    {payload.filter((v) => v.value > 0.01).length != payload.length ? <div>...</div> : <></>}
                  </div>
                );
              }
              return null;
            }}
          />
          {sortedKeys.map((key, index) => {
            return (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={BAR_COLORS[index % BAR_COLORS.length]}
                onMouseEnter={() => handleMouseEnter(Number(key.replace('PT', '')))}
                onMouseLeave={handleMouseLeave}
                isAnimationActive={false}
              >
                {/* Use the content prop with a render prop to pass our custom component */}
                <LabelList dataKey={key} content={(props: any) => <CustomBarLabel {...props} rawCounts={rawCounts} dataKey={key} />} />
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
