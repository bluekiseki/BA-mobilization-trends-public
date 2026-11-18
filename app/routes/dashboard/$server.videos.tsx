import { useEffect, useState, useMemo } from 'react';
import { data, type LoaderFunctionArgs, useLoaderData, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { GameServer, RaidInfo, Student } from '~/types/data';
import { GAMESERVER_LIST } from '~/types/data';
import { loadRaidInfos } from '~/utils/loadRaidInfo';
import type { ReportStudentData } from '~/types/raidReport';
import { cdn } from '~/utils/cdn';
import { VideoPageView } from '~/features/raid-stats/common/video/VideoPageView';
import { getScheduledRaidInfo } from '~/data/liveRaid';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { HiOutlineChevronLeft } from 'react-icons/hi2';
import { type_translation, typecolor } from '~/components/raid/raidToString';
import { useDataCacheJson } from '~/hooks/useDataCacheJson';
import { getInstance } from '~/middleware/i18next';
import { createMetaDescriptor } from '~/components/shell/head';
import type { Route } from './+types/$server.videos';
import { formatLocations } from '~/utils/raidLocation';
import { studentSheetPreloadLinks } from '~/utils/iconSheet';
import type { AppHandle } from '~/types/link';

export function loader({ context, params }: LoaderFunctionArgs) {
  const { server } = params;
  if (!server || !GAMESERVER_LIST.includes(server as GameServer)) {
    throw new Response('Not Found', { status: 404 });
  }
  const i18n = getInstance(context);
  return data({
    title: i18n.t('ui:clearVideos'),
    siteTitle: i18n.t('common:title'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(`${loaderData.title} | ${loaderData.siteTitle}`, loaderData.title, '/img/3.webp');
}

export default function RaidVideosPage() {
  const { server } = useParams<{ server: string }>();
  const { title } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;

  const [searchParams, setSearchParams] = useSearchParams();
  const [studentData, setStudentData] = useState<ReportStudentData>({});
  const [loading, setLoading] = useState(true);
  const fetchStudents = useDataCacheJson<Record<string, Student>>();

  // Get all raids (announced + past) sorted by date descending
  // Keep all Type variations for Grand Assault, but deduplicate by Id for sorting reference
  const allRaids = useMemo(() => {
    const allData = loadRaidInfos(server as GameServer, locale);
    const scheduledData = getScheduledRaidInfo(locale, server as GameServer);

    // Finalized entries take precedence over schedule metadata.
    const merged: RaidInfo[] = [...allData, ...scheduledData];

    // Dedupe by Id+Type so a raid still tracked in scheduledData after its official data has
    // landed doesn't produce duplicate boss-type entries.
    const seenIdType = new Set<string>();
    const deduped = merged.filter((raid) => {
      const key = `${raid.Id}::${raid.Type ?? ''}`;
      if (seenIdType.has(key)) return false;
      seenIdType.add(key);
      return true;
    });

    // Sort by date descending (most recent first) - this groups same Id raids together
    deduped.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());

    return deduped;
  }, [server, locale]);

  // Get unique raid IDs for dropdown display (only first of each Id)
  const uniqueRaidIds = useMemo(() => {
    const seen = new Set<string>();
    return allRaids.filter((raid) => {
      if (seen.has(raid.Id)) return false;
      seen.add(raid.Id);
      return true;
    });
  }, [allRaids]);

  const requestedId = searchParams.get('raid');
  const selectedId = uniqueRaidIds.some((raid) => raid.Id === requestedId) ? requestedId : null;

  // Get raid info for selected id (from allRaids which includes live + past)
  const raidInfo = useMemo(() => {
    if (!selectedId) return null;
    const raids = allRaids.filter((r) => r.Id === selectedId);
    return raids?.[0];
  }, [selectedId, allRaids]);

  const raidInfos = useMemo(() => {
    if (!selectedId) return [];
    return allRaids.filter((r) => r.Id === selectedId);
  }, [selectedId, allRaids]);

  const isGrandAssault = raidInfos[0]?.Id.startsWith('E');
  const requestedType = searchParams.get('type');
  const selectedType = isGrandAssault && raidInfos.some((raid) => raid.Type === requestedType) ? requestedType : null;

  const updateSelection = (raid: string | null, type: string | null) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (raid) next.set('raid', raid);
        else next.delete('raid');
        if (type) next.set('type', type);
        else next.delete('type');
        return next;
      },
      { preventScrollReset: true },
    );
  };

  useEffect(() => {
    setLoading(true);
    fetchStudents(cdn(`/w/v2/${getLocaleShortName(locale)}.students.bin`))
      .then((studentJson) => {
        if (studentJson) setStudentData(studentJson);
      })
      .catch((err: unknown) => {
        console.error('Failed to load student data:', err);
      })
      .finally(() => setLoading(false));
  }, [locale]);

  return (
    <div className="py-4 px-4 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-6">
          <a href={`/dashboard/${server}`} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors">
            <HiOutlineChevronLeft className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          </a>
          <h1 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">{title} (Experimental)</h1>
        </div>

        {/* Raid Selector */}
        <div className="flex flex-col gap-3">
          <label htmlFor="raid-select" className="text-sm ios-compact-14 font-semibold text-neutral-700 dark:text-neutral-200">
            Select Raid:
          </label>
          <select
            id="raid-select"
            value={selectedId || ''}
            onChange={(e) => {
              updateSelection(e.target.value || null, null);
            }}
            className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 rounded-lg text-sm"
          >
            <option value="">-- Select a Raid --</option>
            {uniqueRaidIds.map((raid) => (
              <option key={raid.Id} value={raid.Id}>
                {raid.Boss} ({formatLocations(raid.Location)}) - {raid.Id} {raid.Date && `(${new Date(raid.Date).toLocaleDateString()})`}
              </option>
            ))}
          </select>
        </div>

        {/* Boss Type Selector (Grand Assault only) */}
        {selectedId && isGrandAssault && (
          <div className="mt-4 flex flex-wrap gap-2">
            {raidInfos.map((r) => {
              const typeColor = r.Type ? typecolor[r.Type] : undefined;
              const typeLabel = r.Type ? (type_translation[r.Type as keyof typeof type_translation]?.[getLocaleShortName(locale)] ?? r.Type) : r.Type;
              const isSelected = selectedType === r.Type;
              return (
                <button
                  key={r.Type}
                  onClick={() => updateSelection(selectedId, isSelected ? null : r.Type || null)}
                  aria-pressed={isSelected}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isSelected ? 'text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                  }`}
                  style={isSelected && typeColor ? { backgroundColor: typeColor } : undefined}
                >
                  {typeLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ul className="text-xs text-neutral-400 dark:text-neutral-500 mb-4 space-y-1 list-disc list-inside">
        <li>{t('videos_missing_note')}</li>
        <li>{t('video_extraction_note')}</li>
      </ul>
      <hr className="my-4" />

      {/* Content */}
      {!selectedId ? (
        <div className="text-center py-12 text-neutral-400">
          <p>{t('videos_select_boss')}</p>
        </div>
      ) : loading ? (
        <div className="min-h-[50vh] flex justify-center items-center text-2xl cursor-progress">{t_ui('loading')}</div>
      ) : raidInfo ? (
        <VideoPageView key={`${server}:${selectedId}`} raidInfo={raidInfo} server={server as GameServer} studentData={studentData} isGrandAssault={isGrandAssault} activeTab={selectedType || 'All'} />
      ) : (
        <div className="text-center py-12 text-neutral-400">{t_ui('loading')}</div>
      )}
    </div>
  );
}

export const handle: AppHandle = {
  preload: () => studentSheetPreloadLinks(),
};
