import React, { useEffect, useRef, useState } from 'react';
import type { VideoEntry, VideoStudent } from './types';
import type { PortraitData, ReportStudentData } from '../../../../types/raidReport';
import type { GameServer, RaidInfo } from '~/types/data';
import { useTranslation } from 'react-i18next';
import { StarRating } from '~/components/student/StarRating';
import { HiOutlineFunnel } from 'react-icons/hi2';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { useStudentFilterSearch } from '../../dashboard/useStudentFilterSearch';
import { FilterModal } from '~/components/common/FilterModal';
import { VideoQuickControls, VideoAdvancedFilters } from './VideoFilterControls';
import { createVideoFilters, getActiveVideoFilterCount, hasVideoPartyInfo, matchesVideoFilters, matchesVideoScore, type VideoFilterState, type VideoSort } from './videoFilters';
import type { Locale } from '~/utils/i18n/config';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { formatTimeToTimestamp } from '~/utils/time';
import { InfiniteScrollList } from '~/components/common/InfiniteScrollList';
import { VideoStatsPanel } from './VideoStatsPanel';
import type { TitleDictionary } from './titleTranslation';
import { useTitleDictionary, VideoTitle } from './VideoTitle';
import { VideoDescription } from './VideoDescription';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';
import { getVideoUploadTiming, type RaidPeriod } from './videoUploadTiming';
import { useMergedVideos } from './useMergedVideos';
import { matchesScope, type VideoScope } from './videoMerge';

