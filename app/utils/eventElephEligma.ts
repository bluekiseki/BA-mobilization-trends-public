import type { EventPlan } from '~/store/planner/useEventPlanStore';
import type { EventData } from '~/types/plannerData';

export interface EventMonthlyGain {
  yearMonth: string; // 'YYYY-MM'
  eligma: number;
  eleph: Record<number, number>; // studentId → amount
}

/**
 * Extracts eligma and eleph gains from event planner cachedTotalItems,
 * grouped by the month the event started.
 */
export function calcEventElephEligma(plans: Record<string, Partial<EventPlan>>, eventsById: Record<number, EventData>): EventMonthlyGain[] {
  const byMonth: Record<string, EventMonthlyGain> = {};

  for (const [eventIdStr, plan] of Object.entries(plans)) {
    const cached = plan.cachedTotalItems;
    if (!cached?.gained) continue;

    const eventId = Number(eventIdStr);
    const event = eventsById[eventId];
    if (!event?.season?.EventContentOpenTime) continue;

    const yearMonth = event.season.EventContentOpenTime.slice(0, 7); // 'YYYY-MM'

    if (!byMonth[yearMonth]) {
      byMonth[yearMonth] = { yearMonth, eligma: 0, eleph: {} };
    }
    const entry = byMonth[yearMonth];

    for (const [itemKey, gain] of Object.entries(cached.gained)) {
      const amount = gain.amount;
      if (amount <= 0) continue;

      if (itemKey === 'Item_23') {
        entry.eligma += amount;
      } else if (itemKey.startsWith('Item_')) {
        const studentId = Number(itemKey.slice(5));
        if (studentId >= 10000 && studentId < 30000) {
          entry.eleph[studentId] = (entry.eleph[studentId] ?? 0) + amount;
        }
      }
    }
  }

  return Object.values(byMonth).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}
