import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { characterPath, seriesPath, StoryLink, storyPath } from '~/features/story/components/StorySections';
import { useStoryIndex } from '~/features/story/components/useStoryIndex';
import { useStorySettings } from '~/features/story/components/useStorySettings';
import { categoryLabel, episodeRange, pickText, seriesLabel, summaryParts, toStoryLang } from '~/features/story/logic/storyIndex';
import { serverLabel } from '../logic/serverLabel';
import { type AppearanceScope, favorStoryIds, isStoryReleased, studentAppearances, studentCharacterKeys } from '../logic/appearances';

export interface FavorStoryInfo {
  rank: number;
  memorial: boolean;
}

interface Props {
  studentId: number;
  favorStories: FavorStoryInfo[];
  // Whether the student is out on the Global server (used for readers outside the JP site)
  globalReleased: boolean;
  locale: string;
  // Names of the student and their outfits by bond story series; those series are all named after the character alone
  outfitNames: Record<string, string>;
}

// Bond stories at or above this rank (15 and 20) are favorite item stories, not steps of the regular rank ladder
const FAVORITE_ITEM_RANK = 15;

const isFavoriteItem = (info: FavorStoryInfo) => info.rank >= FAVORITE_ITEM_RANK && !info.memorial;

const buttonClass = 'rounded bg-ba-btn-gray px-3 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-300';

