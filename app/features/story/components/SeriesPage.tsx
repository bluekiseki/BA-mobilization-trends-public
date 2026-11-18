import { useMemo } from 'react';
import { useParams } from 'react-router';
import { noticeImages, storyImages } from '../logic/noticeImages';
import { ownStep, SERVER_LABELS, SERVERS } from '../logic/releaseDates';
import { seriesIdBySlug } from '../logic/slugs';
import { ERA_CATEGORIES, eraAnchors, seriesEra } from '../logic/eras';
import { eraLabel, episodeRange, episodeSlot, episodeTotal, pickText, seriesLabel, storyTitle, summaryParts } from '../logic/storyIndex';
import { BgmList, CategoryPill, NoticeImages, StoryLink, CharacterChips, ReleaseDates, Section, SeriesTitle, storyPath } from './StorySections';
import { storyListPath } from '../logic/navigation';
import { useStorySettings } from './useStorySettings';
import { storyCopy } from '../logic/uiText';
import { RelationGraphSection } from './RelationGraph';
import { StoryShell } from './StoryShell';
import { useStoryIndex, useStoryLang } from './useStoryIndex';

// Most frequent first.
function countKeys(lists: (string[] | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const list of lists) for (const key of list ?? []) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

export function SeriesPage() {
  const { series: slug = '' } = useParams();
  const { index, releases, error } = useStoryIndex();
  const { lang, setLang, query } = useStoryLang();
  const t = storyCopy(lang);
  const { settings } = useStorySettings();
  const spoilers = settings?.spoilers ?? false;
  const episodeTotals = settings?.episodeTotals ?? false;
  const seriesId = index ? seriesIdBySlug(index, decodeURIComponent(slug)) : null;
  const series = index && seriesId ? index.series[seriesId] : undefined;

  const characters = useMemo(() => (index && series ? countKeys(series.stories.map((id) => index.stories[id]?.c)) : []), [index, series]);
  const bgm = useMemo(() => (index && series ? countKeys(series.stories.map((id) => index.stories[id]?.b)) : []), [index, series]);

  return (
    <StoryShell lang={lang} onLang={setLang} langQuery={query} error={error} loading={!index} detail>
      {index && seriesId && series ? (
        <div className="flex flex-col gap-4">
          <StoryLink to={storyListPath(query)} className="flex min-h-11 items-center text-sm text-neutral-600 underline dark:text-neutral-400">
            {t.back}
          </StoryLink>
          <div className="flex flex-col items-start gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <CategoryPill category={series.c} lang={lang} />
              {ERA_CATEGORIES.includes(series.c) && (
                <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{eraLabel(seriesEra(releases, seriesId, eraAnchors(index, releases)), lang)}</span>
              )}
            </span>
            <h1>
              <SeriesTitle label={seriesLabel(seriesId, series, lang)} main={series.c === 'Main'} large />
            </h1>
          </div>
          {spoilers && pickText(series.m, lang) && <p className="whitespace-pre-line text-sm font-normal leading-relaxed text-neutral-600 dark:text-neutral-300">{pickText(series.m, lang)}</p>}
          <NoticeImages urls={spoilers ? storyImages(series.i, releases[seriesId]?.jp) : undefined} />
          <ReleaseDates releases={releases[seriesId]} lang={lang} />
          <CharacterChips keys={characters} index={index} lang={lang} langQuery={query} />
          <RelationGraphSection index={index} seriesId={seriesId} lang={lang} langQuery={query} />

          <Section title={episodeTotals ? `${t.backSeries} · ${episodeRange(1, episodeTotal(index, series, lang), lang)}` : t.backSeries}>
            <ul className="flex flex-col divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {series.stories.map((id, position) => {
                const story = index.stories[id];
                const steps = SERVERS.map((server) => releases[seriesId]?.[server] ?? []);
                const slot = episodeSlot(index, series, id, lang);
                const step = ownStep(steps[0], position);
                const starts = step !== null && step !== ownStep(steps[0], position - 1);
                const first = step === null ? undefined : steps[0][step];
                return (
                  <li key={id} className="flex flex-col">
                    {starts && step !== null && first && (
                      <div className="flex flex-col gap-2 border-l-4 border-ba-btn-blue-dark bg-neutral-200 px-3 py-3 dark:bg-neutral-700">
                        <p className="text-sm font-semibold">
                          {first.label}
                          {episodeTotals && first.episodes && <span className="font-normal"> · {episodeRange(first.episodes[0], first.episodes[1], lang)}</span>}
                        </p>
                        <p className="text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
                          {SERVERS.flatMap((server, i) =>
                            steps[i][step] ? [`${SERVER_LABELS[server]} ${steps[i][step].date.slice(0, 10)}${steps[i][step].estimated ? ` (${t.estimated})` : ''}`] : [],
                          ).join(' / ')}
                        </p>
                        <NoticeImages urls={spoilers ? noticeImages(series.r, first.date) : undefined} />
                      </div>
                    )}
                    <StoryLink
                      to={storyPath(index, id, query)}
                      className="group flex min-h-11 flex-col gap-1.5 border-l-4 border-transparent px-3 py-3 hover:border-ba-btn-blue-dark hover:bg-ba-btn-blue/10"
                    >
                      {slot !== null && <span className="text-xs font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">{episodeRange(slot, slot, lang)}</span>}
                      <span className="text-base font-bold group-hover:underline">{storyTitle(id, story, lang)}</span>
                      {spoilers && summaryParts(story, lang).length > 0 && (
                        <span className="flex flex-col gap-0.5 text-sm font-normal leading-relaxed text-neutral-600 dark:text-neutral-400">
                          {summaryParts(story, lang).length === 1 ? (
                            <span className="line-clamp-2">{summaryParts(story, lang)[0]}</span>
                          ) : (
                            <>
                              {summaryParts(story, lang)
                                .slice(0, 2)
                                .map((text, at) => (
                                  <span key={at} className="line-clamp-1">
                                    {text}
                                  </span>
                                ))}
                              {summaryParts(story, lang).length > 2 && <span aria-hidden="true">…</span>}
                            </>
                          )}
                        </span>
                      )}
                    </StoryLink>
                  </li>
                );
              })}
            </ul>
          </Section>

          <BgmList keys={bgm} index={index} />
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-neutral-500">{t.notFound}</p>
      )}
    </StoryShell>
  );
}
