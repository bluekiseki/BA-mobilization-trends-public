// src/components/EventInfo.tsx

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import eventList from '~/data/jp/eventList.json';
import { getlocaleMethond } from './common/locale';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { HiOutlineCalendarDays, HiOutlineTag, HiOutlineInformationCircle, HiChevronDown, HiXMark, HiMagnifyingGlass } from 'react-icons/hi2';
import { localeLink } from '~/utils/localeLink';

interface EventInfoProps {
  name: string;
  eventId: number;
  startTime: string;
  endTime: string;
  eventContentTypeStr: string[];
}

export function formatInTimeZone(original: string, timeZone: string = '+09:00') {
  const kstIsoString = original.replace(' ', 'T') + timeZone;
  const date = new Date(kstIsoString);
  return date;
}

interface SortedEvent {
  id: number;
  name: string;
  openTime: string;
  Planable?: boolean;
}

export function eventTagTranslation(tag: string, t: any) {
  if (tag == 'Stage') return t('common.stage');
  else if (tag == 'Shop') return t('common.shop');
  else if (tag == 'Mission') return t('common.mission');
  else if (tag == 'BoxGacha') return `${t('ui.minigame')} - ${t('minigame.roulette')}`;
  else if (tag == 'FortuneGachaShop') return `${t('ui.minigame')} - ${t('minigame.omikuji')}`;
  else if (tag == 'DiceRace') return `${t('ui.minigame')} - ${t('minigame.diceRace')}`;
  else if (tag == 'Concentration') return `${t('ui.minigame')} - ${t('minigame.card_match')}`;
  else if (tag == 'Treasure') return `${t('ui.minigame')} - ${t('minigame.treasureHunt')}`;
  else if (tag == 'CardShop') return `${t('ui.minigame')} - ${t('placeholder.cardGacha')}`;
  else if (tag == 'MiniGameCCG') return `${t('ui.minigame')} - ${t('minigame.minigame_ccg')}`;
  else if (tag == 'MiniGameDefense') return `${t('ui.minigame')} - ${t('minigame.minigame_defense')}`;
  else if (tag == 'MinigameDreamMaker') return `${t('ui.minigame')} - ${t('minigame.minigame_dream')}`;
  return tag;
}

export const EventInfo = ({ name, eventId, startTime, endTime, eventContentTypeStr }: EventInfoProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('planner');
  const { t: t_d } = useTranslation('dashboard');
  const locale = i18n.language as Locale;
  const locale_key = getlocaleMethond('', 'Jp', locale) as 'Jp' | 'Kr' | 'En';

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const sortedEvents: SortedEvent[] = useMemo(() => {
    return Object.entries(eventList)
      .filter(([, details]) => {
        return (details as any).Planable != false;
      })
      .map(([id, details]) => ({
        id: Number(id),
        name: (details as any)[locale_key] || (details as any).Jp || `Event ${id}`,
        openTime: (details as any).OpenTime,
      }))
      .sort((a, b) => b.openTime.localeCompare(a.openTime));
  }, [locale, locale_key]);

  const filteredEvents = useMemo(() => {
    if (!searchTerm) {
      return sortedEvents;
    }
    return sortedEvents.filter((event) => event.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [sortedEvents, searchTerm]);

  const currentEvent = useMemo(() => {
    const event = sortedEvents.find((e) => e.id === eventId);
    const eventName = event?.name || name || 'No event information';
    const isRerun = eventId > 10000;
    return {
      name: eventName,
      isRerun: isRerun,
      formattedName: (isRerun ? `[${t('common.rerun')}] ` : '') + eventName,
    };
  }, [eventId, sortedEvents, name, t]);

  const handleEventChange = (id: number) => {
    if (id) {
      navigate(localeLink(locale, `/planner/event/${id}`));
    }
  };

  const handleSelectEvent = (id: number) => {
    handleEventChange(id);
    setIsPickerOpen(false);
    setSearchTerm(''); // Initialize search terms
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsPickerOpen(true)}
        className="flex w-full items-center justify-between gap-4 rounded-lg bg-white dark:bg-neutral-800 p-4 text-left shadow-sm ring-1 ring-black/5 dark:ring-white/10 transition-all hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
      >
        <span className="flex-1">
          {currentEvent.isRerun && <span className="block text-xs font-medium text-sky-600 dark:text-sky-400">{t('common.rerun')}</span>}
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-800 dark:text-neutral-100">{currentEvent.name}</h1>
        </span>
        <HiChevronDown className="h-6 w-6 shrink-0 text-neutral-400" />
      </button>

      <div className="mt-4 space-y-3">
        {/* time */}
        <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          <HiOutlineCalendarDays className="h-5 w-5 shrink-0" />
          <span>
            <time dateTime={startTime}>{formatInTimeZone(startTime).toLocaleString()}</time> {locale == 'en' ? '-' : '~'} <time dateTime={endTime}>{formatInTimeZone(endTime).toLocaleString()}</time>
          </span>
        </div>

        {/* tag */}
        <div className="flex flex-wrap items-center gap-2">
          <HiOutlineTag className="h-5 w-5 shrink-0 text-neutral-600 dark:text-neutral-400" />
          {eventContentTypeStr.map((v, i) => (
            <span key={i} className="rounded-full bg-neutral-200 dark:bg-neutral-700 px-3 py-0.5 text-xs font-medium text-neutral-700 dark:text-neutral-200">
              {/* {v} */}
              {eventTagTranslation(v, t)}
            </span>
          ))}
        </div>

        <div className="flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-500">
          <HiOutlineInformationCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{t('ui.disclaimer')}</p>
        </div>
      </div>

      {isPickerOpen && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setIsPickerOpen(false)}></div>}

      <div
        className={`
          fixed z-50 w-full overflow-hidden rounded-t-2xl bg-white dark:bg-neutral-800 shadow-2xl transition-transform duration-300 ease-out
          sm:max-w-md sm:rounded-2xl sm:inset-auto left-0 sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
          ${isPickerOpen ? 'bottom-0 translate-y-0 sm:bottom-auto sm:translate-y-[-50%]' : 'translate-y-full sm:translate-y-[-40%] sm:opacity-0 sm:hidden'}
        `}
      >
        <div className="flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 p-4">
            <h2 className="text-lg font-semibold">{t('ui.navigateToEvent')}</h2>
            <button type="button" onClick={() => setIsPickerOpen(false)} className="p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full">
              <HiXMark className="h-6 w-6" />
            </button>
          </div>

          {/* Search bar */}
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('growthCard.searchEventsPlaceholder')}
                className="w-full rounded-md border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 py-2 pl-10 pr-4 focus:border-sky-500 focus:ring-sky-500"
              />
              <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
            </div>
          </div>

          {/* List */}
          <ul className="flex-1 overflow-y-auto p-2 min-h-[70vh]">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => (
                <li key={event.id}>
                  <button type="button" onClick={() => handleSelectEvent(event.id)} className="flex w-full flex-col rounded-md p-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700">
                    <span className="block truncate font-medium text-neutral-900 dark:text-neutral-100">{(event.id > 10000 ? `[${t('common.rerun')}] ` : '') + event.name}</span>
                    <span className="block text-sm text-neutral-500 dark:text-neutral-400">{new Date(event.openTime).toLocaleDateString()}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="p-4 text-center text-sm text-neutral-500">{t_d('noResults')}</li>
            )}
          </ul>
        </div>
      </div>
    </>
  );
};
