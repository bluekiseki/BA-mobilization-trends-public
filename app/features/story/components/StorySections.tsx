import { useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeLink } from '~/utils/localeLink';
import { SheetIcon } from '~/components/common/SheetIcon';
import { collapseSameDate, SERVER_LABELS, SERVERS, type Release, type SeriesReleases } from '../logic/releaseDates';
import { archiveImageUrl } from '~/utils/archiveImage';
import { seriesSlug } from '../logic/slugs';
import { categoryLabel, characterLabel } from '../logic/storyIndex';
import type { StoryIndex, StoryLang } from '../logic/types';
import { splitSeriesTitle, storyQuery } from '../logic/navigation';
import { storyCopy } from '../logic/uiText';

export const storyControlClass =
  'min-h-11 min-w-0 rounded border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba-btn-blue-dark dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';
export const storyChipClass = (active: boolean) =>
  `min-h-11 rounded px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba-btn-blue-dark ${active ? 'bg-ba-btn-blue text-neutral-900' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'}`;
export const storyButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded bg-ba-btn-gray px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba-btn-blue-dark';

// Link inside the site that keeps the language prefix of the current page.
export function StoryLink({ to, className = '', ...props }: Omit<ComponentProps<typeof Link>, 'to'> & { to: string }) {
  const { i18n } = useTranslation();
  return <Link {...props} className={`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba-btn-blue-dark ${className}`} to={localeLink(i18n.language, to)} />;
}

// Pill in front of a series name (semantic colors only).
export const CATEGORY_TINTS: Record<string, string> = {
  Main: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Event: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Group: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Fes: 'bg-ba-btn-blue text-neutral-900', // the in-game blue, like the Fes badge of the calendar
  PV: 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900', // inverted, so it stands apart from the colored story types
};
const DEFAULT_TINT = 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';

export function CategoryPill({ category, lang = 'en' }: { category: string; lang?: StoryLang }) {
  return <span className={`inline-flex shrink-0 self-start rounded px-2 py-1 text-xs font-medium leading-none ${CATEGORY_TINTS[category] ?? DEFAULT_TINT}`}>{categoryLabel(category, lang)}</span>;
}

// Official announcement images. All are shown at one 16:9 size: a small one in lists, a larger one on detail pages.
const IMAGE_SIZES = { thumb: 'w-32 sm:w-44', detail: 'w-full max-w-sm' };

