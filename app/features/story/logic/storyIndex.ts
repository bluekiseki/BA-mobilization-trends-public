import { dateEra, ERA_CATEGORIES, eraAnchors, seriesEra, type Era } from './eras';
import { mainTitle } from './mainTitles';
import { ownStep, seriesReleases, SERVERS, type Release, type SeriesReleases, type Server, type ServerSchedule } from './releaseDates';
import { STORY_LANGS, type IndexSeries, type IndexStory, type LocalizedText, type StoryIndex, type StoryLang } from './types';
import { categoryNames, storyCopy } from './uiText';

// Categories whose stories open in steps on different days (the parts of a chapter, the episodes of a club story).
const SPLIT_CATEGORIES = ['Main', 'Group'];
const CATEGORY_ORDER = ['Main', 'Event', 'Group', 'Mini', 'Favor', 'Content'];

export function toStoryLang(locale: string): StoryLang {
  return (STORY_LANGS as readonly string[]).includes(locale) ? (locale as StoryLang) : 'en';
}

export const LANG_LABELS: Record<StoryLang, string> = { en: 'English', ko: '한국어', ja: '日本語', 'zh-Hant': '繁體中文' };

// Category filter values: '' is the timeline (main, event, group and mini stories, which link to each other),
// 'all' also keeps bond stories and the rest, and any category name keeps just that category.
export const ALL_CATEGORIES = 'all';
export const TIMELINE_CATEGORIES = ['Main', 'Event', 'Group', 'Mini'];
export function categoryLabel(category: string, lang: StoryLang = 'en'): string {
  return categoryNames[lang][category] ?? category;
}

// Heading of a part of the story ("Act 1 - through Final", "Act 2"); a series without a date has no part.
export function eraLabel(era: Era | null, lang: StoryLang, dated = false): string {
  const t = storyCopy(lang);
  return era === 'before-final' ? t.eraBefore : era === 'after-final' ? t.eraAfter : era === 'part2' ? t.eraPart2 : dated ? t.eraOther : t.noDate;
}

// The summaries of an episode, one per part. A story released in parts has a summary for each part, and between two parts there is usually
// something the summaries leave out (a battle, say), so they are never joined into one text.
export function summaryParts(story: IndexStory, lang: StoryLang): string[] {
  const parts = story.p?.map((part) => pickText(part.m, lang)).filter(Boolean) ?? [];
  if (parts.length > 0) return parts;
  const whole = pickText(story.m, lang);
  return whole ? [whole] : [];
}

export function pickText(text: LocalizedText | null | undefined, lang: StoryLang): string {
  if (!text) return '';
  return text[lang] || text.en || text.ja || text.ko || '';
}

const EPISODE_SHORT: Record<StoryLang, (n: number) => string> = {
  en: (n) => `Ep. ${n}`,
  ko: (n) => `${n}화`,
  ja: (n) => `${n}話`,
  'zh-Hant': (n) => `${n}話`,
};

// Episodes from..to as a short range such as "Ep. 1 - 7"; a single episode is just "Ep. 11".
export function episodeRange(from: number, to: number, lang: StoryLang): string {
  if (from === to) return EPISODE_SHORT[lang](from);
  return lang === 'en' ? `Ep. ${from} - ${to}` : `${EPISODE_SHORT[lang](from)} - ${EPISODE_SHORT[lang](to)}`;
}

// The label in front of a title ("Episode 3", "Afterword"), as the game words it in each language. A language the game has no label
// for gets none.
export function episodeLabel(label: LocalizedText | undefined, lang: StoryLang): string {
  return label?.[lang] ?? '';
}

// "Episode 1 Title". A story without an episode label is just its title.
export function storyTitle(id: string, story: IndexStory, lang: StoryLang): string {
  const title = pickText(story.t, lang) || id;
  const episode = episodeLabel(story.l, lang);
  return episode ? `${episode} ${title}` : title;
}

export function characterLabel(index: StoryIndex, key: string, lang: StoryLang): string {
  return pickText(index.chars[key], lang) || key;
}

// Name of a series: the exported name, the shared chapter title for main story chapters, or the id.
export function seriesLabel(id: string, series: IndexSeries | undefined, lang: StoryLang): string {
  const chapter = series?.r?.[0] === 'main' ? mainTitle(series.r[1], lang, series.name?.[lang]) : undefined;
  return chapter || pickText(series?.name, lang) || id.replace('/', ' ');
}

