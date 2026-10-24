import type { EventListData } from '~/types/eventList';
import type { Locale } from '~/utils/i18n/config';

const EVENT_LOCALE_KEY = { en: 'En', ko: 'Kr', ja: 'Jp', 'zh-Hant': 'Tw' } as const;

export const findEventEntry = (eventList: EventListData, eventId: number) => eventList[String(eventId < 60000 ? eventId % 10000 : eventId)] ?? eventList[String(eventId % 10000)];

export function getPlannerEventName(eventList: EventListData, eventId: number, lang: Locale, fallback = String(eventId)): string {
  const entry = findEventEntry(eventList, eventId);
  return entry?.[EVENT_LOCALE_KEY[lang]] || entry?.Jp || fallback;
}

export const isPublicPlannerEvent = (eventList: EventListData, eventId: number): boolean => findEventEntry(eventList, eventId)?.Planable !== false;
export const isRerunEvent = (eventId: number): boolean => eventId > 10000 && eventId < 60000;
