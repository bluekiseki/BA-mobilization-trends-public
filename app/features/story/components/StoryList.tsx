import { dateEra, eraAnchors, type Era } from '../logic/eras';
import { mergeByDay } from '../logic/fes';
import { timelineExtras } from '../logic/timelineExtras';
import { STORY_SCHEDULES } from '../data/schedules';
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowDownNarrowWide, LuArrowUpWideNarrow, LuFilterX, LuX } from 'react-icons/lu';
import { useSearchParams } from 'react-router';
import { readStoryFilters, splitSeriesTitle, STORY_CATEGORIES, storyQuery } from '../logic/navigation';
import type { SeriesReleases } from '../logic/releaseDates';
import { useStorySettings } from './useStorySettings';
import { noticeImages, storyImages } from '../logic/noticeImages';
import { seriesSlug } from '../logic/slugs';
import { categoryLabel, characterLabel, eraLabel, episodeRange, episodeTotal, filterSeries } from '../logic/storyIndex';
import type { StoryIndex, StoryLang } from '../logic/types';
import { storyCopy } from '../logic/uiText';
import { FesRow } from './FesRow';
import { PvRow } from './PvRow';
import { CategoryPill, NoticeImages, ReleaseLine, seriesPath, SeriesTitle, StoryLink, storyPath, storyButtonClass, storyControlClass, storyChipClass } from './StorySections';

interface StoryListProps {
  index: StoryIndex;
  lang: StoryLang;
  langQuery: string;
  releases: SeriesReleases;
  character: string | null;
}

function PartHeading({ era, lang, dated }: { era: Era | null; lang: StoryLang; dated: boolean }) {
  return (
    <li id={`part-${era ?? 'undated'}`} className="scroll-mt-20 border-l-4 border-ba-btn-blue-dark bg-neutral-200 px-3 py-3 text-base font-bold dark:bg-neutral-700">
      {eraLabel(era, lang, dated)}
    </li>
  );
}