export interface CategoryCount {
  category: string;
  stories: number;
}

// Categories in a fixed order. With a character, only the stories they appear in are counted.
export function listCategories(index: StoryIndex, character: string | null = null): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const series of Object.values(index.series)) {
    const stories = character ? series.stories.filter((sid) => index.stories[sid]?.c?.includes(character)) : series.stories;
    if (stories.length === 0) continue;
    counts.set(series.c, (counts.get(series.c) ?? 0) + stories.length);
  }
  // Fixed order so the buttons do not depend on the order of the data.
  const rank = (category: string) => (CATEGORY_ORDER.includes(category) ? CATEGORY_ORDER.indexOf(category) : CATEGORY_ORDER.length);
  return [...counts.entries()].map(([category, stories]) => ({ category, stories })).sort((a, b) => rank(a.category) - rank(b.category));
}

// The series are sorted by their first release on this server.
export type SortMode = Server;

// One release step of a series that is shown as a row of its own.
export interface SeriesPart {
  label: string | null; // as written in the schedule ("first", "2nd")
  episodes: [number, number];
  releases: Partial<Record<Server, Release[]>>; // the step on each server
}

export interface SeriesGroup {
  id: string;
  key: string; // id, or id and step when a series is listed once per step
  label: string;
  era: Era | null;
  category: string;
  summary: string;
  date: string | null; // first release on the sorted server
  dates: Partial<Record<Server, string>>; // first release on each server
  part?: SeriesPart; // set when the row is one release step of the series
  steps: Release[]; // release steps on the sorted server, when the stories belong to different steps
  stories: { id: string; title: string; step: number | null }[];
}

// Release steps of a series (steps on the same day count as one), when every step says which episodes it opens; otherwise none.
function releaseParts(releases: SeriesReleases[string] | undefined, sort: Server): SeriesPart[] {
  const steps = releases?.[sort] ?? [];
  if (steps.length < 2 || !steps.every((step) => step.episodes)) return [];
  const merged: SeriesPart[] = [];
  for (const step of steps) {
    const [from, to] = step.episodes ?? [0, 0];
    const last = merged[merged.length - 1];
    if (last && last.releases[sort]?.[0]?.date === step.date) {
      last.episodes = [Math.min(last.episodes[0], from), Math.max(last.episodes[1], to)];
      last.label = last.label && step.label ? `${last.label}, ${step.label}` : (last.label ?? step.label);
    } else {
      merged.push({ label: step.label, episodes: [from, to], releases: {} });
      merged[merged.length - 1].releases[sort] = [step];
    }
  }
  // The same episodes on the other servers.
  for (const part of merged) {
    for (const server of SERVERS) {
      if (server === sort) continue;
      const found = (releases?.[server] ?? []).find((step) => step.episodes && step.episodes[0] <= part.episodes[0] && part.episodes[0] <= step.episodes[1]);
      if (found) part.releases[server] = [found];
    }
  }
  return merged;
}

// Releases of every series on every server.
export function buildSeriesReleases(index: StoryIndex, schedules: Record<Server, ServerSchedule>): SeriesReleases {
  const result: SeriesReleases = {};
  for (const [id, series] of Object.entries(index.series)) {
    if (!series.r) continue;
    const jp = seriesReleases(series.r, schedules.jp);
    // An event missing from the JP schedule still has its start time in the event list.
    if (jp.length === 0 && series.d) jp.push({ date: series.d, label: null, estimated: false });
    result[id] = { jp, kr: seriesReleases(series.r, schedules.kr) };
  }
  return result;
}

function matches(query: string, haystacks: (string | undefined)[]): boolean {
  return haystacks.some((h) => h?.toLowerCase().includes(query));
}

function characterNames(index: StoryIndex, keys: string[] | undefined): (string | undefined)[] {
  return (keys ?? []).flatMap((key) => [key, ...STORY_LANGS.map((l) => index.chars[key]?.[l])]);
}

export interface FilterOptions {
  category: string;
  query: string;
  lang: StoryLang;
  character: string | null;
  sort: SortMode;
  descending?: boolean; // newest release first
  era?: Era | null; // only the series of this part of the story
  splitParts?: boolean; // list a main or club story released in steps once per step (not while searching or filtering by character)
  releases: SeriesReleases;
}

