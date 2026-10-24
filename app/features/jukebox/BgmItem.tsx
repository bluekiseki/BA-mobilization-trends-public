import { useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayIcon, SoundWaveIcon } from '~/features/jukebox/jukeboxMetadata';
import RubyText from '~/components/common/RubyText';
import { FiChevronDown, FiExternalLink } from 'react-icons/fi';

// --- TYPE DEFINITIONS ---
export type Language = 'en' | 'jp' | 'ko' | 'tw';
interface LocalizedName {
  ja?: string | string[] | null;
  ko?: string | string[] | null;
  en?: string | string[] | null;
  tw?: string | string[] | null;
}
interface LocalizedObj {
  ja?: string | string[] | null;
  jp?: string | string[] | null;
  ko?: string | string[] | null;
  en?: string | string[] | null;
  tw?: string | string[] | null;
  Name?: string | null;
}
export interface XrefEntry {
  type: string;
  title?: string | number | null;
  name?: LocalizedObj;
  episode?: string | number | null;
}
export interface BgmEntry {
  id: string;
  title?: string;
  composer?: string;
  youtube_url?: string;
  xref: XrefEntry[];
}
export interface YTPlayer {
  seekTo: (seconds: number) => void;
  playVideo: () => void;
}
// --- HELPER FUNCTIONS ---
export const getLocalizedText = (obj: LocalizedObj | null | undefined, lang: Language, fallbackKey: keyof LocalizedName = 'ja'): string => {
  const val = obj?.[lang] || obj?.[fallbackKey] || obj?.Name || '';
  return Array.isArray(val) ? (val[0] ?? '') : val;
};
export const getLocalizedTextArr = (obj: LocalizedObj | null | undefined, lang: Language, fallbackKey: keyof LocalizedName = 'ja'): string | string[] =>
  obj?.[lang] || obj?.[fallbackKey] || obj?.Name || '';
// --- BGM LIST ITEM (memoized to prevent re-renders on unrelated state changes) ---
export const BgmItem = memo(function BgmItem({
  bgm,
  isExpanded,
  isPlaying,
  hasAnyActiveFilter,
  isXrefMatchingActive,
  renderXrefLine,
  onSelect,
  onToggleDetails,
}: {
  bgm: BgmEntry;
  isExpanded: boolean;
  isPlaying: boolean;
  hasAnyActiveFilter: boolean;
  isXrefMatchingActive: (xref: XrefEntry) => boolean;
  renderXrefLine: (xref: XrefEntry, bgm: BgmEntry) => string;
  onSelect: (bgm: BgmEntry) => void;
  onToggleDetails: (id: string) => void;
}) {
  const { t } = useTranslation('jukebox');

  const matchingXrefs = useMemo(() => (hasAnyActiveFilter ? bgm.xref.filter(isXrefMatchingActive) : []), [hasAnyActiveFilter, bgm.xref, isXrefMatchingActive]);

  return (
    <div
      id={`bgm-item-${bgm.id}`}
      className={`scroll-mt-24 md:scroll-mt-16 px-4 py-3 transition-colors duration-150 ${isPlaying ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/30'}`}
    >
      <div className={`flex items-center gap-3 ${bgm.youtube_url ? 'cursor-pointer' : ''}`} onClick={() => bgm.youtube_url && onSelect(bgm)}>
        <span className={`font-mono text-base font-bold w-10 shrink-0 tabular-nums ${isPlaying ? 'text-sky-500 dark:text-sky-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
          {Number(bgm.id) < 10000 ? bgm.id : 'N/A'}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight ${isPlaying ? 'text-sky-700 dark:text-sky-300' : 'text-neutral-800 dark:text-neutral-100'}`}>{bgm.title || `BGM #${bgm.id}`}</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">{bgm.composer}</p>
        </div>
        {bgm.youtube_url ? (
          <div className={`shrink-0 ${isPlaying ? 'text-sky-500 dark:text-sky-400' : 'text-neutral-300 dark:text-neutral-600'}`}>{isPlaying ? <SoundWaveIcon /> : <PlayIcon />}</div>
        ) : (
          Number(bgm.id) < 10000 && (
            <a
              href={`https://bluearchive.wiki/wiki/Music#track${bgm.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={t('actions.view_on_wiki')}
              className="shrink-0 text-neutral-300 dark:text-neutral-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <FiExternalLink className="w-7 h-7" />
            </a>
          )
        )}
      </div>

      {matchingXrefs.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleDetails(bgm.id);
          }}
          className="mt-2 w-full text-left group"
        >
          <div className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors">
            <FiChevronDown className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            <span className="font-medium">
              {matchingXrefs.length} {isExpanded ? t('actions.hide_details') : t('actions.view_details')}
            </span>
          </div>
          {isExpanded && (
            <ul className="mt-1.5 ml-3.5 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
              {matchingXrefs.map((x, i) => (
                <li key={i} className="flex items-baseline gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <span className="shrink-0 text-neutral-300 dark:text-neutral-600">·</span>
                  <RubyText>{renderXrefLine(x, bgm)}</RubyText>
                </li>
              ))}
            </ul>
          )}
        </button>
      )}
    </div>
  );
});
