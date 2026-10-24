import eventListJsonRaw from '~/data/jp/eventList.json';
import { getGlobalEventDates } from '~/data/globalEventDates';
import { getKstTime } from '~/data/globalRaidDates';
import { getlocaleMethond } from '~/utils/locale';
import type { Locale } from '~/utils/i18n/config';
import type { EventEntry, EventListData } from '~/types/eventList';
import type { StatusEvent } from '~/types/eventStatus';

const eventListJson = eventListJsonRaw as unknown as EventListData;

/** The GL/KR event running at `now`, otherwise the next upcoming one. */
export function getGlEventStatus(locale: Locale, now: Date): StatusEvent | null {
  let glEvent: StatusEvent | null = null;
  {
    const glDates = getGlobalEventDates();
    const processed = Object.entries(glDates).map(([idStr, dates]) => {
      const id = Number(idStr);
      const d = eventListJson[idStr];
      const name = d ? (d[getlocaleMethond('', 'Jp', locale) as keyof EventEntry] as string | undefined) || d.Jp || `Event ${id}` : `Event ${id}`;
      return { id, name, startTime: new Date(getKstTime(dates.start)), endTime: new Date(getKstTime(dates.end)) };
    });

    const current = processed.find((e) => now >= e.startTime && now <= e.endTime);
    if (current) {
      glEvent = { id: current.id, name: current.name, status: 'active', dateIso: current.endTime.toISOString() };
    } else {
      const upcoming = processed.filter((e) => e.startTime > now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];
      if (upcoming) {
        glEvent = { id: upcoming.id, name: upcoming.name, status: 'upcoming', dateIso: upcoming.startTime.toISOString() };
      }
    }
  }
  return glEvent;
}
