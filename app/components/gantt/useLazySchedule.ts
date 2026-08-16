import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameServer } from '~/types/data';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { MS_PER_HOUR } from './constants';

const MS_PER_DAY = 24 * MS_PER_HOUR;

export interface LazyScheduleData {
  tracks: Record<string, ScheduleItemV2[]>;
  timeRange: { min: number; max: number };
}

interface UseLazyScheduleOptions {
  server: GameServer;
  // Matches the `type` query param understood by /api/calendar/v2
  apiType: 'all' | 'widget';
  initialData: LazyScheduleData;
  // Resets internal state when this changes (e.g. server switched without a component remount)
  resetKey: string;
  // How many extra days to pull per edge-triggered fetch
  extendDays?: number;
  // Fetch more once the visible viewport gets this close to a loaded edge
  edgeThresholdDays?: number;
}

export function useLazySchedule({ server, apiType, initialData, resetKey, extendDays = 365, edgeThresholdDays = 14 }: UseLazyScheduleOptions) {
  const [data, setData] = useState<LazyScheduleData>(initialData);
  const rangeRef = useRef(initialData.timeRange);
  const pendingRef = useRef<{ start: boolean; end: boolean }>({ start: false, end: false });
  // Once an edge-triggered fetch comes back with zero items, that direction has hit the real
  // extent of the underlying data (e.g. before game launch, or past the furthest scheduled item) —
  // stop extending so the timeline doesn't scroll into an endless empty void.
  const exhaustedRef = useRef<{ start: boolean; end: boolean }>({ start: false, end: false });
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    rangeRef.current = initialData.timeRange;
    pendingRef.current = { start: false, end: false };
    exhaustedRef.current = { start: false, end: false };
    setData(initialData);
  }, [resetKey]);

  const fetchMore = useCallback(
    async (direction: 'start' | 'end') => {
      if (pendingRef.current[direction] || exhaustedRef.current[direction]) return;
      pendingRef.current[direction] = true;
      try {
        const current = rangeRef.current;
        const start = direction === 'start' ? current.min - extendDays * MS_PER_DAY : current.max;
        const end = direction === 'start' ? current.min : current.max + extendDays * MS_PER_DAY;

        const res = await fetch(`/api/calendar/v2?type=${apiType}&server=${server}&start=${start}&end=${end}`);
        if (!res.ok) return;
        const json: { data: LazyScheduleData } = await res.json();
        const fetched = json.data;

        const fetchedItemCount = Object.values(fetched.tracks).reduce((sum, items) => sum + items.length, 0);
        if (fetchedItemCount === 0) {
          exhaustedRef.current[direction] = true;
          return;
        }

        setData((prev) => {
          const mergedTracks: Record<string, ScheduleItemV2[]> = {};
          const keys = new Set([...Object.keys(prev.tracks), ...Object.keys(fetched.tracks)]);
          keys.forEach((key) => {
            const seen = new Set<string>();
            const merged: ScheduleItemV2[] = [];
            for (const item of [...(prev.tracks[key] ?? []), ...(fetched.tracks[key] ?? [])]) {
              if (seen.has(item.id)) continue;
              seen.add(item.id);
              merged.push(item);
            }
            merged.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            mergedTracks[key] = merged;
          });

          const newRange = {
            min: Math.min(prev.timeRange.min, fetched.timeRange.min),
            max: Math.max(prev.timeRange.max, fetched.timeRange.max),
          };
          rangeRef.current = newRange;
          return { tracks: mergedTracks, timeRange: newRange };
        });
      } catch (err) {
        console.error('[useLazySchedule] failed to extend schedule range', err);
      } finally {
        pendingRef.current[direction] = false;
      }
    },
    [server, apiType, extendDays],
  );

  // Call on scroll: fetches more data once the visible viewport nears a loaded edge.
  const checkEdges = useCallback(
    (scrollLeft: number, viewportWidth: number, pixelsPerHour: number) => {
      if (!viewportWidth || !pixelsPerHour) return;
      const { min, max } = rangeRef.current;
      const visibleStartMs = min + (scrollLeft / pixelsPerHour) * MS_PER_HOUR;
      const visibleEndMs = min + ((scrollLeft + viewportWidth) / pixelsPerHour) * MS_PER_HOUR;

      if (visibleStartMs - min < edgeThresholdDays * MS_PER_DAY) void fetchMore('start');
      if (max - visibleEndMs < edgeThresholdDays * MS_PER_DAY) void fetchMore('end');
    },
    [fetchMore, edgeThresholdDays],
  );

  return { data, checkEdges };
}
