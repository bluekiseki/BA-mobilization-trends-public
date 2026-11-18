// src/routes/EventPage.tsx
import { useState, useEffect } from 'react';
import { data, useLoaderData, useParams, type LoaderFunctionArgs } from 'react-router';
import { EventInfo } from '~/components/common/EventInfo';
import type { EventData, EventSeason, IconData, IconInfos, StudentData } from '~/types/plannerData';
// import iconDataInfoModule from "~/data/event/icon_info.json"
// import iconDataAllModule from "~/data/event/icon_img.json"
import { useTranslation } from 'react-i18next';

import { DEFAULT_LOCALE, getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/shell/head';
import eventList from '~/data/jp/eventList.json';
import { getPlannerEventName, isRerunEvent } from '~/utils/eventList';
import type { Route } from './+types/EventPage';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle, AppUIMatch } from '~/types/link';
import { cdn } from '~/utils/cdn';
import { EventPlannerLoader } from '~/features/event-planner/components/EventPlannerLoader';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { studentSheetPreloadLinks } from '~/utils/iconSheet';

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

  const localizedName = getPlannerEventName(eventList, eventId, locale, 'No event information');
  const eventName = `${isRerunEvent(eventId) ? `[${i18n.t('game:rerun')}] ` : ''}${localizedName}`;

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
      ...studentSheetPreloadLinks(),
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...['/ew/icon_info.json', '/ew/icon_img.json', ...(eventId ? [`/ew/event.${eventId}.json`, `/ew/icon_img.${eventId}.json`] : [])].map((path) => ({
        rel: 'preload' as const,
        href: cdn(path),
        as: 'fetch' as const,
        crossOrigin: 'anonymous' as const,
      })),
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

  const { t, i18n } = useTranslation('planner');
  // const { t: t_c } = useTranslation("common");
  const locale = i18n.language as Locale;

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
        const [eventDataModule, iconDataInfoModule] = await Promise.all([
          fetch(cdn(`/ew/event.${eventId}.json`)).then((response) => response.json<EventData>()),
          fetch(cdn('/ew/icon_info.json')).then((response) => response.json<Partial<IconInfos>>()),
        ]);
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
        const [iconDataModule, iconDataAllModule] = await Promise.all([
          fetch(cdn(`/ew/icon_img.${eventId}.json`)).then((response) => response.json<IconData>()),
          fetch(cdn('/ew/icon_img.json')).then((response) => response.json<IconData>()),
        ]);
        const ext: IconData = {
          Item: {},
          Equipment: {},
        };
        for (const key of new Set([...Object.keys(iconDataModule), ...Object.keys(iconDataAllModule)])) {
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
        const studentRes = await fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`));
        setAllStudents(await studentRes.json());
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

      <EventPlannerLoader isLoading={isLoading} error={error} eventId={eventId} eventData={eventData} iconData={iconData} allStudents={allStudents} />
    </div>
  );
};

export default EventPage;
