// src/components/EventInfo.tsx

import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import eventListJson from '~/data/jp/eventList.json';
import type { EventListData } from '~/types/eventList';
import { getlocaleMethond } from './common/locale';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { HiOutlineCalendarDays, HiOutlineTag, HiOutlineInformationCircle, HiChevronDown, HiXMark, HiMagnifyingGlass, HiOutlineGlobeAlt, HiArrowsRightLeft } from 'react-icons/hi2';
import { localeLink } from '~/utils/localeLink';
import { getGlobalEventDates } from '~/data/globalEventDates';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import type { TFunction } from 'i18next';

interface EventInfoProps {
  name: string;
  eventId: number;
  startTime: string;
  endTime: string;
  eventContentTypeStr: string[];
}

export function formatInTimeZone(original: string, timeZone: string = '+09:00') {
  if (!original) return new Date();
  const kstIsoString = original.replace(' ', 'T') + timeZone;
  const date = new Date(kstIsoString);
  return date;
}

const typedEventList = eventListJson as unknown as EventListData;

interface SortedEvent {
  id: number;
  name: string;
  openTime: string;
  closeTime: string;
}

export function eventTagTranslation(tag: string, t: TFunction<'planner'>) {
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
  else if (tag == 'ClueSearch') return `${t('ui.minigame')} - ${t('minigame.clue_search')}`;
  else if (tag == 'MiniGameRoad') return `${t('ui.minigame')} - ${t('minigame.minigame_road')}`;
  else if (tag == 'MiniGameShooting') return `${t('ui.minigame')} - ${t('minigame.minigame_shooting')}`;
  else if (tag == 'InteractiveWorldRaid') return t('minigame.interactive_world_raid');
  return tag;
}

