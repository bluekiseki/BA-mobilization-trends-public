// app/data/globalEventDates.ts

// This file stores the start and end times for the Global server corresponding to each event ID.
// Enter time in 'YYYY-MM-DDTHH:mm' format.

import krEventCsvRaw from '~/data/kr/schedule/event.csv?raw';
import { parseCsvString } from '~/utils/calender.data';

let cachedGlobalEventDates: Record<number, { start: string; end: string; prediction: boolean }> | null = null;

export function getGlobalEventDates() {
  // If parsed data already exists, return it immediately
  if (cachedGlobalEventDates) {
    return cachedGlobalEventDates;
  }

  // Execute when there is no data
  const globalEventDatesRaw = parseCsvString<{
    id: number;
    openTime: string;
    closeTime: string;
    name: string;
    rerun: string;
    studentId: string;
    prediction?: string | boolean | number;
  }>(krEventCsvRaw);

  cachedGlobalEventDates = Object.fromEntries(
    globalEventDatesRaw.map((v) => [
      v.id,
      {
        start: v.openTime,
        end: v.closeTime,
        prediction: v.prediction === true || (typeof v.prediction === 'string' && v.prediction.toLowerCase() === 'true') || v.prediction === 1,
      },
    ]),
  );

  return cachedGlobalEventDates;
}