export const VideoPageView: React.FC<{
  raidInfo: RaidInfo;
  server: GameServer;
  portraitData: PortraitData;
  studentData: ReportStudentData;
  isGrandAssault: boolean;
  activeTab: string;
}> = ({ raidInfo, server, portraitData, studentData, isGrandAssault, activeTab }) => {
  const raidPeriod = React.useMemo(() => {
    const id = `${raidInfo.Id.startsWith('E') ? 'eraid' : 'raid'}-${raidInfo.Id.slice(1)}`;
    return loadScheduleDataV2({ server, tracksToLoad: ['raid'] }).tracks.raid?.find((item) => item.id === id);
  }, [server, raidInfo.Id]);
  const { t } = useTranslation(['dashboard', 'mypage']);
  const referencePeriod = React.useCallback(
    (id: string): RaidPeriod | undefined =>
      loadScheduleDataV2({ server: 'jp', tracksToLoad: ['raid'] }).tracks.raid?.find((item) => item.id === `${id.startsWith('E') ? 'eraid' : 'raid'}-${id.slice(1)}`),
    [],
  );

  const { t: t_ui } = useTranslation('ui');
  const { i18n } = useTranslation('common');
  const locale = i18n.language as Locale;
  const merged = useMergedVideos(server, raidInfo.Id);
  const videoData = merged.loaded ? merged.videos : null;
  const loading = !merged.done;
  const [scope, setScope] = useState<VideoScope>('all');
  const [storedFilters, setFilters] = useState<VideoFilterState>(createVideoFilters);
  const filters = React.useMemo(() => (isGrandAssault ? storedFilters : { ...storedFilters, targetTypeOnly: false }), [storedFilters, isGrandAssault]);
  const [sortBy, setSortBy] = useState<VideoSort>('score_desc');
  const resultsRef = useRef<HTMLDivElement>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showOriginalTitle, setShowOriginalTitle] = useState(false);
  const titleDict = useTitleDictionary(studentData, locale);

  const videoStudentCounts = React.useMemo(() => {
    if (!videoData) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const v of videoData) {
      const seen = new Set<number>();
      for (const party of v.parties) {
        for (const s of party) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            map.set(s.id, (map.get(s.id) ?? 0) + 1);
          }
        }
      }
    }
    return map;
  }, [videoData]);

  const { studentNames, searchFn } = useStudentFilterSearch(studentData, locale, videoStudentCounts);
  const updateFilters = (patch: Partial<VideoFilterState>) => setFilters((current) => ({ ...current, ...patch }));
  const resetFilters = () => setFilters(createVideoFilters());
  const closeMobileFilters = () => setMobileFiltersOpen(false);
  const closeAndShowResults = () => {
    closeMobileFilters();
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: 'start' }));
  };

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const closeOnDesktop = () => {
      if (media.matches) setMobileFiltersOpen(false);
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  // Apply score bounds after the remaining filters.
  const videosBeforeScoreFilter = React.useMemo(
    () => (videoData ?? []).filter((video) => matchesScope(video, scope) && matchesVideoFilters(video, filters, activeTab)),
    [videoData, scope, filters, activeTab],
  );
  const filteredVideos = React.useMemo(() => videosBeforeScoreFilter.filter((video) => matchesVideoScore(video, filters)), [videosBeforeScoreFilter, filters]);

  // JP reference videos are never part of this season's statistics.
  const statsVideos = React.useMemo(() => filteredVideos.filter((video) => !video.isReference), [filteredVideos]);

  const sortedVideos = React.useMemo(() => {
    return [...filteredVideos].sort((a, b) => {
      if (sortBy === 'score_desc') return Number(b.score) - Number(a.score);
      if (sortBy === 'score_asc') return Number(a.score) - Number(b.score);
      if (sortBy === 'upload_desc') return (b.timestamp || 0) - (a.timestamp || 0);
      // upload_asc
      return (a.timestamp || Number.MAX_VALUE) - (b.timestamp || Number.MAX_VALUE);
    });
  }, [filteredVideos, sortBy]);

  const difficulties = React.useMemo(() => {
    if (!videoData) return ['All'];
    const set = new Set<string>();
    for (const v of videoData) {
      set.add(v.difficulty);
    }
    const order = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];
    const sorted = Array.from(set).sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      return order.indexOf(a) - order.indexOf(b);
    });
    return ['All', ...sorted];
  }, [videoData]);

  const activeFilterCount = getActiveVideoFilterCount(filters);
  const advancedProps = { filters, isGrandAssault, onChange: updateFilters, studentNames, searchFn, portraitData, usageCounts: videoStudentCounts };
  const quickProps = { difficulty: filters.difficulty, sortBy, difficulties, onDifficultyChange: (difficulty: string) => updateFilters({ difficulty }), onSortChange: setSortBy };

  if (isGrandAssault && activeTab === 'All') {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-neutral-600 dark:text-neutral-300">{t('videos_select_boss')}</p>
        </div>
      </div>
    );
  }

  if (!loading && (!videoData || videoData.length === 0)) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-lg text-neutral-400">{t('videos_empty')}</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 text-sm">
      <div className="sticky top-14 z-10 bg-neutral-50 py-2 dark:bg-neutral-900 sm:hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 max-[359px]:grid-cols-[minmax(0,1fr)_auto]">
          <VideoQuickControls {...quickProps} />
          <button
            type="button"
            aria-label={t_ui('filter')}
            title={t_ui('filter')}
            aria-haspopup="dialog"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen(true)}
            className="relative flex h-11 w-11 items-center justify-center bg-ba-btn-gray text-neutral-950 max-[359px]:col-start-2 max-[359px]:row-start-1"
          >
            <HiOutlineFunnel className="h-5 w-5" aria-hidden="true" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ba-btn-blue text-[10px] font-semibold">{activeFilterCount}</span>
            )}
          </button>
        </div>
      </div>
      <div className="hidden space-y-2 border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800 sm:sticky sm:top-14 sm:z-10 sm:block">
        <VideoAdvancedFilters {...advancedProps} quickControls={<VideoQuickControls {...quickProps} />} />
      </div>
      <FilterModal
        open={mobileFiltersOpen}
        onClose={closeMobileFilters}
        title={t_ui('filter')}
        onReset={resetFilters}
        resetDisabled={activeFilterCount === 0}
        resetLabel={t_ui('resetAll')}
        doneLabel={t('videos_view_results', { count: filteredVideos.length })}
        onDone={closeAndShowResults}
        fitVisualViewport
      >
        <VideoAdvancedFilters {...advancedProps} resultsPresentation="inline" quickControls={<VideoQuickControls {...quickProps} />} />
      </FilterModal>
      <div ref={resultsRef} className="scroll-mt-44 space-y-2 sm:scroll-mt-64">
        <div className="flex flex-wrap items-center justify-between gap-2 text-neutral-600 dark:text-neutral-300">
          <span aria-live="polite">
            {filteredVideos.length} / {videoData?.length ?? 0}
          </span>
          {merged.referenceRaidId && (
            <div role="group" aria-label={t('videos_scope_label')} className="flex items-center gap-1">
              {(['all', 'current', 'reference'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                  className={`min-h-11 px-3 sm:min-h-7 ${scope === value ? 'bg-ba-btn-blue text-neutral-950' : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'}`}
                >
                  {value === 'reference' ? t('videos_scope_reference', { raid: `JP ${merged.referenceRaidId}` }) : t(`videos_scope_${value}`)}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button type="button" onClick={resetFilters} className="min-h-11 sm:min-h-7 px-2">
                {t_ui('resetAll')}
              </button>
            )}
            {titleDict && (
              <label className="flex min-h-11 sm:min-h-7 cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={showOriginalTitle} onChange={(event) => setShowOriginalTitle(event.target.checked)} />
                {t('videos_show_original_title')}
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Stats panel */}
      {statsVideos.length > 0 && <VideoStatsPanel videos={statsVideos} portraitData={portraitData} studentData={studentData} raidInfo={raidInfo} server={server} />}

      {/* Video Grid */}
      <>
        {loading && !videoData ? (
          <div className="py-10 text-sm text-neutral-400 dark:text-neutral-500">Loading</div>
        ) : sortedVideos.length > 0 ? (
          <InfiniteScrollList
            items={sortedVideos}
            as="div"
            scrollRoot="viewport"
            rootMargin="1200px 0px"
            pageSize={24}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0 sm:gap-4 divide-y divide-neutral-200 dark:divide-neutral-800 sm:divide-y-0"
            sentinelClassName="col-span-full h-4"
            renderItem={(video) => (
              <VideoCard
                key={video.url}
                video={video}
                portraitData={portraitData}
                studentData={studentData}
                locale={locale}
                raidPeriod={video.isReference && video.origin ? referencePeriod(video.origin.raidId) : raidPeriod}
                raidInfo={raidInfo}
                server={server}
                titleDict={showOriginalTitle ? null : titleDict}
                descriptionDict={titleDict}
              />
            )}
          />
        ) : (
          <div className="space-y-2 py-12 text-center text-neutral-500 dark:text-neutral-400">
            <p>{t_ui('noResults')}</p>
            <button type="button" onClick={resetFilters} className="min-h-11 bg-ba-btn-gray px-4 text-neutral-950">
              {t_ui('resetAll')}
            </button>
          </div>
        )}
      </>
    </div>
  );
};

const VideoCard: React.FC<{
  video: VideoEntry;
  portraitData: PortraitData;
  studentData: ReportStudentData;
  locale: Locale;
  raidPeriod?: RaidPeriod;
  raidInfo: RaidInfo;
  server: GameServer;
  titleDict: TitleDictionary | null;
  descriptionDict: TitleDictionary | null;
}> = ({ video, portraitData, studentData, locale, raidPeriod, raidInfo, server, titleDict, descriptionDict }) => {
  const { t } = useTranslation('dashboard');
  const clearTime = React.useMemo(() => {
    if (typeof video.score !== 'number') return null;
    // Score-to-time conversion follows the season the video was played in (JP reference videos use the JP season).
    const seconds = calculateTimeFromScore(video.score, raidInfo.Boss, video.origin?.server ?? server, video.origin?.raidId ?? raidInfo.Id);
    return seconds !== undefined && seconds >= 0 ? formatTimeToTimestamp(seconds) : null;
  }, [video.score, video.origin, raidInfo.Boss, raidInfo.Id, server]);

  const uploadDateTime = React.useMemo(() => {
    if (!video.timestamp) return '';

    const date = new Date(video.timestamp * 1000);
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }, [locale, video.timestamp]);

  const getYouTubeId = (url: string) => url.match(/[?&]v=([^&]+)/)?.[1] ?? null;

  const uploadTiming = getVideoUploadTiming(video.timestamp, raidPeriod);
  const raidDayLabel = uploadTiming === 'before' ? t('videos_before_raid') : uploadTiming === 'after' ? t('videos_after_raid') : uploadTiming !== null ? `Day ${uploadTiming}` : null;

  function parseGrade(grade: string | null): { num: number; isUE: boolean } {
    if (!grade) return { num: 0, isUE: false };
    if (grade.startsWith('ue')) return { num: Number(grade.slice(2)), isUE: true };
    const m = grade.match(/^(\d+)/);
    return { num: m ? Number(m[1]) : Number(grade), isUE: false };
  }

  const ytId = getYouTubeId(video.url);

  const renderStudent = (student: VideoStudent, sIdx: number) => {
    const { num, isUE } = parseGrade(student.grade);
    const name = studentData[student.id]?.Name ?? student.name_en;
    return (
      <Tooltip key={sIdx} placement="top" overlay={<span className="text-xs">{name}</span>} mouseEnterDelay={0.05}>
        <div className="flex w-11 sm:w-10 flex-col items-center">
          <div className="aspect-square w-full rounded-sm overflow-hidden bg-neutral-200 dark:bg-neutral-700">
            {portraitData[student.id] && <img src={`data:image/webp;base64,${portraitData[student.id]}`} alt={name} className="w-full h-full object-cover" />}
          </div>
          {student.grade ? <StarRating n={isUE ? num + 6 : num} /> : <span className="text-[8px] text-neutral-400">?</span>}
        </div>
      </Tooltip>
    );
  };

  // Left-aligned; wraps if party recognition returns more than a row's worth of students.
  const partyGrades = (
    <>
      {video.extraction_method && (
        <span
          title={`Party data source: ${video.extraction_method}`}
          className="self-start text-[9px] px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 font-mono"
        >
          {video.extraction_method}
        </span>
      )}
      {video.parties.map((party, pIdx) => (
        <div key={pIdx} className="flex flex-wrap items-start gap-0.5">
          {party.map(renderStudent)}
        </div>
      ))}
    </>
  );

  return (
    // Mobile: a flat list row (the grid supplies the divider). Desktop: a card in the grid.
    <div className="flex flex-col h-full py-3 sm:py-0 sm:bg-neutral-50 sm:dark:bg-neutral-900 sm:border sm:border-neutral-200 sm:dark:border-neutral-700 sm:rounded-lg sm:overflow-hidden">
      <div className="flex gap-2.5 sm:block sm:gap-0">
        {/* YouTube Thumbnail */}
        <a href={video.url} target="_blank" rel="noopener noreferrer" aria-label={video.title} className="block w-36 shrink-0 self-start sm:w-full hover:opacity-90 transition-opacity">
          {ytId ? (
            <div className="relative w-full aspect-video bg-neutral-200 dark:bg-neutral-800">
              <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
              {video.has_tl && <span className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1 py-0.5 rounded font-bold">TL</span>}
              {raidDayLabel && <span className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded font-mono">{raidDayLabel}</span>}
            </div>
          ) : (
            <div className="w-full aspect-video bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">No Thumbnail</div>
          )}
        </a>

        <div className="min-w-0 flex-1 flex flex-col gap-1 sm:p-3">
          {/* Score + Difficulty + Upload Date */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {video.isReference && video.origin && (
              <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 px-1.5 py-0.5 rounded font-mono" title={t('videos_reference_title')}>
                {video.origin.server.toUpperCase()} {video.origin.raidId}
              </span>
            )}
            {video.remoteCandidate && <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded">{t('videos_candidate')}</span>}
            {video.basicAnalysis && (
              <span className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-600 dark:text-neutral-300" title={t('videos_basic_analysis_title')}>
                {t('videos_basic_analysis')}
              </span>
            )}
            <span className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded font-mono text-neutral-600 dark:text-neutral-300">{video.difficulty}</span>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">{video.score?.toLocaleString()}</span>
            {clearTime && <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">@{clearTime}</span>}
            {uploadDateTime && <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{uploadDateTime}</span>}
          </div>

          {/* Title */}
          <a href={video.url} target="_blank" rel="noopener noreferrer" className="block sm:flex-1">
            <VideoTitle title={video.title} dict={titleDict} className="line-clamp-2 sm:line-clamp-3" />
          </a>

          {/* Channel */}
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate" title={video.channel_name}>
              {video.channel_name}
            </p>
            <VideoDescription description={video.description} title={video.title} url={video.url} dict={descriptionDict} />
          </div>
        </div>
      </div>

      {/* Student grades — full-width strip (mobile: below thumbnail; desktop: pinned to card bottom) */}
      {hasVideoPartyInfo(video) && <div className="flex flex-col gap-1.5 mt-2 sm:mt-auto sm:px-3 sm:pb-3 sm:pt-2 sm:border-t sm:border-neutral-200 sm:dark:border-neutral-700">{partyGrades}</div>}
    </div>
  );
};
