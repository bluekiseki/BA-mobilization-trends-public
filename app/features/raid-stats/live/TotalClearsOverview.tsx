// app/components/live/TotalClearsOverview.tsx

import { type CSSProperties, type FC, type PointerEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown } from 'react-icons/fi';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

export interface TotalClearsRow {
  /** Stable key (boss type for multi-boss raids, 'total' for single-boss raids) */
  id: string;
  /** Display name; omitted for single-boss raids */
  label?: string;
  total: number;
  rank20000Score: number | null;
  /** Clear counts keyed by difficulty name */
  tiers: Record<string, number>;
}

interface TotalClearsOverviewProps {
  readonly rows: TotalClearsRow[];
  readonly isRaid: boolean;
}

const DIFFICULTY_ORDER = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];
const CUTOFF_RANK = 20000;
const RANK_MARKERS = [CUTOFF_RANK, 120000, 240000];

interface HoverState {
  index: number;
  activeDiff: string | null;
  x: number;
  y: number;
}

const getHighestDifficulty = (tiers: Record<string, number>): { diff: string; count: number } | null => {
  for (const diff of DIFFICULTY_ORDER) {
    const count = tiers[diff] ?? 0;
    if (count > 0) return { diff, count };
  }
  return null;
};

const Swatch: FC<{ diff: string; className?: string }> = ({ diff, className = 'size-2.5' }) => (
  <i className={`inline-block shrink-0 ${className}`} style={{ backgroundColor: DIFFICULTY_COLORS[diff] }} />
);

