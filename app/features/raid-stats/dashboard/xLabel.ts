import { useSyncExternalStore } from 'react';

export type XLabelKind = 'score' | 'time';

// One text line per selected part (score, then time), preceded by the difficulty name on a tier's first tick.
// Stacking lines keeps every label short enough to stay horizontal, so no axis margin has to grow for it.
export const xLabelLines = (kinds: ReadonlySet<XLabelKind>, score: string, time: string, prefix?: string): string[] => {
  const lines: string[] = [];
  if (prefix) lines.push(prefix);
  if (kinds.has('score')) lines.push(score);
  // Fractions of a second are noise on an axis label; the tooltip still has the exact range.
  if (kinds.has('time')) lines.push(time.replace(/\.\d+$/, ''));
  return lines;
};

export const formatScoreInMillions = (score: number): string => `${(score / 1_000_000).toFixed(3)}M`;

const NARROW_QUERY = '(max-width: 639px)';

const subscribeNarrow = (onChange: () => void) => {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

// Horizontal labels are wider than angled ones, so narrow screens get fewer ticks to avoid overlap.
// Re-evaluates when the viewport crosses the breakpoint (resize, rotation).
export const useXTickCount = (): number =>
  useSyncExternalStore(
    subscribeNarrow,
    () => (window.matchMedia(NARROW_QUERY).matches ? 5 : 10),
    () => 10,
  );

// Room for the stacked label lines (difficulty name, score, time) below the plot.
export const X_AXIS_HEIGHT = 56;
