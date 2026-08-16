// src/routes/EventPage.tsx
import { useState, useEffect } from 'react';
import { data, useLoaderData, useParams, type LoaderFunctionArgs } from 'react-router';
import { EventInfo } from '~/components/planner/EventInfo';
import type { EventData, EventSeason, IconData, IconInfos, StudentData, StudentPortraitData } from '~/types/plannerData';
// import iconDataInfoModule from "~/data/event/icon_info.json"
// import iconDataAllModule from "~/data/event/icon_img.json"
import { useTranslation } from 'react-i18next';

import { DEFAULT_LOCALE, getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/head';
import eventList from '~/data/jp/eventList.json';
import { getlocaleMethond } from '~/components/planner/common/locale';
import type { Route } from './+types/EventPage';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle, AppUIMatch } from '~/types/link';
import { cdn } from '~/utils/cdn';
import { EventPlannerLoader } from '~/components/planner/event/EventPlannerLoader';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { useHelpKey } from '~/utils/usePageHelp';

const fetchEventSeasonData = async (eventId: number) => {
  try {
    const eventDataModules = import.meta.glob('/app/data/event/event.season.*.json');
    const modulePath = `/app/data/event/event.season.${eventId}.json`;
    // console.log(`eventDataModules[${modulePath}] `,eventDataModules[modulePath] )
    if (!eventDataModules[modulePath]) return null;
    const eventDataModule = await eventDataModules[modulePath]();
    return eventDataModule as EventSeason;
  } catch (e) {
    console.warn('e', e);
    return null;
  }
};

export async function loader({ context, params }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const eventId = Number(params.eventId);
  const evnetSeasonData = await fetchEventSeasonData(eventId);
  if (evnetSeasonData == null) {
    throw new Response('Not Found: Invalid server parameter.', { status: 404 });
  }

  const eventEntry = eventList[String(eventId < 60000 ? eventId % 10000 : eventId) as keyof typeof eventList] ?? eventList[String(eventId % 10000) as keyof typeof eventList];
  const localeKey = getlocaleMethond('', 'Jp', locale) as 'Jp' | 'Kr' | 'En' | 'Tw';
  const localizedName = eventEntry?.[localeKey] || eventEntry?.Jp || 'No event information';
  const eventName = `${eventId > 10000 && eventId < 60000 ? `[${i18n.t('planner:common.rerun')}] ` : ''}${localizedName}`;

  return data({
    locale,
    siteTitle: i18n.t('common:title'),
    eventName,
    title: i18n.t('planner:page.eventDetailTitle', { eventName }),
    description: i18n.t('planner:page.eventDetailDescription', { eventName }),
    canonicalUrl: createLocalizedUrl(locale, `/planner/event/${eventId}`),
    evnetSeasonData,
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(`${loaderData.title} | ${loaderData.siteTitle}`, loaderData.description, '/img/p.webp', loaderData.canonicalUrl);
}

export const handle: AppHandle = {
  preload: (data, match?: AppUIMatch) => {
    const eventId = match?.params.eventId;
    const locale = (data as { locale?: Locale })?.locale || DEFAULT_LOCALE;
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/students_portrait.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...(eventId
        ? [
            {
              rel: 'canonical' as const,
              href: createLocalizedUrl(locale, `/planner/event/${eventId}`),
            },
          ]
        : []),
      ...(eventId ? createLinkHreflang(`/planner/event/${eventId}`) : []),
    ];
  },
};

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': CACHE_CONTROL_CONFIG,
    };
}

