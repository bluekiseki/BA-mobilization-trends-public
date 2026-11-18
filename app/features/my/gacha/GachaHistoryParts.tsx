import { SheetIcon } from '~/components/common/SheetIcon';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Tooltip from 'rc-tooltip';
import { HiOutlineQuestionMarkCircle } from 'react-icons/hi2';
import { IndexRangeSlider, useIndexRange } from '~/components/common/IndexRangeSlider';
import { type BannerPeriod } from '~/utils/gachaData';
import { type DistributionSummary } from '~/features/my/gacha/logic/gachaHistoryStats';
import type { GachaHistoryEntry, GachaHistoryResult, GachaHistoryServer } from '~/types/gachaHistory';

export interface FormState {
  bannerId: string;
  server: GachaHistoryServer;
  date: string;
  pullCount: string;
  goalPullCount: string;
  initialCharge: string;
  initialChargeLimited: string;
  notes: string;
  results: GachaHistoryResult[];
}
export interface LuckRangePoint {
  id: string;
  label: string;
  date: string;
  students: Array<{ id: number; name: string }>;
  min: number;
  max: number;
}
export function createForm(server: GachaHistoryServer, entry?: GachaHistoryEntry): FormState {
  return entry
    ? {
        bannerId: entry.bannerId,
        server: entry.server,
        date: entry.date,
        pullCount: String(entry.pullCount),
        goalPullCount: entry.goalPullCount === undefined ? '' : String(entry.goalPullCount),
        initialCharge: entry.initialCharge === undefined ? '0' : String(entry.initialCharge),
        initialChargeLimited: entry.initialChargeLimited === undefined ? '0' : String(entry.initialChargeLimited),
        notes: entry.notes ?? '',
        results: entry.results,
      }
    : { bannerId: '', server, date: new Date().toISOString().slice(0, 10), pullCount: '', goalPullCount: '', initialCharge: '0', initialChargeLimited: '0', notes: '', results: [] };
}
export function bannerLabel(banner: BannerPeriod, studentNames: Map<number, string>): string {
  return `${banner.startTime.slice(0, 10)} · ${banner.pickupStudents.map((student) => studentNames.get(student.id) ?? student.name).join(' / ')}`;
}
export function getBannerDate(banner: BannerPeriod, date: string): string {
  const start = banner.startTime.slice(0, 10);
  const end = banner.endTime.slice(0, 10);
  return date < start || date > end ? start : date;
}
function formatStatisticValue(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}
export function DistributionChart({
  title,
  subtitle,
  description,
  valueUnit,
  summary,
  lowerIsBetter,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  valueUnit: string;
  summary: DistributionSummary | null;
  lowerIsBetter?: boolean;
}) {
  const { t } = useTranslation(['mypage', 'ui', 'planner']);
  const [activeValue, setActiveValue] = useState<number | null>(null);
  const [plotSize, setPlotSize] = useState({ width: 0, height: 0 });
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const updateSize = () => setPlotSize({ width: Math.round(plot.clientWidth), height: Math.round(plot.clientHeight) });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(plot);
    return () => observer.disconnect();
  }, [summary]);
  const heading = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="font-semibold text-neutral-950 dark:text-neutral-50">{title}</h2>
      {subtitle && <span className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</span>}
      {description && (
        <Tooltip placement="top" trigger={['hover', 'click']} styles={{ root: { maxWidth: '20rem' } }} overlay={<span className="text-xs">{description}</span>}>
          <button type="button" aria-label={t('gacha.stats.methodInfo')} className="cursor-help text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
            <HiOutlineQuestionMarkCircle className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
    </div>
  );
  if (!summary) {
    return (
      <section className="space-y-2">
        {heading}
        <div className="border-y border-neutral-200 py-5 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">{t('raids.stats.noData')}</div>
      </section>
    );
  }
  const rawMinPointValue = summary.points[0]?.value ?? 0;
  const rawMaxPointValue = (summary.points.at(-1)?.value ?? rawMinPointValue) + summary.pointWidth;
  const rawPointDomain = Math.max(summary.pointWidth, rawMaxPointValue - rawMinPointValue);
  const minimumBarWidth = 4;
  const availablePointCount = Math.max(1, Math.floor(plotSize.width / minimumBarWidth));
  const pointWidthMultiplier = Math.max(1, Math.ceil(rawPointDomain / summary.pointWidth / availablePointCount));
  const pointWidth = summary.pointWidth * pointWidthMultiplier;
  const groupedPointProbabilities = new Map<number, number>();
  for (const point of summary.points) {
    const groupedValue = Math.floor(point.value / pointWidth) * pointWidth;
    groupedPointProbabilities.set(groupedValue, (groupedPointProbabilities.get(groupedValue) ?? 0) + point.probability);
  }
  const points = [...groupedPointProbabilities.entries()].sort(([left], [right]) => left - right).map(([value, probability]) => ({ value, probability }));
  const actualPointValue = Math.floor(summary.actualPointValue / pointWidth) * pointWidth;
  if (!groupedPointProbabilities.has(actualPointValue)) points.push({ value: actualPointValue, probability: 0 });
  points.sort((left, right) => left.value - right.value);
  const max = Math.max(...points.map((point) => point.probability), 0.001);
  const activePoint = points.find((point) => point.value === activeValue) ?? null;
  const minPointValue = points[0]?.value ?? 0;
  const maxPointValue = (points.at(-1)?.value ?? minPointValue) + pointWidth;
  const pointDomain = Math.max(pointWidth, maxPointValue - minPointValue);
  const pointValues = new Set(points.map((point) => point.value));
  const cumulativePoints = points.reduce<Array<{ value: number; cumulative: number }>>((accumulator, point) => {
    const previous = accumulator.at(-1)?.cumulative ?? 0;
    accumulator.push({ value: point.value, cumulative: previous + point.probability });
    return accumulator;
  }, []);
  const activeCdf = activePoint ? cumulativePoints.find((point) => point.value === activePoint.value)?.cumulative : undefined;
  const cdfLine = cumulativePoints.map((point) => `${((point.value - minPointValue + pointWidth / 2) / pointDomain) * 100},${100 - point.cumulative * 100}`).join(' ');
  const activatePointAtX = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(0.999999, (event.clientX - bounds.left) / bounds.width));
    const value = minPointValue + ratio * pointDomain;
    const bucket = Math.floor(value / pointWidth) * pointWidth;
    setActiveValue(pointValues.has(bucket) ? bucket : null);
  };
  return (
    <section className="space-y-3">
      {heading}
      <dl className="grid grid-cols-3 divide-x divide-neutral-200 border-y border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
        <div className="px-3 py-2">
          <dt className="text-neutral-500 dark:text-neutral-400">{t('planner:dream_maker.sim.outcomeLabel')}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
            {formatStatisticValue(summary.actual)}
            {valueUnit}
          </dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-neutral-500 dark:text-neutral-400">
            {t('ui:avg')}
            {summary.median !== undefined ? ` · ${t('gacha.stats.median')}` : ''}
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
            {formatStatisticValue(summary.expected)}
            {valueUnit}
            {summary.median !== undefined && (
              <span className="font-normal text-neutral-500 dark:text-neutral-400">
                {' · '}
                {formatStatisticValue(summary.median)}
                {valueUnit}
              </span>
            )}
          </dd>
        </div>
        <div className="px-3 py-2" title={lowerIsBetter ? t('gacha.stats.topPercentLowerTitle') : t('gacha.stats.topPercentHigherTitle')}>
          <dt className="text-neutral-500 dark:text-neutral-400">{t('gacha.stats.topPercent')}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
            {summary.topPercentMin.toFixed(1)}–{summary.topPercentMax.toFixed(1)}%
          </dd>
        </div>
      </dl>
      <div
        className="relative h-36 border-b border-l border-neutral-300 px-2 pt-3 dark:border-neutral-700"
        aria-label={t('gacha.stats.distributionAria', { title })}
        onPointerMove={activatePointAtX}
        onPointerDown={activatePointAtX}
      >
        <div ref={plotRef} className="relative h-full">
          {points.map((point) => {
            const selected = point.value === actualPointValue;
            const isActive = activeValue === point.value;
            const leftRatio = (point.value - minPointValue) / pointDomain;
            const rightRatio = (point.value - minPointValue + pointWidth) / pointDomain;
            const left = Math.round(leftRatio * plotSize.width);
            const right = Math.round(rightRatio * plotSize.width);
            const height = Math.max(2, Math.round((point.probability / max) * plotSize.height));
            return (
              <button
                key={point.value}
                type="button"
                onMouseEnter={() => setActiveValue(point.value)}
                onFocus={() => setActiveValue(point.value)}
                onClick={() => setActiveValue(point.value)}
                title={`${point.value}${valueUnit}: ${(point.probability * 100).toFixed(2)}%`}
                aria-label={t('gacha.stats.pointAria', { value: point.value, unit: valueUnit, percent: (point.probability * 100).toFixed(2) })}
                className={`absolute bottom-0 border-r border-white dark:border-neutral-900 ${selected ? (isActive ? 'bg-red-700 dark:bg-red-600' : 'bg-red-500 hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-600') : isActive ? 'bg-ba-btn-blue-dark hover:bg-ba-btn-blue-dark' : 'bg-ba-btn-blue hover:bg-ba-btn-blue-dark'}`}
                style={{
                  left: plotSize.width > 0 ? `${left}px` : `${leftRatio * 100}%`,
                  width: plotSize.width > 0 ? `${Math.max(minimumBarWidth, right - left)}px` : `${(pointWidth / pointDomain) * 100}%`,
                  height: plotSize.height > 0 ? `${height}px` : `${Math.max(2, (point.probability / max) * 100)}%`,
                }}
              />
            );
          })}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <polyline points={cdfLine} fill="none" stroke="#f6e94b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>{points[0]?.value.toLocaleString()}</span>
        <span>{points.at(-1)?.value.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400" aria-live="polite">
        {activePoint && activeCdf !== undefined ? (
          <span className="tabular-nums text-neutral-700 dark:text-neutral-200">
            {activePoint.value.toLocaleString()}
            {valueUnit} · pdf {(activePoint.probability * 100).toFixed(2)}% · cdf {(activeCdf * 100).toFixed(2)}%
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 bg-ba-btn-blue" />
              pdf
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 bg-ba-btn-yellow" />
              cdf
            </span>
          </>
        )}
      </div>
    </section>
  );
}
export function BannerLuckRangeChart({ title, points: allPoints }: { title: string; points: LuckRangePoint[] }) {
  const { t } = useTranslation('mypage');
  const [range, setRange] = useIndexRange(allPoints.length);
  const points = useMemo(() => allPoints.slice(range[0], range[1] + 1), [allPoints, range]);
  const ticks = [0, 25, 50, 75, 100];
  const upperCoordinates =
    points.length === 1
      ? [
          { x: 25, y: points[0].min },
          { x: 75, y: points[0].min },
        ]
      : points.map((point, index) => ({ x: ((index + 0.5) / points.length) * 100, y: point.min }));
  const lowerCoordinates =
    points.length === 1
      ? [
          { x: 25, y: points[0].max },
          { x: 75, y: points[0].max },
        ]
      : points.map((point, index) => ({ x: ((index + 0.5) / points.length) * 100, y: point.max }));
  const upperLinePoints = upperCoordinates.map(({ x, y }) => `${x},${y}`).join(' ');
  const lowerLinePoints = lowerCoordinates.map(({ x, y }) => `${x},${y}`).join(' ');
  const bandPoints = [...upperCoordinates, ...lowerCoordinates.slice().reverse()].map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-neutral-950 dark:text-neutral-50">{title}</h2>
      <IndexRangeSlider length={allPoints.length} range={range} onChange={setRange} formatLabel={(index) => allPoints[index]?.date ?? ''} />
      {points.length === 0 ? (
        <div className="border-y border-neutral-200 py-5 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">{t('raids.stats.noData')}</div>
      ) : (
        <div className="grid w-full grid-cols-[3.25rem_minmax(0,1fr)] pb-2">
          <div className="relative h-52 border-r border-neutral-300 text-xs tabular-nums text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            {ticks.map((tick) => (
              <span key={tick} className={`absolute right-2 ${tick === 0 ? 'top-0' : tick === 100 ? 'bottom-0' : '-translate-y-1/2'}`} style={tick > 0 && tick < 100 ? { top: `${tick}%` } : undefined}>
                {tick}%
              </span>
            ))}
          </div>
          <div className="relative h-52 overflow-hidden border-b border-neutral-300 dark:border-neutral-700">
            {ticks.slice(0, -1).map((tick) => (
              <span key={tick} className="pointer-events-none absolute inset-x-0 border-t border-neutral-200 dark:border-neutral-800" style={{ top: `${tick}%` }} />
            ))}
            {points.length > 0 && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full text-ba-btn-blue-dark dark:text-ba-btn-blue" aria-hidden="true">
                <polygon points={bandPoints} fill="currentColor" opacity="0.18" />
                <polyline points={upperLinePoints} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <polyline points={lowerLinePoints} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            <div className="relative grid h-full" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
              {points.map((point) => {
                const range = `${point.min.toFixed(1)}–${point.max.toFixed(1)}%`;
                return (
                  <div key={point.id} className="relative h-full">
                    <Tooltip
                      placement="top"
                      trigger={['hover', 'click', 'focus']}
                      styles={{ root: { maxWidth: '20rem' } }}
                      overlay={
                        <span className="text-xs">
                          {point.label}
                          <br />
                          {t('gacha.stats.topPercent')} {range}
                        </span>
                      }
                    >
                      <button
                        type="button"
                        className="group absolute inset-0 w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        aria-label={`${point.label} · ${t('gacha.stats.topPercent')} ${range}`}
                      >
                        <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-neutral-500 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70 dark:border-neutral-300" />
                      </button>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </div>
          <div />
          <div className="grid pt-2" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
            {points.map((point) => (
              <div key={point.id} className="flex min-w-0 justify-center px-0.5" title={point.label} aria-label={point.students.map((student) => student.name).join(', ')}>
                <span className="flex -space-x-4">
                  {point.students.map((student) =>
                    student.id ? (
                      <SheetIcon
                        key={student.id}
                        sheet="student"
                        id={student.id}
                        alt={student.name}
                        className="aspect-square w-6 shrink-0 rounded-full border border-white bg-neutral-100 dark:border-neutral-900 dark:bg-neutral-800"
                      />
                    ) : (
                      <span
                        key={student.id}
                        className="flex aspect-square w-6 shrink-0 items-center justify-center rounded-full border border-white bg-neutral-200 text-[10px] font-semibold text-neutral-600 dark:border-neutral-900 dark:bg-neutral-700 dark:text-neutral-300"
                      >
                        {student.name.slice(0, 1)}
                      </span>
                    ),
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