// Bond stories and the stories a student appears in. Both give away the plot, so nothing is listed until the reader switches the
// spoiler setting of the story preview on (the two share it). The server buttons pick whose schedule decides what is already out.
export function StudentScenarioSection({ studentId, favorStories, globalReleased, locale, outfitNames }: Props) {
  const { t } = useTranslation('students');
  const lang = toStoryLang(locale);
  // The server decides which stories count as out; the JP site opens on JP, every other site on GL/KR
  const [server, setServer] = useState<'jp' | 'gl'>(locale === 'ja' ? 'jp' : 'gl');
  const [scope, setScope] = useState<AppearanceScope>('student');
  const [sort, setSort] = useState<'category' | 'date'>('category');
  // JP is the leading server, so only GL/KR has stories that are not out yet
  const hideUnreleased = server === 'gl';
  const { index, releases, error } = useStoryIndex();
  const { settings, save } = useStorySettings();
  const spoilers = settings?.spoilers ?? false;
  const setSpoilers = (next: boolean) => save({ server: settings?.server ?? (locale === 'ko' ? 'gl' : 'jp'), episodeTotals: settings?.episodeTotals ?? false, spoilers: next });

  const appearances = useMemo(() => {
    if (!index || !spoilers) return [];
    const now = Date.now();
    return studentAppearances(
      index,
      studentId,
      releases,
      hideUnreleased ? (seriesId, position) => isStoryReleased(releases, seriesId, position, 'gl', now) : undefined,
      hideUnreleased ? 'gl' : 'jp',
      scope,
    );
  }, [index, spoilers, studentId, releases, hideUnreleased, scope]);

  if (!spoilers) {
    return (
      <div className="space-y-3 py-6 text-sm">
        <h2 className="text-xl font-bold">{t('scenarioGateTitle')}</h2>
        <p className="text-neutral-600 dark:text-neutral-400">{t('scenarioGateBody')}</p>
        <button type="button" className={buttonClass} onClick={() => setSpoilers(true)}>
          {t('scenarioReveal')}
        </button>
      </div>
    );
  }
  if (error) return <p className="py-6 text-sm text-red-600 dark:text-red-400">{t('scenarioFailed')}</p>;
  if (!index) return <p className="py-6 text-sm text-neutral-500 dark:text-neutral-400">{t('scenarioLoading')}</p>;

  const characterKey = studentCharacterKeys(index, studentId)[0];
  const bondIds = favorStoryIds(index, studentId);
  const bondHidden = hideUnreleased && !globalReleased;
  // Grouped by category; the rows are already ordered by category
  const groups = appearances.reduce<{ category: string; rows: typeof appearances }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last?.category === row.category) last.rows.push(row);
    else acc.push({ category: row.category, rows: [row] });
    return acc;
  }, []);

  // Oldest first for the date order; series without a date go last
  const byDate = [...appearances].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.seriesId.localeCompare(b.seriesId));
  // Every row has the same shape: the date in a fixed column, then the title and below it the episodes
  const renderRow = (row: (typeof appearances)[number], showCategory: boolean) => (
    <li key={row.seriesId} className="flex break-inside-avoid gap-3 border-t border-neutral-200 py-2 dark:border-neutral-700">
      <span className="w-20 shrink-0 text-xs tabular-nums leading-5 text-neutral-500 dark:text-neutral-400">{row.date?.slice(0, 10)}</span>
      <div className="min-w-0 space-y-1">
        <p className="leading-5">
          <StoryLink className="font-medium hover:underline" to={seriesPath(index, row.seriesId, '')}>
            {outfitNames[row.seriesId] ?? seriesLabel(row.seriesId, index.series[row.seriesId], lang)}
          </StoryLink>
          {showCategory && <span className="ml-2 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">{categoryLabel(row.category, lang)}</span>}
        </p>
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
          {row.stories.map((story) => (
            <StoryLink key={story.id} className="text-blue-600 hover:underline dark:text-blue-400" to={storyPath(index, story.id, '')}>
              {episodeRange(story.position, story.position, lang)}
            </StoryLink>
          ))}
        </p>
      </div>
    </li>
  );

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-600 dark:text-neutral-400">
        <button type="button" className={buttonClass} onClick={() => setSpoilers(false)}>
          {t('scenarioHide')}
        </button>
        <div className="flex gap-1.5">
          {(['jp', 'gl'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={server === value}
              onClick={() => setServer(value)}
              className={`rounded border px-2 py-0.5 text-xs font-semibold ${server === value ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900' : 'border-neutral-300 dark:border-neutral-600'}`}
            >
              {serverLabel(value)}
            </button>
          ))}
        </div>
      </div>

      <section id="bond" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold">{t('stories')}</h2>
        {bondHidden ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('scenarioBondUnreleased')}</p>
        ) : favorStories.length ? (
          <ol className="text-sm lg:columns-2 lg:gap-x-8">
            {favorStories.map((info, at) => {
              const story = index.stories[bondIds[at] ?? ''];
              const summary = story ? summaryParts(story, lang).join(' ') : '';
              return (
                <li key={info.rank} className="flex break-inside-avoid gap-3 border-t border-neutral-200 py-2 dark:border-neutral-700">
                  <span className="w-24 shrink-0 whitespace-nowrap tabular-nums text-neutral-500 dark:text-neutral-400">
                    {isFavoriteItem(info) ? t('favoriteItemStory') : `${t('rank')} ${info.rank}`}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {story ? (
                        <StoryLink className="hover:underline" to={storyPath(index, bondIds[at], '')}>
                          {pickText(story.t, lang)}
                        </StoryLink>
                      ) : (
                        t('unknown')
                      )}
                      {info.memorial && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">{t('memorial')}</span>}
                    </p>
                    {summary && <p className="mt-1 text-neutral-600 dark:text-neutral-400">{summary}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('unknown')}</p>
        )}
      </section>

      <section id="appearances" className="scroll-mt-24 space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-xl font-bold">{t('scenarioAppear')}</h2>
          {/* The story list does not know about releases, so outside the JP site it would list unreleased stories */}
          {characterKey && !hideUnreleased && (
            <StoryLink className="text-sm text-blue-600 hover:underline dark:text-blue-400" to={characterPath(characterKey, '')}>
              {t('scenarioViewAll')}
            </StoryLink>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(['student', 'character'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={`rounded border px-2 py-0.5 font-semibold ${scope === value ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900' : 'border-neutral-300 dark:border-neutral-600'}`}
            >
              {t(value === 'student' ? 'scenarioScopeStudent' : 'scenarioScopeCharacter')}
            </button>
          ))}
          <span className="mx-1 h-4 border-l border-neutral-300 dark:border-neutral-600" aria-hidden />
          {(['category', 'date'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
              className={`rounded border px-2 py-0.5 font-semibold ${sort === value ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900' : 'border-neutral-300 dark:border-neutral-600'}`}
            >
              {t(value === 'category' ? 'scenarioSortCategory' : 'scenarioSortDate')}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('scenarioAppearNote')}</p>
        {sort === 'date' && byDate.length ? (
          <ul className="text-sm">{byDate.map((row) => renderRow(row, true))}</ul>
        ) : groups.length ? (
          groups.map((group) => (
            <div key={group.category} className="space-y-1">
              <h3 className="text-sm font-semibold">{categoryLabel(group.category, lang)}</h3>
              <ul className="text-sm lg:columns-2 lg:gap-x-8">{group.rows.map((row) => renderRow(row, false))}</ul>
            </div>
          ))
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('scenarioAppearNone')}</p>
        )}
      </section>
    </div>
  );
}
