import React, { useCallback, useEffect, useState } from 'react';
import type { VideoEntry } from './types';
import type { PortraitData, StudentData } from '../common';
import type { GameServer, RaidInfo } from '~/types/data';
import { cdn } from '~/utils/cdn';
import { useTranslation } from 'react-i18next';
import { StarRating } from '~/components/StarRating';
import { StudentFilterBar } from '../teamDetail/compositionChart';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import type { Locale } from '~/utils/i18n/config';

// Map raid armor types to video boss types
const raidTypeToVideoType: Record<string, string> = {
  LightArmor: 'Explosion',
  HeavyArmor: 'Pierce',
  Unarmed: 'Mystic',
  ElasticArmor: 'Sonic',
  CompositeArmor: 'Chemical',
};

export const VideoPageView: React.FC<{
  raidInfo: RaidInfo;
  server: GameServer;
  portraitData: PortraitData;
  studentData: StudentData;
  isGrandAssault: boolean;
  activeTab: string;
}> = ({ raidInfo, server, portraitData, studentData, isGrandAssault, activeTab }) => {
  const { t } = useTranslation('dashboard');
  const { t: t_c, i18n } = useTranslation('common');
  const locale = i18n.language as Locale;
  const matcher = useSearchMatcher(locale);
  const [videoData, setVideoData] = useState<VideoEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');
  const [tlOnlyFilter, setTlOnlyFilter] = useState(false);
  const [targetTypeOnly, setTargetTypeOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'score' | 'upload_asc' | 'upload_desc'>('score');
  const [studentFilter, setStudentFilter] = useState<{ excludeIds: number[]; includeIds: number[] }>({ excludeIds: [], includeIds: [] });

  useEffect(() => {
    setLoading(true);
    setVideoData(null);
    fetch(cdn(`/video/raid-${server}-${raidInfo.Id}.json`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setVideoData(data as VideoEntry[]);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  }, [server, raidInfo.Id]);

  const studentNames = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const [id, s] of Object.entries(studentData)) map.set(Number(id), s.Name);
    return map;
  }, [studentData]);

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

  const searchFn = useCallback(
    (query: string, excludedIds: Set<number>): Array<[number, string]> => {
      const entries = Object.entries(studentData).filter(([id]) => !excludedIds.has(Number(id)));
      const filtered = query.trim() ? entries.filter(([, s]) => matcher(s.Name, query) || s.SearchTags.some((tag) => matcher(tag, query))) : entries;
      return filtered
        .sort(([a], [b]) => (videoStudentCounts.get(Number(b)) ?? 0) - (videoStudentCounts.get(Number(a)) ?? 0))
        .slice(0, 50)
        .map(([id, s]) => [Number(id), s.Name]);
    },
    [studentData, matcher, videoStudentCounts],
  );

  const filteredVideos = React.useMemo(() => {
    if (!videoData) return [];

    return videoData.filter((video) => {
      if (difficultyFilter !== 'All' && video.difficulty !== difficultyFilter) return false;
      if (tlOnlyFilter && !video.has_tl) return false;
      if (targetTypeOnly && !video.is_target_type) return false;

      // Convert raid type to video type and check if video contains it
      if (activeTab !== 'All') {
        const videoType = raidTypeToVideoType[activeTab];
        if (!videoType || !video.boss_types.includes(videoType)) return false;
      }

      const { excludeIds, includeIds } = studentFilter;
      if (excludeIds.length > 0 || includeIds.length > 0) {
        const allIds = new Set(video.parties.flat().map((s) => s.id));
        if (excludeIds.some((id) => allIds.has(id))) return false;
        if (includeIds.some((id) => !allIds.has(id))) return false;
      }

      return true;
    });
  }, [videoData, difficultyFilter, tlOnlyFilter, activeTab, targetTypeOnly, studentFilter]);

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

  if (isGrandAssault && activeTab === 'All') {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-neutral-600 dark:text-neutral-300">{t('videos_select_boss')}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-lg text-neutral-400">{t_c('loading_txt')}</div>
      </div>
    );
  }

  if (!videoData || videoData.length === 0) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-lg text-neutral-400">{t('videos_empty')}</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Filter Bar */}
      <div className="sticky top-0 z-10 text-sm space-y-3 bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Difficulty Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="difficulty-filter" className="text-neutral-600 dark:text-neutral-300 text-sm font-medium">
              {t('searchYouTube.difficulty')}:
            </label>
            <select
              id="difficulty-filter"
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm rounded transition-colors"
            >
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2">
            <label htmlFor="sort-filter" className="text-neutral-600 dark:text-neutral-300 text-sm font-medium">
              Sort:
            </label>
            <select
              id="sort-filter"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'score' | 'upload_asc' | 'upload_desc')}
              className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm rounded transition-colors"
            >
              <option value="score">Score (High to Low)</option>
              <option value="upload_desc">Upload Date (Newest)</option>
              <option value="upload_asc">Upload Date (Oldest)</option>
            </select>
          </div>

          {/* TL Only Filter */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={tlOnlyFilter} onChange={(e) => setTlOnlyFilter(e.target.checked)} className="w-4 h-4" />
            <span className="text-neutral-600 dark:text-neutral-300 text-sm">{t('videos_filter_tl')}</span>
          </label>

          {/* Target Type Only Filter */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={targetTypeOnly} onChange={(e) => setTargetTypeOnly(e.target.checked)} className="w-4 h-4" />
            <span className="text-neutral-600 dark:text-neutral-300 text-sm">{t('videos_filter_target_type')}</span>
          </label>
        </div>

        {/* Student Include/Exclude Filter */}
        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <StudentFilterBar
            filter={studentFilter}
            onChange={setStudentFilter}
            studentNames={studentNames}
            portraitData={portraitData}
            searchFn={searchFn}
            usageCounts={videoStudentCounts}
            filteredCount={filteredVideos.length}
            totalCount={videoData.length}
          />
        </div>

        {/* Results Count */}
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {filteredVideos.length} of {videoData.length} videos
        </div>
      </div>

      {/* Video Grid */}
      <div className="px-4">
        {filteredVideos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredVideos
              .sort((a, b) => {
                if (sortBy === 'score') {
                  return Number(b.score) - Number(a.score);
                } else if (sortBy === 'upload_desc') {
                  const aTime = a.timestamp || 0;
                  const bTime = b.timestamp || 0;
                  return bTime - aTime;
                } else {
                  // upload_asc
                  const aTime = a.timestamp || Number.MAX_VALUE;
                  const bTime = b.timestamp || Number.MAX_VALUE;
                  return aTime - bTime;
                }
              })
              .map((video, idx) => (
                <VideoCard key={idx} video={video} portraitData={portraitData} />
              ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-neutral-400">{t('videos_empty')}</div>
        )}
      </div>
    </div>
  );
};

const VideoCard: React.FC<{
  video: VideoEntry;
  portraitData: PortraitData;
}> = ({ video, portraitData }) => {
  const [uploadDateTime, setUploadDateTime] = useState<string>('');

  const getYouTubeId = (url: string) => url.match(/[?&]v=([^&]+)/)?.[1] ?? null;

  function parseGrade(grade: string): { num: number; isUE: boolean } {
    if (grade.startsWith('ue')) return { num: Number(grade.slice(2)), isUE: true };
    const m = grade.match(/^(\d+)/);
    return { num: m ? Number(m[1]) : Number(grade), isUE: false };
  }

  useEffect(() => {
    if (video.timestamp) {
      const date = new Date(video.timestamp * 1000);
      const formatted = date.toLocaleString();
      setUploadDateTime(formatted);
    }
  }, [video.timestamp]);

  const ytId = getYouTubeId(video.url);

  return (
    <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
      {/* YouTube Thumbnail */}
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
        {ytId ? (
          <div className="relative w-full aspect-video bg-neutral-200 dark:bg-neutral-800">
            <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={video.title} className="w-full h-full object-cover" />
            <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded font-mono">▶</span>
            {video.has_tl && <span className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1 py-0.5 rounded font-bold">TL</span>}
          </div>
        ) : (
          <div className="w-full aspect-video bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">No Thumbnail</div>
        )}
      </a>

      <div className="p-3 space-y-2 flex-1 flex flex-col">
        {/* Score + Difficulty + Upload Date */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded font-mono text-neutral-600 dark:text-neutral-300">{video.difficulty}</span>
          <span className="text-xs font-bold text-teal-600 dark:text-teal-400 font-mono">{video.score?.toLocaleString()}</span>
          {uploadDateTime && <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{uploadDateTime}</span>}
        </div>

        {/* Title */}
        <a href={video.url} target="_blank" rel="noopener noreferrer" className="block flex-1">
          <p className="text-[11px] text-neutral-600 dark:text-neutral-300 line-clamp-3 leading-tight hover:underline">{video.title}</p>
        </a>

        {/* Channel */}
        <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{video.channel_name}</p>

        {/* Student grades */}
        <div className="space-y-1 pt-1 border-t border-neutral-200 dark:border-neutral-700">
          {video.extraction_method && (
            <span
              title={`Party data source: ${video.extraction_method}`}
              className="inline-block text-[9px] px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 font-mono"
            >
              {video.extraction_method}
            </span>
          )}
          {video.parties.map((party, pIdx) => (
            <div key={pIdx} className="flex gap-1 flex-wrap">
              {party.map((student, sIdx) => {
                const { num, isUE } = parseGrade(student.grade);
                return (
                  <div key={sIdx} className="flex flex-col items-center gap-0.5">
                    <div className="w-8 h-8 rounded-sm overflow-hidden bg-neutral-200 dark:bg-neutral-700 shrink-0">
                      {portraitData[student.id] ? (
                        <img src={`data:image/webp;base64,${portraitData[student.id]}`} alt={student.name_en} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full" />
                      )}
                    </div>
                    {student.grade ? <StarRating n={isUE ? num + 6 : num} /> : <span className="text-[8px]">?</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
