export type YScale = 'linear' | 'log' | 'sqrt' | 'cdf';
export const Y_SCALES: { key: YScale; label: string }[] = [
  { key: 'linear', label: 'Linear' },
  { key: 'log', label: 'log' },
  { key: 'sqrt', label: '√x' },
  { key: 'cdf', label: 'Cumulative' },
];

// Maps a player count to its plotted bar height. Zero stays zero so empty bins draw nothing.
const toPlotValue = (count: number, scale: YScale): number => {
  if (count <= 0) return 0;
  switch (scale) {
    case 'log':
      return Math.log10(1 + count);
    case 'sqrt':
      return Math.sqrt(count);
    default:
      return count;
  }
};

// Count values at which the log/sqrt axes get a tick (1-2-5 series), up to the first value >= max.
const nonLinearTickCounts = (max: number, scale: YScale): number[] => {
  const counts = [0];
  for (let magnitude = 1; magnitude < max * 10; magnitude *= 10) {
    for (const step of scale === 'log' ? [1] : [1, 2, 5]) {
      counts.push(magnitude * step);
      if (magnitude * step >= max) return counts;
    }
  }
  return counts;
};

const formatCount = (v: number): string => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v));

// Running total in the order given. Bars then read as "this bin and everything before it".
const cumulativeCounts = (counts: number[]): number[] => {
  let running = 0;
  return counts.map((count) => (running += count));
};

// Bar heights for a series of counts under the chosen scale. Cumulative needs the whole series, in display order.
export const plotValues = (counts: number[], scale: YScale): number[] => (scale === 'cdf' ? cumulativeCounts(counts) : counts.map((count) => toPlotValue(count, scale)));

// Recharts YAxis props for the chosen scale. Log/sqrt axes get ticks at round counts, labelled with the count rather than the plotted value.
export const yAxisConfig = (counts: number[], scale: YScale) => {
  if (scale !== 'log' && scale !== 'sqrt') return { domain: [0, 'auto'] as [number, 'auto'], ticks: undefined, tickFormatter: formatCount };
  const ticks = nonLinearTickCounts(Math.max(0, ...counts), scale).map((count) => ({ count, plot: toPlotValue(count, scale) }));
  return {
    domain: [0, ticks[ticks.length - 1].plot] as [number, number],
    ticks: ticks.map((tick) => tick.plot),
    tickFormatter: (v: number) => formatCount(ticks.find((tick) => tick.plot === v)?.count ?? v),
  };
};
