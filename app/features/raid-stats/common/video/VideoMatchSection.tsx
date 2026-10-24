import { useEffect, useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { type VideoEntry } from './types';
import type { PortraitData, ReportStudentData } from '../../../../types/raidReport';
import { StarRating } from '~/components/student/StarRating';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { Link } from 'react-router';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';
import { useTitleDictionary, VideoTitle } from './VideoTitle';
import { VideoDescription } from './VideoDescription';
import { hasVideoPartyInfo } from './videoFilters';

const EXTERNAL_SITES = [
  { name: 'BA Torment', url: 'https://bluearchive-torment.netlify.app/video-analysis', langs: 'en · ko · zh' },
  { name: 'そうりきボーダー/souriki border', url: 'https://www.souriki-border.com/', langs: 'en · ja' },
  { name: 'きなこもち/kina_ko_m_ochi_', url: 'https://kina-ko-m-ochi.net/tlsearch/', langs: 'ja' },
];

const getYouTubeId = (url: string) => url.match(/[?&]v=([^&]+)/)?.[1] ?? null;

function parseGrade(grade: string | null): { num: number; isUE: boolean } {
  if (!grade) return { num: 0, isUE: false };
  if (grade.startsWith('ue')) return { num: Number(grade.slice(2)), isUE: true };
  const m = grade.match(/^(\d+)/);
  return { num: m ? Number(m[1]) : Number(grade), isUE: false };
}

export const VideoMatchSection: React.FC<{
  videos: VideoEntry[];
  portraitData: PortraitData;
  studentData: ReportStudentData;
}> = ({ videos, portraitData, studentData }) => {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language as Locale;
  const titleDict = useTitleDictionary(studentData, locale);
  const [showOriginalTitle, setShowOriginalTitle] = useState(false);
  const [sites, setSites] = useState(EXTERNAL_SITES);
  useEffect(() => {
    const arr = [...EXTERNAL_SITES];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setSites(arr);
  }, []);

  return (
    <div data-component-name="VideoMatchSection">
      {titleDict && (
        <label className="mb-1 flex min-h-11 sm:min-h-7 w-fit cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" className="h-4 w-4" checked={showOriginalTitle} onChange={(event) => setShowOriginalTitle(event.target.checked)} />
          {t('videos_show_original_title')}
        </label>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
        {videos
          .sort((a, b) => {
            return Number(b.score) - Number(a.score);
          })
          .map((video, idx) => {
            const ytId = getYouTubeId(video.url);
            return (
              <div key={idx} className="shrink-0 w-70 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                {/* YouTube Thumbnail (clickable) */}
                <a href={video.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
                  {ytId ? (
                    <div className="relative w-full aspect-video bg-neutral-200 dark:bg-neutral-800">
                      <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={video.title} className="w-full h-full object-cover" />
                      {video.has_tl && <span className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1 py-0.5 rounded font-bold">TL</span>}
                    </div>
                  ) : (
                    <div className="w-full aspect-video bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">No Thumbnail</div>
                  )}
                </a>

                <div className="p-2 space-y-1">
                  {/* Score + Difficulty */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {video.isReference && video.origin && (
                      <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 px-1.5 py-0.5 rounded font-mono" title={t('videos_reference_title')}>
                        {video.origin.server.toUpperCase()} {video.origin.raidId}
                      </span>
                    )}
                    <span className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded font-mono text-neutral-600 dark:text-neutral-300">{video.difficulty}</span>
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400 font-mono">{video.score?.toLocaleString() || video.score}</span>
                  </div>

                  {/* Title */}
                  <a href={video.url} target="_blank" rel="noopener noreferrer" className="block">
                    <VideoTitle title={video.title} dict={showOriginalTitle ? null : titleDict} className="line-clamp-2" />
                  </a>

                  {/* Channel */}
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate" title={video.channel_name}>
                      {video.channel_name}
                    </p>
                    <VideoDescription description={video.description} title={video.title} url={video.url} dict={titleDict} />
                  </div>

                  {/* Student grades per party */}
                  {hasVideoPartyInfo(video) && (
                    <div className="space-y-1 pt-0.5">
                      {video.parties.map((party, pIdx) => (
                        <div key={pIdx} className="flex gap-1 flex-wrap">
                          {party.map((student, sIdx) => {
                            const { num, isUE } = parseGrade(student.grade);
                            const name = studentData[student.id]?.Name ?? student.name_en;
                            return (
                              <Tooltip key={sIdx} placement="top" overlay={<span className="text-xs">{name}</span>} mouseEnterDelay={0.05}>
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className="w-10 h-10 rounded-sm overflow-hidden bg-neutral-200 dark:bg-neutral-700 shrink-0">
                                    {portraitData[student.id] ? (
                                      <img src={`data:image/webp;base64,${portraitData[student.id]}`} alt={name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full" />
                                    )}
                                  </div>

                                  {student.grade ? <StarRating n={isUE ? num + 6 : num} /> : '?'}
                                </div>
                              </Tooltip>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
      <div className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-600 leading-relaxed">
        {t('videos_missing_note')}{' '}
        <Link to={localeLink(locale, '/dashboard/jp/videos')} className="text-blue-500 dark:text-blue-400 hover:underline">
          {t('videos_view_all')}
        </Link>{' '}
        <span className="text-neutral-300 dark:text-neutral-700">·</span> {t('videos_external_sites')}
        {sites.map((site) => (
          <Fragment key={site.name}>
            {' '}
            <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline">
              {site.name}
            </a>
            <span className="text-neutral-300 dark:text-neutral-700"> ({site.langs})</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
};