export const EventPage = () => {
  const { eventId: eventIdStr } = useParams<{ eventId: string }>(); // Extract event ID from URL
  const { evnetSeasonData } = useLoaderData<typeof loader>();
  const eventId = Number(eventIdStr);
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [iconData, setIconData] = useState<IconData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Student-related state
  const [allStudents, setAllStudents] = useState<StudentData>({});
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});

  const { t, i18n } = useTranslation('planner');
  // const { t: t_c } = useTranslation("common");
  const locale = i18n.language as Locale;

  useHelpKey('planner.event', !([854].includes(eventId) || parseInt(String(eventId / 10000)) == 6));

  //  dynamic loading useEffect
  useEffect(() => {
    if (!eventId) {
      setError(t('error.eventDataDisplayFailed'));
      setIsLoading(false);
      return;
    }

    const fetchEventData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // const eventDataModules = import.meta.glob('/app/data/event/event.*.json');
        // const modulePath = `/app/data/event/event.${eventId}.json`;
        // const eventDataModule: any = await eventDataModules[modulePath]()
        const eventDataModule: EventData = await (await fetch(cdn(`/ew/event.${eventId}.json`))).json();

        // const eventDataModule = (await import(/* @vite-ignore */ `/app/data/event/event.${eventId}.json`)).default;
        // const iconDataInfoModule = (await import(`~/data/event/icon_info.json`)).default;
        const iconDataInfoModule: Partial<IconInfos> = await (await fetch(cdn('/ew/icon_info.json'))).json();
        for (const key in iconDataInfoModule) {
          const k = key as keyof IconInfos;
          Object.assign(eventDataModule.icons, {
            [k]: { ...eventDataModule.icons[k], ...iconDataInfoModule[k] },
          });
        }
        setEventData(eventDataModule);

        const data = eventDataModule;
        const initialPrio: Record<number, 'include' | 'exclude' | 'priority'> = {};
        // Use the stage.stage array inside event.json
        data?.stage?.stage?.forEach((s: { Name: string; Id: number }) => {
          // Parse number part from stage name (e.g., 'Stage01' -> 1)
          const stageNumMatch = s.Name.match(/(\d+)$/);
          if (stageNumMatch) {
            const num = parseInt(stageNumMatch[1], 10);
            if (num >= 1 && num <= 8) {
              initialPrio[s.Id] = 'exclude';
            }
          }
        });
      } catch (e) {
        console.error(`${t('error.eventDataDisplayFailed')} (ID: ${eventId})`, e);
        setError(`${t('error.eventDataDisplayFailed')} (ID: ${eventId})`);
      }
    };

    const fetchIconData = async () => {
      try {
        // Use the path format provided by the user
        /*
        const iconModules = import.meta.glob('/app/data/event/icon_img.*.json');
        const modulePath = `/app/data/event/icon_img.${eventId}.json`;
        const iconDataModule: any = await iconModules[modulePath]()
        */
        const iconDataModule: IconData = await (await fetch(cdn(`/ew/icon_img.${eventId}.json`))).json();
        const iconDataAllModule: IconData = await (await fetch(cdn(`/ew/icon_img.json`))).json();
        const ext: IconData = {
          Item: {},
          Equipment: {},
        };
        for (const key in iconDataModule) {
          ext[key] = {
            ...iconDataModule[key],
            ...iconDataAllModule[key],
          };
        }
        setIconData(ext);
      } catch (e) {
        console.error('Failed to fetch icon data:', e);
        setError((prev) => prev || `Failed to fetch icon data (ID: ${eventId})`);
      }
    };

    const fetchStudentData = async () => {
      try {
        const [studentRes, portraitRes] = await Promise.all([fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)), fetch(cdn('/w/students_portrait.json'))]);
        setAllStudents(await studentRes.json());
        setStudentPortraits(await portraitRes.json());
      } catch (e) {
        console.error(t('error.studentDataLoadFailed'), e);
        setError(t('error.studentDataLoadFailed'));
      }
    };

    void Promise.all([fetchEventData(), fetchStudentData(), fetchIconData()]).finally(() => setIsLoading(false));

    // Reset all related states when the event changes
    // setShopResult(null)
    // setTreasureResult(null);
    // setBoxGachaResult(null);
    // setCustomGameResult(null);
  }, [eventId]);

  // --- [Style Definitions] ---
  const containerBase = 'min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 transition-colors duration-300';

  return (
    <div className={containerBase}>
      {/* 1. Global Header (Event Info) */}
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          {evnetSeasonData && (
            <EventInfo
              name={evnetSeasonData.Name}
              eventId={eventId || 0}
              startTime={evnetSeasonData.EventContentOpenTime}
              endTime={evnetSeasonData.EventContentCloseTime || evnetSeasonData.ExtensionTime}
              eventContentTypeStr={evnetSeasonData.EventContentTypeStr}
            />
          )}
        </div>
      </div>

      <EventPlannerLoader isLoading={isLoading} error={error} eventId={eventId} eventData={eventData} iconData={iconData} allStudents={allStudents} studentPortraits={studentPortraits} />
    </div>
  );
};

export default EventPage;
