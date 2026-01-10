// src/routes/EventPage.tsx
import { useState, useEffect } from 'react';
import { data, useLoaderData, useParams, type LoaderFunctionArgs } from 'react-router';
import { EventInfo } from '~/components/planner/EventInfo';
import type { EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';
// import iconDataInfoModule from "~/data/event/icon_info.json"
// import iconDataAllModule from "~/data/event/icon_img.json"
import { useTranslation } from 'react-i18next';

import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { loader as rootLorder } from "~/root";
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import eventList from "~/data/jp/eventList.json";
import { getlocaleMethond } from '~/components/planner/common/locale';
import type { Route } from './+types/EventPage';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle } from '~/types/link';
import { cdn } from '~/utils/cdn';
import { EventPlannerLoader } from '~/components/planner/event/EventPlannerLoader';

const fetchEventSeasonData = async (eventId: number) => {
  try {
    const eventDataModules = import.meta.glob('/app/data/event/event.season.*.json');
    const modulePath = `/app/data/event/event.season.${eventId}.json`;
    const eventDataModule: any = await eventDataModules[modulePath]()

    return (eventDataModule);
  } catch (e) {
    console.log('e',e)
    return null
  }
};

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  let i18n = getInstance(context);
  const locale = i18n.language as Locale
  const evnetSeasonData = await fetchEventSeasonData(Number(params.eventId))
  if (evnetSeasonData == null) {
    throw new Response("Not Found: Invalid server parameter.", { status: 404 });
  }
  return data({
    locale,
    siteTitle: i18n.t("home:title"),
    // title: i18n.t("dashboardIndex:title"),
    description: i18n.t("planner:page.plannerescription"),
    rerun: i18n.t("planner:common.rerun"),
    evnetSeasonData: await fetchEventSeasonData(Number(params.eventId))
  })
}

export function meta({ loaderData, params }: Route.MetaArgs) {

  const { eventId: eventIdStr } = params
  const eventId = Number(eventIdStr)
  const locale_key = getlocaleMethond('', 'Jp', loaderData.locale) as 'Jp' | 'Kr' | 'En'
  const format_name = (eventId > 10000 ? `[${loaderData.rerun}] ` : '') + ((eventList[String(eventId % 10000) as keyof typeof eventList][locale_key]) || (eventList[String(eventId % 10000) as keyof typeof eventList]['Jp']) || name || 'No event information');


  return createMetaDescriptor(
    format_name + ' | ' + loaderData.siteTitle,
    loaderData.description,
    "/img/p.webp"
  )
}