// Series of one category. With a query, only the stories (or series) that match are kept; the query also matches the names of characters.
export function filterSeries(index: StoryIndex, { category, query, lang, character, sort, descending = false, era = null, splitParts = false, releases }: FilterOptions): SeriesGroup[] {
  const q = query.trim().toLowerCase();
  const anchors = eraAnchors(index, releases, sort);
  const groups: SeriesGroup[] = [];
  for (const [id, series] of Object.entries(index.series)) {
    // A search or a character looks through every category, whatever the default timeline hides.
    const everything = category === ALL_CATEGORIES || (category === '' && (q !== '' || character !== null));
    if (!everything && (category === '' ? !TIMELINE_CATEGORIES.includes(series.c) : series.c !== category)) continue;
    const seriesPart = ERA_CATEGORIES.includes(series.c) ? seriesEra(releases, id, anchors, sort) : null;
    if (era && seriesPart !== era) continue;
    const seriesMatches = q !== '' && matches(q, [id, ...STORY_LANGS.flatMap((l) => [series.name?.[l], series.r?.[0] === 'main' ? mainTitle(series.r[1], l, series.name?.[l]) : undefined])]);
    const stories = series.stories
      .filter((sid) => {
        const story = index.stories[sid];
        if (character && !story.c?.includes(character)) return false;
        if (q === '' || seriesMatches) return true;
        return matches(q, [sid, ...STORY_LANGS.map((l) => story.t[l]), ...characterNames(index, story.c)]);
      })
      .map((sid) => ({ id: sid, title: storyTitle(sid, index.stories[sid], lang), step: ownStep(releases[id]?.[sort] ?? [], series.stories.indexOf(sid)) }));
    if (stories.length === 0) continue;
    const date = releases[id]?.[sort]?.[0]?.date ?? null;
    const dates: Partial<Record<Server, string>> = {};
    for (const server of SERVERS) {
      const first = releases[id]?.[server]?.[0];
      if (first) dates[server] = first.date;
    }
    const group: SeriesGroup = {
      id,
      key: id,
      era: seriesPart,
      label: seriesLabel(id, series, lang),
      category: series.c,
      summary: pickText(series.m, lang),
      date,
      dates,
      steps: stories.some((s) => s.step !== null) ? (releases[id]?.[sort] ?? []) : [],
      stories,
    };
    const parts = splitParts && SPLIT_CATEGORIES.includes(series.c) && q === '' && !character ? releaseParts(releases[id], sort) : [];
    if (parts.length < 2) {
      groups.push(group);
      continue;
    }
    for (const part of parts) {
      const step = part.releases[sort]?.[0];
      if (!step) continue;
      const [from, to] = part.episodes;
      groups.push({ ...group, key: `${id}#${from}`, part, date: step.date, era: dateEra(step.date, anchors), stories: group.stories.slice(from - 1, to) });
    }
  }
  // Series without a known date go last. On the same day main stories come first, then the other categories; the original order breaks ties.
  const direction = descending ? -1 : 1;
  const rank = (category: string) => (CATEGORY_ORDER.includes(category) ? CATEGORY_ORDER.indexOf(category) : CATEGORY_ORDER.length);
  return groups
    .map((group, at) => ({ group, at }))
    .sort((a, b) => {
      if (a.group.date === null || b.group.date === null) return a.group.date === b.group.date ? a.at - b.at : a.group.date === null ? 1 : -1;
      // Stories outside the parts of the story (bond stories, content explanations) come after all of them.
      if ((a.group.era === null) !== (b.group.era === null)) return a.group.era === null ? 1 : -1;
      const byDay = a.group.date.slice(0, 10).localeCompare(b.group.date.slice(0, 10)) * direction;
      return byDay || rank(a.group.category) - rank(b.group.category) || a.group.date.localeCompare(b.group.date) * direction || a.at - b.at;
    })
    .map(({ group }) => group);
}

// Previous / next story inside the same series.
export function neighbours(index: StoryIndex, id: string): { prev: string | null; next: string | null } {
  const story = index.stories[id];
  const members = story ? index.series[story.s]?.stories : undefined;
  const at = members ? members.indexOf(id) : -1;
  if (!members || at < 0) return { prev: null, next: null };
  return { prev: members[at - 1] ?? null, next: members[at + 1] ?? null };
}
