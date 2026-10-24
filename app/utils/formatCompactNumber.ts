// Compact display for large amounts: 10,000+ uses "k" and 10,000,000+ uses "M" (e.g. 144k, 21.3M).
const trimDecimal = (value: number) => String(Math.round(value * 10) / 10);

export const formatCompactNumber = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `${trimDecimal(value / 1_000_000)}M`;
  if (abs >= 10_000) return `${trimDecimal(value / 1_000)}k`;
  return value.toLocaleString();
};
