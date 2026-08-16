import { useTranslation } from 'react-i18next';
import type { TimelineAnnotation } from '~/utils/resourceTimeline';
import { getSourceMeta } from './ResourceTimelineChart';

type RawEntry = TimelineAnnotation & { date: string };

export interface GroupedResourceEventLogEntry {
  startDate: string;
  endDate: string;
  count: number;
  entry: RawEntry;
}

export interface ResourceEventLogTotals {
  gain: number;
  spend: number;
  net: number;
  eventCount: number;
  nextDate: string | null;
}

function fmtD(d: string): string {
  return `${d.slice(5, 7)}/${d.slice(8, 10)}`;
}

export function groupTimelineAnnotations(perDate: Record<string, TimelineAnnotation[]>): GroupedResourceEventLogEntry[] {
  const buckets = new Map<string, RawEntry[]>();
  for (const [date, entries] of Object.entries(perDate)) {
    for (const entry of entries) {
      const key = `${entry.label}::${entry.source}::${entry.delta}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push({ date, ...entry });
      buckets.set(key, bucket);
    }
  }

  const groups: GroupedResourceEventLogEntry[] = [];
  for (const entries of buckets.values()) {
    entries.sort((a, b) => a.date.localeCompare(b.date));

    let cur: GroupedResourceEventLogEntry | null = null;
    for (const entry of entries) {
      if (cur !== null) {
        const next = new Date(cur.endDate + 'T00:00:00Z');
        next.setUTCDate(next.getUTCDate() + 1);
        const nextDate = next.toISOString().slice(0, 10);
        if (nextDate === entry.date) {
          cur.endDate = entry.date;
          cur.count++;
          continue;
        }
      }
      const newGroup: GroupedResourceEventLogEntry = { startDate: entry.date, endDate: entry.date, count: 1, entry };
      groups.push(newGroup);
      cur = newGroup;
    }
  }

  return groups.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function summarizeGroupedResourceEvents(rows: GroupedResourceEventLogEntry[], startDate: string): ResourceEventLogTotals {
  let gain = 0;
  let spend = 0;
  let eventCount = 0;
  let nextDate: string | null = null;

  for (const row of rows) {
    const totalDelta = row.entry.delta * row.count;
    eventCount += row.count;
    if (totalDelta >= 0) gain += totalDelta;
    else spend += -totalDelta;
    if (nextDate === null && row.endDate >= startDate) {
      nextDate = row.startDate >= startDate ? row.startDate : startDate;
    }
  }

  return { gain, spend, net: gain - spend, eventCount, nextDate };
}

export function ResourceEventLogList({
  rows,
  maxHeightClass = 'max-h-48',
  resolveItemLabel,
}: {
  rows: GroupedResourceEventLogEntry[];
  maxHeightClass?: string;
  resolveItemLabel?: (key: string) => string;
}) {
  const { t } = useTranslation();

  if (rows.length === 0) return null;

  return (
    <div className={`${maxHeightClass} overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800`}>
      {rows.map(({ startDate, endDate, count, entry }, i) => {
        const sourceMeta = getSourceMeta(entry.source);
        const dateLabel = count > 1 ? `${fmtD(startDate)}-${fmtD(endDate)} (${count}d)` : startDate;
        const totalDelta = entry.delta * count;
        const resolvedParams =
          entry.labelParams && resolveItemLabel && typeof entry.labelParams.itemKey === 'string'
            ? { ...entry.labelParams, item: resolveItemLabel(entry.labelParams.itemKey), itemKey: undefined }
            : entry.labelParams;
        const displayLabel = entry.labelKey ? (entry.labelKey.includes(':') ? t(entry.labelKey, resolvedParams) : (resolveItemLabel?.(entry.labelKey) ?? entry.labelKey)) : entry.label;
        return (
          <div key={i} className="flex items-center gap-2 py-1 text-xs">
            <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sourceMeta.color }} />
            <span className="font-mono text-neutral-400 dark:text-neutral-500 shrink-0">{dateLabel}</span>
            <span className="flex-1 text-neutral-600 dark:text-neutral-300 truncate" title={displayLabel}>
              {displayLabel}
            </span>
            <span className={`font-mono tabular-nums shrink-0 ${totalDelta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {totalDelta >= 0 ? '+' : ''}
              {Math.round(totalDelta).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
