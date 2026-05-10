// app/routes/planner/EventMainPage.tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, type LoaderFunctionArgs } from 'react-router';
import { getlocaleMethond } from '~/components/planner/common/locale';
import { formatInTimeZone } from '~/components/planner/EventInfo';
import eventList from '~/data/jp/eventList.json';
import { type Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { getGlobalEventDates } from '~/data/globalEventDates';
import ExportImportPanel from '~/components/planner/ExportImportPanel';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/EventMainPage';
import { localeLink } from '~/utils/localeLink';
import { FaTools, FaUserGraduate, FaGem, FaHeart, FaCalendarAlt, FaHistory } from 'react-icons/fa';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { RemainingTime } from '~/components/RemainingTime';
// import { SpoilerGuard } from '~/components/common/SpoilerGuard';

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  let i18n = getInstance(context);
  const locale = i18n.language as Locale;
  return data({
    locale,
    siteTitle: i18n.t('common:title'),
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

export function headers({ loaderHeaders, parentHeaders }: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': CACHE_CONTROL_CONFIG,
    };
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

  const baseTime = new Date();
  const currentEvent = sortedEvents.find((e) => baseTime >= e.openTime && baseTime <= e.closeTime);

  const globalEventToShow = useMemo(() => {
    const now = new Date();
    const processedGlobalEvents = Object.entries(getGlobalEventDates()).map(([idStr, dates]) => {
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

    const currentGlobalEvent = processedGlobalEvents.find((e) => now >= e.startTime && now <= e.endTime);
    if (currentGlobalEvent) {
      return currentGlobalEvent;
    }

    const upcomingGlobalEvents = processedGlobalEvents.filter((e) => e.startTime > now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return upcomingGlobalEvents.length > 0 ? upcomingGlobalEvents[0] : null;
  }, [locale]);

  return (
    <div className="min-h-screen font-sans bg-linear-to-b from-sky-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-900 text-neutral-800 dark:text-neutral-200 p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <header className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-400 mb-3 tracking-tight">{t('page.eventPlanner')}</h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto leading-relaxed">{t('app.description')}</p>
          <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500 max-w-xl mx-auto">{t('app.disclaimer')}</p>
        </header>

        {/* Active Events Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* JP Server Event */}
          {currentEvent ? (
            <div className="p-6 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">JP</span>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('ui.currentEventJP')}</span>
                  <RemainingTime targetDate={currentEvent.closeTime} className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mt-0.5" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-4 line-clamp-1">{currentEvent.name}</h3>
              <Link
                to={localeLink(locale, `/planner/event/${currentEvent.id % 100000}`)}
                className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
              >
                {t('button.goToPlanner')}
              </Link>
            </div>
          ) : (
            <div className="...">No Active JP Event</div>
          )}

          {/* Global Server Event */}
          {globalEventToShow ? (
            <div className="p-6 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">GL/KR</span>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{baseTime >= globalEventToShow.startTime ? t('ui.currentEventGlobal') : t('ui.upcomingEventGlobal')}</span>
                  {baseTime >= globalEventToShow.startTime ? (
                    <RemainingTime targetDate={globalEventToShow.endTime} className="text-[10px] font-medium text-green-600 dark:text-green-400 mt-0.5" />
                  ) : (
                    <RemainingTime targetDate={globalEventToShow.startTime} isUpcoming className="text-[10px] font-medium text-green-600 dark:text-green-400 mt-0.5" />
                  )}
                </div>
              </div>
              <h3 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-4 line-clamp-1">{globalEventToShow.name}</h3>
              <Link
                to={localeLink(locale, `/planner/event/${globalEventToShow.id % 100000}`)}
                className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
              >
                {t('button.goToPlanner')}
              </Link>
            </div>
          ) : (
            <div className="...">No Active Global Event</div>
          )}
        </div>

        {/* Tools & Planners Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {/* Main Tools Column */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                to: localeLink(locale, '/planner/students'),
                icon: <FaUserGraduate className="text-2xl text-blue-600 dark:text-blue-400" />,
                iconBg: 'bg-blue-50 dark:bg-blue-900/20 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40',
                borderHover: 'hover:border-blue-400 dark:hover:border-blue-500',
                title: t('page.studentGrowthPlanner'),
                description: t('page.description.studentGrowthPlanner'),
                badge: null,
              },
              {
                to: localeLink(locale, '/planner/equipment'),
                icon: <FaTools className="text-2xl text-teal-600 dark:text-teal-400" />,
                iconBg: 'bg-teal-50 dark:bg-teal-900/20 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/40',
                borderHover: 'hover:border-teal-400 dark:hover:border-teal-500',
                title: t('page.equipmentFarmingPlanner'),
                description: t('page.description.equipmentFarmingPlanner'),
                badge: 'BETA',
              },
              {
                to: localeLink(locale, '/planner/gacha'),
                icon: <FaGem className="text-2xl text-indigo-600 dark:text-indigo-400" />,
                iconBg: 'bg-indigo-50 dark:bg-indigo-900/20 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40',
                borderHover: 'hover:border-indigo-400 dark:hover:border-indigo-500',
                title: t('gacha.title', 'Pyroxene Planner'),
                description: t('gacha.intro.summary', 'Calculate income & Simulate gacha'),
                badge: 'BETA',
              },
              {
                to: localeLink(locale, '/utils/favor'),
                icon: <FaHeart className="text-2xl text-pink-500 dark:text-pink-400" />,
                iconBg: 'bg-pink-50 dark:bg-pink-900/20 group-hover:bg-pink-100 dark:group-hover:bg-pink-900/40',
                borderHover: 'hover:border-pink-400 dark:hover:border-pink-500',
                title: t('page.favorCalculator'),
                description: t('page.description.favorCalculator'),
                badge: null,
              },
            ].map((item) => (
              <Link
                key={String(item.to)}
                to={item.to}
                className={`group p-5 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl border border-neutral-200 dark:border-neutral-700 ${item.borderHover} hover:shadow-md transition-all duration-200 flex flex-col justify-between`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-3 ${item.iconBg} rounded-lg transition-colors`}>{item.icon}</div>
                  {item.badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">{item.badge}</span>}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-1">{item.title}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">{item.description}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Past Events List (Right Column) */}
          <div className="bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md p-5 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col h-[500px] lg:h-auto">
            <h2 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-4 flex items-center gap-2">
              <FaHistory className="text-neutral-400" />
              {t('ui.pastEvents')}
            </h2>
            <div className="flex-1 relative overflow-hidden">
              <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-3 pl-2 border-l-2 border-neutral-100 dark:border-neutral-700 ml-2">
                  {sortedEvents.map((event) => (
                    <div key={event.id} className="relative pl-4 group">
                      <div className="absolute left-[-14px] top-2 w-2.5 h-2.5 rounded-full bg-neutral-300 dark:bg-neutral-600 border-2 border-white dark:border-neutral-800 group-hover:bg-blue-400 transition-colors"></div>
                      <Link to={localeLink(locale, `/planner/event/${event.id % 100000}`)} className="block">
                        <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                          {((event.id / 10000) | 0) == 1 ? `[${t('common.rerun')}] ` : ''} {event.name}
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-1">
                          <FaCalendarAlt className="w-2.5 h-2.5" /> {event.openTime.toLocaleDateString()}
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-8 bg-linear-to-t from-white/60 dark:from-neutral-800/60 to-transparent pointer-events-none"></div>
            </div>
          </div>
        </div>

        {/* Data Management Panel */}
        <div className="mt-8 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <ExportImportPanel />
        </div>
      </div>
    </div>
  );
};

export default EventMainPage;