export const EventInfo = ({ name, eventId, startTime, endTime, eventContentTypeStr }: EventInfoProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('planner');
  const { t: t_c } = useTranslation('common');
  const { t: t_d } = useTranslation('dashboard');
  const locale = i18n.language as Locale;
  const locale_key = getlocaleMethond('', 'Jp', locale) as 'Jp' | 'Kr' | 'En';

  const matcher = useSearchMatcher(locale);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Current time (for checking ongoing events)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (isPickerOpen) {
      setNow(new Date());
    }
  }, [isPickerOpen]);

  const sortedEvents: SortedEvent[] = useMemo(() => {
    return Object.entries(typedEventList)
      .filter(([, details]) => details.Planable !== false)
      .map(([id, details]) => ({
        id: Number(id),
        name: details[locale_key] || details.Jp || `Event ${id}`,
        openTime: details.OpenTime,
        closeTime: details.CloseTime,
      }))
      .sort((a, b) => b.openTime.localeCompare(a.openTime));
  }, [locale, locale_key]);

  const filteredEvents = useMemo(() => {
    if (!searchTerm) {
      return sortedEvents;
    }
    // return sortedEvents.filter((event) => event.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return sortedEvents.filter((event) => matcher(event.name, searchTerm));
  }, [sortedEvents, searchTerm]);

  const currentEvent = useMemo(() => {
    const event = sortedEvents.find((e) => e.id === eventId);
    const eventName = event?.name || name || 'No event information';
    const isRerun = eventId > 10000 && eventId < 60000;
    const glData = getGlobalEventDates()[eventId];

    return {
      name: eventName,
      isRerun: isRerun,
      glData,
    };
  }, [eventId, sortedEvents, name]);

  const handleEventChange = (id: number) => {
    if (id) {
      void navigate(localeLink(locale, `/planner/event/${id}`));
    }
  };

  const handleSelectEvent = (id: number) => {
    handleEventChange(id);
    setIsPickerOpen(false);
    setSearchTerm('');
  };

  const renderDateRange = (s: string, e: string) => (
    <>
      <time dateTime={s} suppressHydrationWarning>
        {formatInTimeZone(s).toLocaleString()}
      </time>{' '}
      {locale == 'en' ? '-' : '~'}{' '}
      <time dateTime={e} suppressHydrationWarning>
        {formatInTimeZone(e).toLocaleString()}
      </time>
    </>
  );

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
        {/* Simple Vertical Stack for Dates */}
        <div className="flex flex-col gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
          {/* JP Schedule */}
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-1.5 min-w-[50px] shrink-0 mt-0.5 font-bold text-neutral-500 dark:text-neutral-300">
              <HiOutlineCalendarDays className="h-4 w-4" />
              <span>JP</span>
            </div>
            <span className="leading-snug">{renderDateRange(startTime, endTime)}</span>
          </div>

          {/* GL Schedule */}
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-1.5 min-w-[50px] shrink-0 mt-0.5 font-bold text-neutral-500 dark:text-neutral-300">
              <HiOutlineGlobeAlt className="h-4 w-4" />
              <span>GL</span>
            </div>
            <span className="leading-snug flex flex-wrap gap-2 items-center">
              {currentEvent.glData ? (
                <>
                  <span className={currentEvent.glData.prediction ? 'text-neutral-500 italic' : ''}>{renderDateRange(currentEvent.glData.start, currentEvent.glData.end)}</span>
                  {currentEvent.glData.prediction && (
                    <span className="inline-flex items-center rounded-md bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                      {t_c('pred')}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-neutral-400 italic">{t('ui.tba', 'TBA')}</span>
              )}
            </span>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-2">
          <HiOutlineTag className="h-5 w-5 shrink-0 text-neutral-600 dark:text-neutral-400" />
          {eventContentTypeStr.map((v, i) => (
            <span key={i} className="rounded-full bg-neutral-200 dark:bg-neutral-700 px-3 py-0.5 text-xs font-medium text-neutral-700 dark:text-neutral-200">
              {eventTagTranslation(v, t)}
            </span>
          ))}
        </div>

        <div className="flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-500">
          <HiOutlineInformationCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{t('ui.disclaimer')}</p>
        </div>
      </div>

      {isPickerOpen && <div className="fixed inset-0 z-31 bg-black/30 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setIsPickerOpen(false)}></div>}

      <div
        className={`
          fixed z-50 w-full overflow-hidden rounded-t-2xl bg-white dark:bg-neutral-800 shadow-2xl transition-transform duration-300 ease-out
          sm:max-w-md sm:rounded-2xl sm:inset-auto left-0 sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
          ${isPickerOpen ? 'bottom-0 translate-y-0 sm:bottom-auto sm:translate-y-[-50%]' : 'translate-y-full sm:translate-y-[-40%] sm:opacity-0 sm:hidden'}
        `}
      >
        <div className="flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 p-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 whitespace-nowrap">
              <HiArrowsRightLeft className="h-4 w-4" />
              {t('ui.navigateToEvent')}
            </h2>
            <button type="button" onClick={() => setIsPickerOpen(false)} className="p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full">
              <HiXMark className="h-6 w-6" />
            </button>
          </div>

          <div className="px-4 border-b border-neutral-200 dark:border-neutral-700">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('growthCard.searchEventsPlaceholder')}
                className="w-full border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 py-2 pl-10 pr-4 focus:border-sky-500 focus:ring-sky-500"
              />
              <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto p-2 min-h-0">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => {
                const glInfo = getGlobalEventDates()[event.id];

                // Check Active Status
                const jpStart = formatInTimeZone(event.openTime);
                const jpEnd = formatInTimeZone(event.closeTime);
                const isJpActive = now >= jpStart && now <= jpEnd;

                let isGlActive = false;
                let glStart: Date | null = null;
                if (glInfo && glInfo.start && glInfo.end) {
                  glStart = formatInTimeZone(glInfo.start);
                  const glEnd = formatInTimeZone(glInfo.end);
                  isGlActive = now >= glStart && now <= glEnd;
                }

                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectEvent(event.id % 100000)}
                      className={`flex w-full flex-col rounded-md p-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 group ${event.id % 100000 === eventId ? 'bg-neutral-100 dark:bg-neutral-700' : ''}`}
                    >
                      <div className="flex items-center gap-2 max-w-full">
                        <span className={`truncate flex-1 text-neutral-900 dark:text-neutral-100 ${event.id % 100000 === eventId ? 'font-bold' : 'font-medium'}`}>
                          {(((event.id / 10000) | 0) == 1 ? `[${t('common.rerun')}] ` : '') + event.name}
                        </span>
                      </div>

                      {/* Dates: Single Line */}
                      <span className="mt-1 flex items-center flex-wrap gap-x-3 text-xs">
                        {/* JP Date */}
                        <span suppressHydrationWarning className={`whitespace-nowrap ${isJpActive ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
                          <span className="font-bold mr-1">JP</span>
                          {jpStart.toLocaleDateString()}
                        </span>

                        {/* GL Date */}
                        {glInfo && (
                          <span
                            suppressHydrationWarning
                            className={`whitespace-nowrap ${
                              isGlActive ? 'font-bold text-blue-600 dark:text-blue-400' : glInfo.prediction ? 'text-neutral-400 italic' : 'text-neutral-500 dark:text-neutral-400'
                            }`}
                          >
                            <span className="font-bold mr-1">GL</span>
                            {glStart?.toLocaleDateString()}
                            {glInfo.prediction && <span className="ml-1 text-[9px] border border-neutral-300 dark:border-neutral-600 px-0.5 rounded font-normal">{t_c('pred')}</span>}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="p-4 text-center text-sm text-neutral-500">{t_d('noResults')}</li>
            )}
          </ul>
        </div>
      </div>
    </>
  );
};
