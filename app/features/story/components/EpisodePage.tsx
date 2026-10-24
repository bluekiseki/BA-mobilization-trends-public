import { useParams } from 'react-router';
import { noticeImages } from '../logic/noticeImages';
import { ownRelease, SERVERS } from '../logic/releaseDates';
import { seriesIdBySlug } from '../logic/slugs';
import { neighbours, pickText, seriesLabel, storyTitle } from '../logic/storyIndex';
import { BgmList, CategoryPill, NoticeImages, Section, StoryLink, CharacterChips, ReleaseDates, seriesPath, storyPath, storyButtonClass } from './StorySections';
import { StoryShell } from './StoryShell';
import { useStoryIndex, useStoryLang } from './useStoryIndex';
import { storyListPath } from '../logic/navigation';
import { useStorySettings } from './useStorySettings';
import { storyCopy } from '../logic/uiText';
import { RelationGraphSection } from './RelationGraph';

export function EpisodePage() {
  const { series: slug = '', story: storyId = '' } = useParams();
  const { index, releases, error } = useStoryIndex();
  const { lang, setLang, query } = useStoryLang();
  const t = storyCopy(lang);
  const spoilers = useStorySettings().settings?.spoilers ?? false;
  const seriesId = index ? seriesIdBySlug(index, decodeURIComponent(slug)) : null;
  const story = index?.stories[storyId];
  const series = index && seriesId ? index.series[seriesId] : undefined;
  const found = index && seriesId && series && story && story.s === seriesId;

  return (
    <StoryShell lang={lang} onLang={setLang} langQuery={query} error={error} loading={!index}>
      {found ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-neutral-600 dark:text-neutral-400">
            <StoryLink to={storyListPath(query)} className="flex min-h-11 items-center underline">
              {t.back}
            </StoryLink>
            <span>/</span>
            <StoryLink to={seriesPath(index, seriesId, query)} className="flex min-h-11 min-w-0 items-center underline">
              {seriesLabel(seriesId, series, lang)}
            </StoryLink>
          </div>
          <div className="flex flex-col items-start gap-2">
            <CategoryPill category={series.c} lang={lang} />
            <h2 className="text-lg font-bold">{storyTitle(storyId, story, lang)}</h2>
          </div>

          {spoilers && !story.p && pickText(story.m, lang) && <p className="whitespace-pre-line text-sm leading-relaxed">{pickText(story.m, lang)}</p>}

          {story.p && (
            <ol className="flex flex-col divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {story.p.map((part, i) => (
                <li key={i} className="flex flex-col gap-1 py-3">
                  <p className="text-sm font-semibold">
                    {i + 1}. {pickText(part.t, lang)}
                  </p>
                  {spoilers && part.m && <p className="whitespace-pre-line text-sm text-neutral-600 dark:text-neutral-300">{pickText(part.m, lang)}</p>}
                </li>
              ))}
            </ol>
          )}

          <NoticeImages urls={spoilers ? noticeImages(series.r, ownRelease(releases[seriesId]?.jp ?? [], series.stories.indexOf(storyId))?.date ?? releases[seriesId]?.jp?.[0]?.date) : undefined} />

          <CharacterChips keys={story.c ?? []} index={index} lang={lang} langQuery={query} />

          <nav aria-label={t.backSeries} className="grid gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-2 dark:border-neutral-800">
            {(['prev', 'next'] as const).map((direction) => {
              const target = neighbours(index, storyId)[direction];
              const label = direction === 'prev' ? t.previousEpisode : t.nextEpisode;
              return target ? (
                <StoryLink key={direction} to={storyPath(index, target, query)} className={`${storyButtonClass} flex-col items-start gap-1`}>
                  <span className="text-xs">{label}</span>
                  <span className="text-left leading-relaxed">{storyTitle(target, index.stories[target], lang)}</span>
                </StoryLink>
              ) : (
                <span key={direction} aria-disabled="true" className={`${storyButtonClass} opacity-40`}>
                  {label}
                </span>
              );
            })}
            <StoryLink to={seriesPath(index, seriesId, query)} className="flex min-h-11 items-center justify-center text-sm underline sm:col-span-2">
              {t.backSeries}
            </StoryLink>
          </nav>
          {!neighbours(index, storyId).next && <RelationGraphSection index={index} seriesId={seriesId} lang={lang} langQuery={query} />}
          <Section title={t.release}>
            <ReleaseDates
              lang={lang}
              releases={releases[seriesId]}
              own={Object.fromEntries(SERVERS.map((server) => [server, ownRelease(releases[seriesId]?.[server] ?? [], series.stories.indexOf(storyId))]))}
            />
          </Section>
          <BgmList keys={story.b ?? []} index={index} />
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-neutral-500">{t.notFound}</p>
      )}
    </StoryShell>
  );
}