export const TotalClearsOverview: FC<TotalClearsOverviewProps> = ({ rows, isRaid }) => {
  const { t, i18n } = useTranslation('liveDashboard');
  const { t: t_ui } = useTranslation('ui');
  const short = getLocaleShortName(i18n.language as Locale);
  const unit = t('playersUnit');
  // Only compact suffix units (the Korean and Japanese counters) are shown; spaced units like "players" are left to the labels
  const players = (n: number) => (short === 'ko' || short === 'ja' ? `${n.toLocaleString()}${unit}` : n.toLocaleString());
  // Language-neutral rank notation keeps labels compact
  const rankLabel = (rank: number) => `#${rank.toLocaleString()}`;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<HoverState | null>(null);

  // Only show difficulties that exist in this raid (e.g. Lunatic is Total Assault only)
  const difficulties = DIFFICULTY_ORDER.filter((diff) => rows.some((row) => diff in row.tiers));
  const maxTotal = Math.max(1, ...rows.map((row) => row.total));
  // Shared axis ends at the largest total so the longest bar spans the full width
  const axisMax = maxTotal;
  const markers = RANK_MARKERS.filter((rank) => rank <= axisMax);
  const pct = (n: number) => `${(n / axisMax) * 100}%`;

  const toggle = (id: string) => {
    setHover(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Resolve which difficulty segment sits under the pointer
  const diffAt = (row: TotalClearsRow, bar: HTMLElement, clientX: number): string | null => {
    const rect = bar.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right) return null;
    const value = ((clientX - rect.left) / rect.width) * axisMax;
    let acc = 0;
    for (const diff of difficulties) {
      const count = row.tiers[diff] ?? 0;
      acc += count;
      if (count > 0 && value <= acc) return diff;
    }
    return null;
  };

  const onRowPointerMove = (index: number) => (e: PointerEvent<HTMLDivElement>) => {
    const row = rows[index];
    if (e.pointerType !== 'mouse' || expanded.has(row.id)) {
      setHover(null);
      return;
    }
    const bar = e.currentTarget.querySelector<HTMLElement>('[data-bar]');
    setHover({ index, activeDiff: bar ? diffAt(row, bar, e.clientX) : null, x: e.clientX, y: e.clientY });
  };

  const bar = (row: TotalClearsRow) => (
    <span data-bar className="relative flex h-4 w-full">
      {difficulties.map((diff) => {
        const count = row.tiers[diff] ?? 0;
        if (!count) return null;
        return <span key={diff} className="h-full border-r border-white/50 dark:border-neutral-900/60 last:border-r-0" style={{ width: pct(count), backgroundColor: DIFFICULTY_COLORS[diff] }} />;
      })}
      {markers.map((rank) => (
        <span key={rank} className="pointer-events-none absolute -top-1 -bottom-1 border-l-2 border-dashed border-neutral-900 dark:border-neutral-100" style={{ left: pct(rank) }} />
      ))}
    </span>
  );

  const markerLabels = (
    <div className="relative h-4 text-[11px] text-neutral-500 dark:text-neutral-400">
      {markers.map((rank) => (
        <span key={rank} className={`absolute bottom-0.5 whitespace-nowrap ${rank / axisMax > 0.85 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: pct(rank) }}>
          {rankLabel(rank)}
        </span>
      ))}
    </div>
  );

  const detailList = (row: TotalClearsRow) => (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-2.5 md:grid-cols-[repeat(var(--cols),minmax(0,1fr))] md:gap-2" style={{ '--cols': difficulties.length } as CSSProperties}>
      {difficulties.map((diff) => {
        const count = row.tiers[diff] ?? 0;
        return (
          <li key={diff} className={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs ${count ? '' : 'opacity-45'}`}>
            <span className="flex basis-full items-center gap-1.5 whitespace-nowrap text-neutral-500 dark:text-neutral-400">
              <Swatch diff={diff} />
              {diff}
            </span>
            <strong className="text-[13px] font-semibold tabular-nums">{players(count)}</strong>
            <span className="tabular-nums text-neutral-500">{row.total ? ((count / row.total) * 100).toFixed(1) : '0.0'}%</span>
          </li>
        );
      })}
    </ol>
  );

  const legend = (
    <div className="mt-3 flex flex-wrap px-3 md:px-4 gap-x-4 gap-y-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
      {difficulties.map((diff) => (
        <span key={diff} className="flex items-center gap-1.5">
          <Swatch diff={diff} />
          {diff}
        </span>
      ))}
      {markers.length > 0 && (
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-3 border-l-2 border-dashed border-neutral-900 dark:border-neutral-100" />
          {markers.map(rankLabel).join(' · ')}
        </span>
      )}
    </div>
  );

  // Single-boss raid: one bar, stats on top, details always visible
  if (isRaid) {
    const row = rows[0];
    if (!row) return null;
    const highest = getHighestDifficulty(row.tiers);
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-start gap-x-10 gap-y-3">
          <div>
            <span className="block text-xs text-neutral-500 dark:text-neutral-400">{t_ui('totalClears')}</span>
            <strong className="text-xl font-semibold tabular-nums md:text-2xl">{players(row.total)}</strong>
          </div>
          {row.rank20000Score != null && (
            <div>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">{rankLabel(CUTOFF_RANK)}</span>
              <strong className="text-lg font-medium tabular-nums">{row.rank20000Score.toLocaleString()}</strong>
            </div>
          )}
          {highest && (
            <div>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">{t('highest_cleared_difficulty')}</span>
              <strong className="flex items-center gap-1.5 text-lg font-medium tabular-nums">
                <Swatch diff={highest.diff} className="size-3" />
                {highest.diff} {players(highest.count)}
              </strong>
            </div>
          )}
        </div>
        {markerLabels}
        {bar(row)}
        <div className="mt-5 border-t border-neutral-200 pt-3.5 dark:border-neutral-700">{detailList(row)}</div>
      </div>
    );
  }

  const hoverRow = hover ? rows[hover.index] : null;

  return (
    <div onPointerLeave={() => setHover(null)}>
      <div className="border-y border-neutral-200 py-1.5 dark:border-neutral-700">
        {rows.map((row, index) => {
          const isOpen = expanded.has(row.id);
          const highest = getHighestDifficulty(row.tiers);
          const detailId = `total-clears-detail-${row.id}`;
          return (
            <div key={row.id} className={`${isOpen ? 'bg-neutral-100 dark:bg-neutral-800' : ''} hover:bg-neutral-100 dark:hover:bg-neutral-800`}>
              <div
                className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-2 px-3 py-3 md:grid-cols-[120px_minmax(0,1fr)_150px_16px] md:gap-6 md:px-4"
                onClick={() => toggle(row.id)}
                onPointerMove={onRowPointerMove(index)}
              >
                <div className="col-start-1 row-start-1 flex min-w-0 flex-col leading-tight">
                  <strong className="truncate text-sm font-medium" title={row.label}>
                    {row.label}
                  </strong>
                  {highest && (
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      <Swatch diff={highest.diff} className="size-2" />
                      {highest.diff} {players(highest.count)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="col-span-3 row-start-2 block w-full py-1.5 md:col-span-1 md:col-start-2 md:row-start-1"
                  aria-expanded={isOpen}
                  aria-controls={detailId}
                  aria-label={row.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(row.id);
                  }}
                >
                  {bar(row)}
                </button>
                <div className="col-start-2 row-start-1 flex flex-col items-end leading-tight md:col-start-3">
                  <strong className="text-lg font-semibold tabular-nums md:text-xl">{players(row.total)}</strong>
                  {row.rank20000Score != null && (
                    <span className="whitespace-nowrap text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      {rankLabel(CUTOFF_RANK)}: {row.rank20000Score.toLocaleString()}
                    </span>
                  )}
                </div>
                <FiChevronDown className={`col-start-3 row-start-1 size-4 text-neutral-400 transition-transform md:col-start-4 ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
              </div>
              {isOpen && (
                <div id={detailId} className="px-3 pb-4 md:pr-4 md:pl-40">
                  {detailList(row)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {legend}

      {hover && hoverRow && (
        <div
          className="pointer-events-none fixed z-20 w-58 border border-neutral-300 bg-white px-2.5 py-2 text-xs dark:border-neutral-600 dark:bg-neutral-900"
          style={{ left: Math.min(hover.x + 16, window.innerWidth - 240), top: hover.y + 230 > window.innerHeight ? hover.y - 230 : hover.y + 16 }}
          aria-hidden
        >
          <div className="mb-1 flex justify-between font-semibold">
            <span>{hoverRow.label}</span>
            <span className="tabular-nums">{players(hoverRow.total)}</span>
          </div>
          {difficulties.map((diff) => {
            const count = hoverRow.tiers[diff] ?? 0;
            return (
              <div
                key={diff}
                className={`-mx-1 grid grid-cols-[10px_1fr_auto_44px] items-center gap-1.5 px-1 py-px ${diff === hover.activeDiff ? 'bg-neutral-100 font-semibold dark:bg-neutral-800' : ''} ${count ? '' : 'opacity-45'}`}
              >
                <Swatch diff={diff} />
                <span>{diff}</span>
                <span className="text-right tabular-nums">{count.toLocaleString()}</span>
                <span className="text-right tabular-nums text-neutral-500">{hoverRow.total ? ((count / hoverRow.total) * 100).toFixed(1) : '0.0'}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