export function StoryList({ index, lang, langQuery, releases, character }: StoryListProps) {
  const [params, setParams] = useSearchParams();
  const { settings } = useStorySettings();
  const spoilers = settings?.spoilers ?? false;
  const episodeTotals = settings?.episodeTotals ?? false;
  const { query: urlQuery, categories, sort, descending, year } = readStoryFilters(params, settings?.server);
  // Typing is kept in local state and written to the URL after a pause, so each keystroke does not navigate or rebuild the list.
  const [draft, setDraft] = useState(urlQuery);
  const query = useDeferredValue(draft);
  const t = storyCopy(lang);
  const update = (changes: Record<string, string | null>) =>
    setParams((previous) => new URLSearchParams(storyQuery(previous.toString(), { ...changes, focus: null })), { replace: true, preventScrollReset: true });
  const pushed = useRef(urlQuery);
  const composing = useRef(false);
  // Only a URL change that did not come from this input (reset, back button) may overwrite the draft; overwriting during IME composition breaks it.
  useEffect(() => {
    if (urlQuery === pushed.current) return;
    pushed.current = urlQuery;
    setDraft(urlQuery);
  }, [urlQuery]);
  useEffect(() => {
    if (draft === pushed.current) return;
    const timer = setTimeout(() => {
      if (composing.current) return;
      pushed.current = draft;
      update({ q: draft, year: null });
    }, 400);
    return () => clearTimeout(timer);
  }, [draft]);
  const reset = () => update({ q: null, category: null, year: null, character: null, order: null });
  const matches = useMemo(
    () => filterSeries(index, { category: categories, query, lang, character, sort, descending, splitParts: true, releases }),
    [index, categories, query, lang, character, sort, descending, releases],
  );
  const filtering = query.trim() !== '' || character !== null;
  // On the timeline the Fes recruitments sit between the stories, which gives the dates a sense of time.
  const extras = useMemo(() => (categories.length === 0 && !filtering ? timelineExtras(STORY_SCHEDULES, sort) : []), [categories, filtering, sort]);
  const years = [...new Set([...matches.flatMap((group) => (group.date ? [group.date.slice(0, 4)] : [])), ...extras.map((extra) => extra.date.slice(0, 4))])].sort();
  const groups = year ? matches.filter((group) => group.date?.startsWith(year)) : matches;
  const anchors = useMemo(() => eraAnchors(index, releases, sort), [index, releases, sort]);
  const items = useMemo(() => {
    const shown = (year ? extras.filter((extra) => extra.date.startsWith(year)) : extras).map((extra) => ({ date: extra.date, value: extra }));
    if (descending) shown.reverse();
    return mergeByDay(
      groups.map((group) => ({ date: group.date, value: group })),
      shown,
      descending,
    ).map((item) => (item.kind === 'first' ? { era: item.value.era, group: item.value, extra: null } : { era: dateEra(item.value.date, anchors), group: null, extra: item.value }));
  }, [groups, extras, year, descending, anchors]);
  const parts = items.reduce<{ era: Era | null; count: number }[]>((list, item) => {
    const last = list[list.length - 1];
    if (!last || last.era !== item.era) list.push({ era: item.era, count: 0 });
    if (item.group) list[list.length - 1].count += 1;
    return list;
  }, []);
  const totalEpisodes = groups.reduce((sum, group) => sum + group.stories.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
        {t.search}
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={(event) => {
            composing.current = false;
            setDraft(event.currentTarget.value);
          }}
          placeholder={t.search}
          className={`w-full ${storyControlClass}`}
        />
      </label>
      <div role="group" aria-label={t.category} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={categories.length === 0} onClick={() => update({ category: null, year: null })} className={storyChipClass(categories.length === 0)}>
          {t.timeline}
        </button>
        {STORY_CATEGORIES.map((value) => {
          const active = categories.includes(value);
          const next = STORY_CATEGORIES.filter((item) => (item === value ? !active : categories.includes(item)));
          return (
            <button key={value} type="button" aria-pressed={active} onClick={() => update({ category: next.join(',') || null, year: null })} className={storyChipClass(active)}>
              {categoryLabel(value, lang)}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
          {t.year}
          <select value={year ?? ''} onChange={(event) => update({ year: event.target.value })} className={storyControlClass}>
            <option value="">{t.allYears}</option>
            {year && !years.includes(year) && <option value={year}>{year}</option>}
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => update({ order: descending ? null : 'desc' })}
          aria-label={`${t.order}: ${descending ? t.newest : t.oldest}`}
          title={`${t.order}: ${descending ? t.newest : t.oldest}`}
          className={`${storyControlClass} inline-flex w-11 items-center justify-center px-0 hover:bg-neutral-100 dark:hover:bg-neutral-800`}
        >
          {descending ? <LuArrowUpWideNarrow size={20} /> : <LuArrowDownNarrowWide size={20} />}
        </button>
        {character && (
          <button
            type="button"
            onClick={() => update({ character: null })}
            className={`${storyButtonClass} gap-2`}
            aria-label={`${characterLabel(index, character, lang)} · ${t.clearCharacter}`}
            title={t.clearCharacter}
          >
            {characterLabel(index, character, lang)}
            <LuX size={16} />
          </button>
        )}
        {(filtering || year || categories.length > 0 || descending) && (
          <button type="button" onClick={reset} className={`${storyButtonClass} w-11 px-0`} aria-label={t.reset} title={t.reset}>
            <LuFilterX size={20} />
          </button>
        )}
      </div>
      <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
        {groups.length} {t.results} · {filtering ? `${t.matches} ` : ''}
        {totalEpisodes} {t.episodes}
      </p>
      {parts.length > 1 && (
        <nav aria-label={t.parts} className="flex flex-wrap gap-2">
          {parts.map(({ era, count }) => (
            <button key={era ?? 'undated'} type="button" onClick={() => document.getElementById(`part-${era ?? 'undated'}`)?.scrollIntoView({ block: 'start' })} className={storyChipClass(false)}>
              {eraLabel(era, lang)} <span className="text-neutral-500 dark:text-neutral-400">{count}</span>
            </button>
          ))}
        </nav>
      )}
      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t border-neutral-200 py-8 dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.noResults}</p>
          <button type="button" onClick={reset} className={storyButtonClass}>
            {t.reset}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map(({ group, extra }, at) => {
            if (!group) {
              if (!extra) return null;
              return (
                <Fragment key={extra.kind === 'fes' ? `fes-${extra.date}` : `pv-${extra.pv.id}`}>
                  {at === 0 || items[at - 1].era !== items[at].era ? <PartHeading era={items[at].era} lang={lang} dated /> : null}
                  {extra.kind === 'fes' ? <FesRow event={extra.fes} lang={lang} /> : <PvRow pv={extra.pv} lang={lang} server={sort} spoilers={spoilers} />}
                </Fragment>
              );
            }
            const slug = seriesSlug(group.id, index.series[group.id]);
            const selected = params.get('focus') === slug;
            const destinationQuery = storyQuery(langQuery, { focus: slug });
            const thumbnail = !spoilers
              ? undefined
              : group.part
                ? noticeImages(index.series[group.id].r, group.part.releases.jp?.[0]?.date)
                : storyImages(index.series[group.id].i?.slice(0, 1), releases[group.id]?.jp);
            const newPart = at === 0 || items[at - 1].era !== group.era;
            return (
              <Fragment key={group.key}>
                {newPart && <PartHeading era={group.era} lang={lang} dated={group.date !== null} />}
                <li id={group.part ? undefined : `series-${slug}`} className={`scroll-mt-20 ${selected ? 'bg-ba-btn-blue/10' : ''}`}>
                  <StoryLink
                    to={seriesPath(index, group.id, destinationQuery)}
                    className="grid gap-2 py-4 hover:bg-neutral-50 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6 dark:hover:bg-neutral-800/60"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex items-start gap-2">
                        <CategoryPill category={group.category} lang={lang} />
                        <SeriesTitle label={group.label} main={group.category === 'Main'} suffix={group.part?.label} />
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        {group.category === 'Content' ? <span /> : <ReleaseLine releases={group.part?.releases ?? releases[group.id]} lang={lang} />}
                        {episodeTotals && (
                          <span className="text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
                            {group.part ? episodeRange(group.part.episodes[0], group.part.episodes[1], lang) : episodeRange(1, episodeTotal(index, index.series[group.id], lang), lang)}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={`flex min-w-0 items-start gap-4 ${splitSeriesTitle(group.label, group.category === 'Main').context ? 'md:pt-6' : ''}`}>
                      {spoilers && group.summary && <span className="line-clamp-3 min-w-0 flex-1 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{group.summary}</span>}
                      <span className={`ml-auto w-32 shrink-0 sm:w-44 ${thumbnail?.length ? '' : 'hidden md:block'} ${spoilers ? '' : 'md:hidden'}`}>
                        <NoticeImages urls={thumbnail} size="thumb" />
                      </span>
                    </span>
                  </StoryLink>
                  {filtering && (
                    <details className="pb-3">
                      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                        {t.matches} ({group.stories.length})
                      </summary>
                      <ul className="border-l-2 border-neutral-200 pl-3 dark:border-neutral-700">
                        {group.stories.map((story) => (
                          <li key={story.id}>
                            <StoryLink to={storyPath(index, story.id, destinationQuery)} className="block min-h-11 py-3 text-sm leading-relaxed hover:underline">
                              {story.title}
                            </StoryLink>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
