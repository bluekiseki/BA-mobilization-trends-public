import { useParams } from 'react-router';
import { noticeImages } from '../logic/noticeImages';
import { ownRelease, SERVERS } from '../logic/releaseDates';
import { seriesIdBySlug } from '../logic/slugs';
import { episodeRange, episodeSlot, episodeTotal, neighbours, pickText, seriesLabel, storyTitle } from '../logic/storyIndex';
import { BgmList, CategoryPill, NoticeImages, Section, StoryLink, CharacterChips, ReleaseDates, seriesPath, storyPath } from './StorySections';
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
  const { settings } = useStorySettings();
  const spoilers = settings?.spoilers ?? false;
  const episodeTotals = settings?.episodeTotals ?? false;
  const seriesId = index ? seriesIdBySlug(index, decodeURIComponent(slug)) : null;
  const story = index?.stories[storyId];
  const series = index && seriesId ? index.series[seriesId] : undefined;
  const position = series ? series.stories.indexOf(storyId) : -1;
  const slot = index && series ? episodeSlot(index, series, storyId, lang) : null;
  const found = index && seriesId && series && story && story.s === seriesId;

  return (
    <StoryShell lang={lang} onLang={setLang} langQuery={query} error={error} loading={!index} detail>
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
            <span className="flex items-center gap-2">
              <CategoryPill category={series.c} lang={lang} />
              <span className="text-sm font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
                {slot !== null && episodeRange(slot, slot, lang)}
                {slot !== null && episodeTotals && <span className="font-normal text-neutral-500 dark:text-neutral-400"> / {episodeTotal(index, series, lang)}</span>}
              </span>
            </span>
            <h1 className="text-2xl font-bold leading-snug">{storyTitle(storyId, story, lang)}</h1>
          </div>

          {spoilers && !story.p && pickText(story.m, lang) && (
            <p className="whitespace-pre-line text-sm font-normal leading-relaxed text-neutral-600 dark:text-neutral-300">{pickText(story.m, lang)}</p>
          )}

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

          <NoticeImages urls={spoilers ? noticeImages(series.r, ownRelease(releases[seriesId]?.jp ?? [], position)?.date ?? releases[seriesId]?.jp?.[0]?.date) : undefined} />

          <CharacterChips keys={story.c ?? []} index={index} lang={lang} langQuery={query} />

          <nav aria-label={t.backSeries} className="flex flex-col gap-1 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <div className="flex flex-wrap justify-between gap-x-6">
              {(['prev', 'next'] as const).map((direction) => {
                const target = neighbours(index, storyId)[direction];
                const label = direction === 'prev' ? t.previousEpisode : t.nextEpisode;
                const targetSlot = target ? episodeSlot(index, series, target, lang) : null;
                return target ? (
                  <StoryLink
                    key={direction}
                    to={storyPath(index, target, query)}
                    className={`flex min-h-11 min-w-0 flex-col justify-center text-sm ${direction === 'next' ? 'ml-auto items-end text-right' : ''}`}
                  >
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {label}
                      {targetSlot !== null && ` · ${episodeRange(targetSlot, targetSlot, lang)}`}
                    </span>
                    <span className="leading-relaxed text-neutral-700 underline dark:text-neutral-300">{storyTitle(target, index.stories[target], lang)}</span>
                  </StoryLink>
                ) : null;
              })}
            </div>
            <StoryLink to={seriesPath(index, seriesId, query)} className="flex min-h-11 items-center text-sm text-neutral-600 underline dark:text-neutral-400">
              {t.backSeries}
            </StoryLink>
          </nav>
          {!neighbours(index, storyId).next && <RelationGraphSection index={index} seriesId={seriesId} lang={lang} langQuery={query} />}
          <Section title={t.release}>
            <ReleaseDates lang={lang} releases={releases[seriesId]} own={Object.fromEntries(SERVERS.map((server) => [server, ownRelease(releases[seriesId]?.[server] ?? [], position)]))} />
          </Section>
          <BgmList keys={story.b ?? []} index={index} />
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-neutral-500">{t.notFound}</p>
      )}
    </StoryShell>
  );
}