// Shows the archived copy of an image and falls back to the original address when the archive does not have it.
function ArchivedImage({ url, className }: { url: string; className: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setFailed(false);
    archiveImageUrl(url).then(
      (archived) => current && setSrc(archived),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [url]);
  if (!src && !failed) return <div className={className} />;
  return <img src={failed || !src ? url : src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={className} />;
}

export function NoticeImages({ urls, size = 'detail' }: { urls: string[] | undefined; size?: keyof typeof IMAGE_SIZES }) {
  if (!urls?.length) return null;
  return (
    <div className="flex flex-wrap justify-end gap-3">
      {urls.map((url) => (
        <ArchivedImage key={url} url={url} className={`${IMAGE_SIZES[size]} aspect-video bg-neutral-100 object-cover dark:bg-neutral-800`} />
      ))}
    </div>
  );
}

// First release on each server, one line, for list rows.
export function ReleaseLine({ releases, lang }: { releases: SeriesReleases[string] | undefined; lang: StoryLang }) {
  const t = storyCopy(lang);
  const shown = SERVERS.flatMap((server) => {
    const first = releases?.[server]?.[0];
    return first ? [{ server, text: `${first.date.slice(0, 10)}${first.estimated ? ` (${t.estimated})` : ''}` }] : [];
  });
  if (shown.length === 0) return <span className="text-xs text-neutral-500 dark:text-neutral-400">{t.noDate}</span>;
  return (
    <span className="flex flex-wrap gap-x-4 text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
      {shown.map(({ server, text }) => (
        <span key={server}>
          <span className="text-neutral-500 dark:text-neutral-400">{SERVER_LABELS[server]}</span> {text}
        </span>
      ))}
    </span>
  );
}

// `suffix` (the part of a series released in steps) stays on the line of the title it belongs to.
export function SeriesTitle({ label, main, large = false, suffix }: { label: string; main: boolean; large?: boolean; suffix?: string | null }) {
  const { context, title } = splitSeriesTitle(label, main);
  return (
    <span className="flex min-w-0 flex-col gap-1 break-words">
      {context && <span className="text-xs font-normal leading-relaxed text-neutral-600 dark:text-neutral-400">{context}</span>}
      <span className={`${large ? 'text-2xl leading-snug' : 'text-sm'} font-semibold leading-relaxed`}>
        {title}
        {suffix && <span className="ml-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">{suffix}</span>}
      </span>
    </span>
  );
}

export function seriesPath(index: StoryIndex, seriesId: string, langQuery: string): string {
  const slug = seriesSlug(seriesId, index.series[seriesId]);
  const query = storyQuery(langQuery, { focus: new URLSearchParams(langQuery).get('focus') ?? slug });
  return `/utils/story/${encodeURIComponent(slug)}${query}`;
}

export function storyPath(index: StoryIndex, storyId: string, langQuery: string): string {
  const seriesId = index.stories[storyId]?.s ?? '';
  const slug = seriesSlug(seriesId, index.series[seriesId]);
  const query = storyQuery(langQuery, { focus: new URLSearchParams(langQuery).get('focus') ?? slug });
  return `/utils/story/${encodeURIComponent(slug)}/${storyId}${query}`;
}

export function characterPath(key: string, langQuery: string): string {
  return `/utils/story${storyQuery(langQuery, { character: key, category: null, q: null, year: null, focus: null })}`;
}

function formatRelease(release: Release, lang: StoryLang): string {
  return `${release.date}${release.estimated ? ` (${storyCopy(lang).estimated})` : ''}${release.label ? ` - ${release.label}` : ''}`;
}

interface ReleaseDatesProps {
  releases: SeriesReleases[string] | undefined;
  own?: Partial<Record<(typeof SERVERS)[number], Release | null>>;
  compact?: boolean; // first release only, with the number of further steps (the episode list shows each step)
  lang?: StoryLang;
}

// Dates on each server; a story that belongs to one step of its series shows only that step.
export function ReleaseDates({ releases, own, compact, lang = 'en' }: ReleaseDatesProps) {
  // Nothing is shown for a series that is not released on a day (content explanations).
  if (SERVERS.every((server) => !releases?.[server]?.length)) return null;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {SERVERS.map((server) => {
        const steps = collapseSameDate(releases?.[server] ?? []);
        const shown = own?.[server] ? [own[server]] : compact ? steps.slice(0, 1) : steps;
        return (
          <div key={server} className="contents">
            <dt className="text-neutral-500">{SERVER_LABELS[server]}</dt>
            <dd className="flex flex-col">
              {shown.length === 0 ? (
                <span className="text-neutral-400">-</span>
              ) : (
                shown.map(
                  (release) =>
                    release && (
                      <span key={release.date}>
                        {formatRelease(release, lang)}
                        {compact && steps.length > 1 ? ` (+${steps.length - 1} ${storyCopy(lang).more})` : ''}
                      </span>
                    ),
                )
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{title}</h2>
      {children}
    </div>
  );
}

export function BgmList({ keys, index }: { keys: string[]; index: StoryIndex }) {
  const tracks = keys.flatMap((key) => (index.bgm[key] ? [{ key, track: index.bgm[key] }] : []));
  if (tracks.length === 0) return null;
  return (
    <Section title="BGM">
      <ul className="flex flex-col gap-0.5 text-sm">
        {tracks.map(({ key, track }) => {
          const label = `${track.t}${track.v ? ` (${track.v})` : ''}${track.c ? ` - ${track.c}` : ''}`;
          // Tracks of the jukebox are numbered like their theme (Theme_16 -> 16); only those it knows get a link.
          const jukeboxId = track.y ? /^Theme_0*(\d+)/.exec(key)?.[1] : undefined;
          return (
            <li key={key} className="min-w-0 truncate" title={label}>
              {jukeboxId ? (
                <StoryLink to={`/utils/jukebox?bgm=${jukeboxId}`} className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
                  {label}
                </StoryLink>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function CharacterChips({ keys, index, lang, langQuery }: { keys: string[]; index: StoryIndex; lang: StoryLang; langQuery: string }) {
  if (keys.length === 0) return null;
  const chips = (items: string[]) =>
    items.map((key) => (
      <StoryLink
        key={key}
        to={characterPath(key, langQuery)}
        className="inline-flex min-h-11 items-center rounded border border-neutral-300 px-2.5 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        title={storyCopy(lang).characterStories}
      >
        <span className="flex items-center gap-1">
          {index.cs[key] && (
            <span className="size-4 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800">
              <SheetIcon sheet="student" id={index.cs[key]} alt="" className="size-4 rounded-full" />
            </span>
          )}
          {characterLabel(index, key, lang)}
        </span>
      </StoryLink>
    ));
  return (
    <Section title={storyCopy(lang).characters}>
      <div className="flex flex-wrap gap-2">{chips(keys.slice(0, 8))}</div>
      {keys.length > 8 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-neutral-600 dark:text-neutral-400">
            {storyCopy(lang).showCharacters} ({keys.length})
          </summary>
          <div className="flex flex-wrap gap-2">{chips(keys.slice(8))}</div>
        </details>
      )}
    </Section>
  );
}
