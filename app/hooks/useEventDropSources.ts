import { useMemo } from 'react';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { findEventDropSources, type EventDropSource } from '~/utils/itemOutlook';
import { loadEventDropIndex } from '~/utils/itemSourceData';
import { useStaticData } from './useStaticData';

const EMPTY_INDEX = {};

/** Upcoming events whose stages drop the item, nearest first; empty until the index is loaded. */
export function useEventDropSources(itemKey: string | null, events: ScheduleItemV2[], today: string, getTitle: (item: ScheduleItemV2) => string): EventDropSource[] {
  const dropIndex = useStaticData(loadEventDropIndex, EMPTY_INDEX);
  return useMemo(() => (itemKey ? findEventDropSources(itemKey, dropIndex, events, today, getTitle, 2) : []), [itemKey, dropIndex, events, today, getTitle]);
}
