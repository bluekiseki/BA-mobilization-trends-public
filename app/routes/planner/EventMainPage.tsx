// app/routes/planner/EventMainPage.tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, type LoaderFunctionArgs } from 'react-router';
import { getlocaleMethond } from '~/components/planner/common/locale';
import { formatInTimeZone } from '~/components/planner/EventInfo';
import eventList from '~/data/jp/eventList.json';
import { type Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { globalEventDates } from '~/data/globalEventDates';
import ExportImportPanel from '~/components/planner/ExportImportPanel';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/EventMainPage';
import { localeLink } from '~/utils/localeLink';
import { FaTools, FaUserGraduate } from 'react-icons/fa';

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  let i18n = getInstance(context);
  const locale = i18n.language as Locale;
  return data({
    locale,
    siteTitle: i18n.t('home:title'),
    title: i18n.t('planner:page.eventPlanner'),
    description: i18n.t('planner:page.plannerescription'),
    rerun: i18n.t('planner:common.rerun'),
  });
}

export function meta({ loaderData, params }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/p.webp');
}

export function links() {
  return [...createLinkHreflang('/planner/event')];
}

export const EventMainPage = () => {
  const { i18n } = useTranslation('dashboard');
  const { t } = useTranslation('planner');
  const locale = i18n.language as Locale;

  const sortedEvents = useMemo(() => {
    return Object.entries(eventList)
      .filter(([, details]) => {
        return (details as any).Planable != false;
      })
      .map(([id, details]) => ({
        id: Number(id),
        name: details[getlocaleMethond('', 'Jp', locale) as keyof typeof details] || details.Jp || `Event ${id}`,
        openTime: new Date(formatInTimeZone(details.OpenTime)),
        closeTime: new Date(formatInTimeZone(details.CloseTime)),
      }))
      .sort((a, b) => b.openTime.getTime() - a.openTime.getTime());
  }, [locale]);

  const now = new Date();
  const currentEvent = sortedEvents.find((e) => now >= e.openTime && now <= e.closeTime);

  const globalEventToShow = useMemo(() => {
    const processedGlobalEvents = Object.entries(globalEventDates).map(([idStr, dates]) => {
      const id = Number(idStr);
      const details = eventList[idStr as keyof typeof eventList];
      const name = details?.[getlocaleMethond('', 'Jp', locale) as keyof typeof details] || details?.Jp || `Global Event ${id}`;

      return {
        id,
        name,
        startTime: new Date(dates.start),
        endTime: new Date(dates.end),
      };
    });

    // 1. Find currently ongoing global event
    const currentGlobalEvent = processedGlobalEvents.find((e) => now >= e.startTime && now <= e.endTime);
    if (currentGlobalEvent) {
      return currentGlobalEvent;
    }

    // 2. If no event is ongoing, find the soonest upcoming event
    const upcomingGlobalEvents = processedGlobalEvents.filter((e) => e.startTime > now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return upcomingGlobalEvents.length > 0 ? upcomingGlobalEvents[0] : null;
  }, [locale]);

  return (
    <div className="min-h-screen font-sans bg-linear-to-b from-sky-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-900 text-neutral-800 dark:text-neutral-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-400 mb-2 tracking-tight">{t('page.eventPlanner')}</h1>
          <p className="mt-2 text-lg text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto">{t('app.description')}</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">{t('app.disclaimer')}</p>
        </header>

        {currentEvent && (
          <div className="mb-8 p-4 sm:p-6 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700">
            <h2 className="font-semibold text-neutral-500 dark:text-neutral-400">{t('ui.currentEventJP')}</h2>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{currentEvent.name}</p>
            <Link
              to={localeLink(locale, `/planner/event/${currentEvent.id}`)}
              className="block w-full text-center mt-4 bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors shadow hover:shadow-md"
            >
              {`'${currentEvent.name}' ${t('button.goToPlanner')}`}
            </Link>
          </div>
        )}

        {/* Current or scheduled global server event card */}
        {globalEventToShow && (
          <div className="mb-8 p-4 sm:p-6 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700">
            <h2 className="font-semibold text-neutral-500 dark:text-neutral-400">{now >= globalEventToShow.startTime ? t('ui.currentEventGlobal') : t('ui.upcomingEventGlobal')}</h2>
            <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{globalEventToShow.name}</p>
            <Link
              to={localeLink(locale, `/planner/event/${globalEventToShow.id}`)}
              className="block w-full text-center mt-4 bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 transition-colors shadow hover:shadow-md"
            >
              {`'${globalEventToShow.name}' ${t('button.goToPlanner')}`}
            </Link>
          </div>
        )}

        {/* Message when nothing is in progress */}
        {!currentEvent && !globalEventToShow && <div className="text-center text-neutral-500 dark:text-neutral-400 mb-10">{t('ui.noCurrentEvent')}</div>}

        {/* Bottom Card Grid: Apply Glassmorphism Style to All Cards */}
        {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Link to={localeLink(locale,"/planner/students")} className="block p-4 sm:p-6 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:-translate-y-1 transition-all duration-300">
                        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('page.studentGrowthPlanner')}</h2>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">{t('page.description.studentGrowthPlanner')}</p>
                    </Link> */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Card: Split into Student Growth Planner and Equipment Farming Planner */}
          <div className="grid grid-rows-2 gap-6">
            {/* 1. Student Growth Planner */}
            <Link
              to={localeLink(locale, '/planner/students')}
              className="flex flex-col justify-center p-4 sm:p-6 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:-translate-y-1 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <FaUserGraduate className="text-2xl text-blue-500 dark:text-blue-400 shrink-0" />
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('page.studentGrowthPlanner')}</h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{t('page.description.studentGrowthPlanner')}</p>
                </div>
              </div>
            </Link>

            {/* 2. Equipment Farming Planner */}
            <Link
              to={localeLink(locale, '/planner/equipment')}
              className="flex flex-col justify-center p-4 sm:p-6 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:-translate-y-1 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <FaTools className="text-2xl text-teal-500 dark:text-teal-400 shrink-0" />
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('page.equipmentFarmingPlanner')} (BETA)</h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{t('page.description.equipmentFarmingPlanner')}</p>
                </div>
              </div>
            </Link>
          </div>

          <div className="p-4 sm:p-6 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('ui.pastEvents')}</h2>
            <div className="relative mt-3">
              <div className="max-h-48 overflow-y-auto pr-2">
                <div className="relative border-l-2 border-neutral-300 dark:border-neutral-700 ml-3 pt-1">
                  {sortedEvents.map((event) => (
                    <div key={event.id} className="relative mb-3">
                      <div className="absolute left-0 -translate-x-1.5 top-2 translate-y-1/2 w-2.5 h-2.5 rounded-full bg-neutral-500 dark:bg-neutral-400 border-2 border-white/60 dark:border-neutral-800/60"></div>
                      <Link
                        to={localeLink(locale, `/planner/event/${event.id}`)}
                        className="block p-2 ml-2 sm:ml-5 rounded-md hover:bg-neutral-500/10 dark:hover:bg-neutral-900/40 text-sm transition-colors"
                      >
                        <span className="text-neutral-700 dark:text-neutral-300">
                          {event.id > 10000 ? `[${t('common.rerun')}] ` : ''} {event.name}
                        </span>
                        <span className="text-xs text-neutral-400 dark:text-neutral-500 ml-2">({event.openTime.toLocaleDateString()})</span>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-10 bg-linear-to-t from-white/60 via-white/60 dark:from-neutral-800/60 dark:via-neutral-800/60 to-transparent pointer-events-none"></div>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <ExportImportPanel />
        </div>
      </div>
    </div>
  );
};

export default EventMainPage;
