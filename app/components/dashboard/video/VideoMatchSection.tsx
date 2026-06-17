import { useEffect, useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { type VideoEntry } from './types';
import type { PortraitData } from '../common';
import { StarRating } from '~/components/StarRating';
import { Link } from 'react-router';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';

const EXTERNAL_SITES = [
  { name: 'BA Torment', url: 'https://bluearchive-torment.netlify.app/video-analysis', langs: 'en · ko · zh' },
  { name: 'そうりきボーダー/souriki border', url: 'https://www.souriki-border.com/', langs: 'en · ja' },
  { name: 'きなこもち/kina_ko_m_ochi_', url: 'https://kina-ko-m-ochi.net/tlsearch/', langs: 'ja' },
];

const getYouTubeId = (url: string) => url.match(/[?&]v=([^&]+)/)?.[1] ?? null;

function parseGrade(grade: string): { num: number; isUE: boolean } {
  if (grade.startsWith('ue')) return { num: Number(grade.slice(2)), isUE: true };
  const m = grade.match(/^(\d+)/);
  return { num: m ? Number(m[1]) : Number(grade), isUE: false };
}

export const VideoMatchSection: React.FC<{
  videos: VideoEntry[];
  portraitData: PortraitData;
}> = ({ videos, portraitData }) => {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language as Locale;
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
                      <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded font-mono">▶</span>
                      {video.has_tl && <span className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1 py-0.5 rounded font-bold">TL</span>}
                    </div>
                  ) : (
                    <div className="w-full aspect-video bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">No Thumbnail</div>
                  )}
                </a>

                <div className="p-2 space-y-1">
                  {/* Score + Difficulty */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded font-mono text-neutral-600 dark:text-neutral-300">{video.difficulty}</span>
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400 font-mono">{video.score?.toLocaleString() || video.score}</span>
                  </div>

                  {/* Title */}
                  <a href={video.url} target="_blank" rel="noopener noreferrer" className="block">
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 line-clamp-2 leading-tight hover:underline">{video.title}</p>
                  </a>

                  {/* Channel */}
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{video.channel_name}</p>

                  {/* Student grades per party */}
                  <div className="space-y-1 pt-0.5">
                    {video.parties.map((party, pIdx) => (
                      <div key={pIdx} className="flex gap-1 flex-wrap">
                        {party.map((student, sIdx) => {
                          const { num, isUE } = parseGrade(student.grade);
                          return (
                            <div key={sIdx} className="flex flex-col items-center gap-0.5">
                              <div className="w-10 h-10 rounded-sm overflow-hidden bg-neutral-200 dark:bg-neutral-700 shrink-0">
                                {portraitData[student.id] ? (
                                  <img src={`data:image/webp;base64,${portraitData[student.id]}`} alt={student.name_en} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full" />
                                )}
                              </div>

                              {student.grade ? <StarRating n={isUE ? num + 6 : num} /> : '?'}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
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