export const handle: AppHandle = {
  preload: (data) => {
    const { eventId } = useLoaderData<typeof rootLorder>().params
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(data?.locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/students_portrait.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/planner/event/${eventId}`)
    ]
  }
}

export const EventPage = () => {
  const { eventId: eventIdStr } = useParams<{ eventId: string }>(); // Extract event ID from URL
  const { evnetSeasonData } = useLoaderData<typeof loader>()
  const eventId = Number(eventIdStr)
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [iconData, setIconData] = useState<IconData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Student-related state
  const [allStudents, setAllStudents] = useState<StudentData>({});
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});


  // const currencyStatusRef = useRef<HTMLDivElement | null>(null);

  // const [isMainCurrencyStatusVisible, setIsMainCurrencyStatusVisible] = useState(true);

  const { t, i18n } = useTranslation("planner");
  // const { t: t_c } = useTranslation("common");
  const locale = i18n.language as Locale


  // useEffect(() => {
  //   const observer = new IntersectionObserver(
  //     ([entry]) => {
  //       setIsMainCurrencyStatusVisible(entry.isIntersecting);
  //     },
  //     { threshold: 0.1 } // Considered visible even if only 10% is showing
  //   );

  //   const currentRef = currencyStatusRef.current;
  //   if (currentRef) {
  //     observer.observe(currentRef);
  //   }

  //   return () => {
  //     if (currentRef) {
  //       observer.unobserve(currentRef);
  //     }
  //   };
  // }, [currencyStatusRef.current]);





  //  dynamic loading useEffect
  useEffect(() => {
    if (!eventId) {
      setError(t('error.eventDataDisplayFailed'));
      setIsLoading(false);
      return;
    };

    const fetchEventData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // const eventDataModules = import.meta.glob('/app/data/event/event.*.json');
        // const modulePath = `/app/data/event/event.${eventId}.json`;
        // const eventDataModule: any = await eventDataModules[modulePath]()
        const eventDataModule = await((await fetch(cdn(`/ew/event.${eventId}.json`))).json()) as any;

        // const eventDataModule = (await import(/* @vite-ignore */ `/app/data/event/event.${eventId}.json`)).default;
        // const iconDataInfoModule = (await import(`~/data/event/icon_info.json`)).default;
        const iconDataInfoModule = await((await fetch(cdn('/ew/icon_info.json'))).json()) as any;
        for (const key in iconDataInfoModule) {
          eventDataModule.icons[key] = {
            ...eventDataModule.icons[key],
            ...iconDataInfoModule[key as keyof typeof iconDataInfoModule],
          }
        }
        setEventData(eventDataModule);

        const data = eventDataModule
        const initialPrio: Record<number, 'include' | 'exclude' | 'priority'> = {};
        // Use the stage.stage array inside event.json
        data.stage.stage.forEach((s: { Name: string; Id: number; }) => {
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
        const iconDataModule = await (await fetch(cdn(`/ew/icon_img.${eventId}.json`))).json() as any
        const iconDataAllModule = await ((await fetch(cdn(`/ew/icon_img.json`))).json()) as any
        let ext = {
          Item: {},
          Equipment: {},
        }
        for (const key in iconDataModule) {
          const baseData = iconDataAllModule[key as keyof typeof iconDataAllModule] as any || {};

          ext[key as keyof typeof ext] = {
            ...iconDataModule[key],
            ...baseData,

          }
        }
        console.log('ext',ext)
        setIconData(ext);
      } catch (e) {
        console.error("Failed to fetch icon data:", e);
        setError(prev => prev || `Failed to fetch icon data (ID: ${eventId})`);
      }
    };


    const fetchStudentData = async () => {
      try {
        const [studentRes, portraitRes] = await Promise.all([
          fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)),
          fetch(cdn('/w/students_portrait.json'))
        ]);
        setAllStudents(await studentRes.json());
        setStudentPortraits(await portraitRes.json());
      } catch (e) {
        console.error(t('error.studentDataLoadFailed'), e);
        setError(t('error.studentDataLoadFailed'));
      }
    };

    Promise.all([fetchEventData(), fetchStudentData(), fetchIconData()]).finally(() => setIsLoading(false));

    // Reset all related states when the event changes
    // setShopResult(null)
    // setTreasureResult(null);
    // setBoxGachaResult(null);
    // setCustomGameResult(null);


  }, [eventId]);




  // --- [Style Definitions] ---
  const containerBase = "min-h-screen bg-gray-50 dark:bg-neutral-900 text-gray-800 dark:text-gray-200 transition-colors duration-300";

  return (
    <div className={containerBase}>
      {/* 1. Global Header (Event Info) */}
      <div className="bg-white dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <EventInfo
            name={evnetSeasonData.Name}
            eventId={Number(eventId) || 0}
            startTime={evnetSeasonData.EventContentOpenTime}
            endTime={evnetSeasonData.EventContentCloseTime || evnetSeasonData.ExtensionTime}
            eventContentTypeStr={evnetSeasonData.EventContentTypeStr}
          />
        </div>
      </div>

      <EventPlannerLoader isLoading={isLoading} error={error} eventId={eventId} eventData={eventData} iconData={iconData} allStudents={allStudents} studentPortraits={studentPortraits} />

    </div>
  );

};

export default EventPage;
