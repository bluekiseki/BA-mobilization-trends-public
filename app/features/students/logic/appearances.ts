import { getCombatStyleRepresentativeId } from '~/utils/combatStyle';
import { ownStep, type SeriesReleases, type Server } from '~/features/story/logic/releaseDates';
import type { IndexStory, StoryIndex } from '~/features/story/logic/types';

const CATEGORY_ORDER = ['Main', 'Event', 'Group', 'Mini', 'Favor', 'Content'];

export interface StoryAppearance {
  seriesId: string;
  category: string;
  date: string | null;
  // Stories of the series the student appears in, with their 1-based position in the series
  stories: { id: string; position: number }[];
}

// Character keys the story index uses for a student. Students that are listed in `cs` map directly; for the rest (such as outfit
// variants) the name of the student's bond story series is the character name.
export function studentCharacterKeys(index: StoryIndex, studentId: number): string[] {
  const id = String(getCombatStyleRepresentativeId(studentId));
  const direct = Object.entries(index.cs)
    .filter(([, student]) => student === id)
    .map(([key]) => key);
  if (direct.length > 0) return direct;
  const named = index.series[`Favor/${id}`]?.name?.ko;
  return named && index.chars[named] ? [named] : [];
}

// The student's own bond stories, in rank order
export function favorStoryIds(index: StoryIndex, studentId: number): string[] {
  return index.series[`Favor/${getCombatStyleRepresentativeId(studentId)}`]?.stories ?? [];
}

// Whether a story is out on a server. Schedule times are written in +09:00 for both servers. A story without a release on that
// server counts as unreleased, and a series released in steps that do not say which episodes they open counts as released only once
// its last step is out. An estimated date (a prediction, or the launch day guessed for a bond story with no pickup) never counts as
// released, so nothing unreleased slips through.
export function isStoryReleased(releases: SeriesReleases, seriesId: string, position: number, server: Server, nowMs: number): boolean {
  const steps = releases[seriesId]?.[server] ?? [];
  if (steps.length === 0) return false;
  const own = ownStep(steps, position);
  const step = own === null ? steps[steps.length - 1] : steps[own];
  return !step.estimated && Date.parse(`${step.date.replace(' ', 'T')}:00+09:00`) <= nowMs;
}

// 'student' narrows to the stories of the student's own look; 'character' lists every story the character speaks in, whatever the outfit.
export type AppearanceScope = 'student' | 'character';

interface SpeakerContext {
  keys: Set<string>;
  ownNames: Set<string>;
  // Outfit speaker names, longest first, so a name resolves to the most specific outfit
  variantKeys: string[];
}

// A speaker name belongs to an outfit when it is that outfit's name or extends it, such as "name mode 3" for "name".
// When several outfits match, the longest one wins so "name swimsuit" is not taken for the outfit "name".
function resolveVariant(name: string, variantKeys: string[]): string | undefined {
  return variantKeys.find((base) => name === base || name.startsWith(`${base} `));
}

// Whether the student speaks in a story. An outfit student that has speaker names of their own only counts for the stories those
// names speak in. Everyone else counts for the stories their character speaks in, except where only another student's outfit speaks.
function speaksIn(story: IndexStory, { keys, ownNames, variantKeys }: SpeakerContext, scope: AppearanceScope): boolean {
  return (story.c ?? []).some((key) => {
    if (!keys.has(key)) return false;
    if (scope === 'character') return true;
    const names = story.v?.[key] ?? [key];
    return names.some((name) => {
      const variant = resolveVariant(name, variantKeys);
      return ownNames.size > 0 ? variant !== undefined && ownNames.has(variant) : variant === undefined;
    });
  });
}

// Every story the student appears in, grouped by series. Their own bond stories are left out because they are listed on their own.
// `isVisible` (series id, 0-based position) drops stories that must not be shown, such as the ones not released yet. Dates are the
// first release on `dateServer`.
export function studentAppearances(
  index: StoryIndex,
  studentId: number,
  releases: SeriesReleases,
  isVisible?: (seriesId: string, position: number) => boolean,
  dateServer: Server = 'jp',
  scope: AppearanceScope = 'student',
): StoryAppearance[] {
  const keys = new Set(studentCharacterKeys(index, studentId));
  if (keys.size === 0) return [];
  const ownNames = new Set(
    Object.entries(index.vs ?? {})
      .filter(([, student]) => student === String(getCombatStyleRepresentativeId(studentId)))
      .map(([name]) => name),
  );
  const variantKeys = Object.keys(index.vs ?? {}).sort((x, y) => y.length - x.length);
  const speakers: SpeakerContext = { keys, ownNames, variantKeys };
  const ownSeries = `Favor/${getCombatStyleRepresentativeId(studentId)}`;
  const found: StoryAppearance[] = [];
  for (const [seriesId, series] of Object.entries(index.series)) {
    if (seriesId === ownSeries) continue;
    const stories = series.stories.flatMap((id, at) =>
      index.stories[id] && speaksIn(index.stories[id], speakers, scope) && (!isVisible || isVisible(seriesId, at)) ? [{ id, position: at + 1 }] : [],
    );
    if (stories.length === 0) continue;
    found.push({ seriesId, category: series.c, date: releases[seriesId]?.[dateServer]?.[0]?.date ?? null, stories });
  }
  const rank = (category: string) => (CATEGORY_ORDER.includes(category) ? CATEGORY_ORDER.indexOf(category) : CATEGORY_ORDER.length);
  // Undated series go last within their category
  return found.sort((a, b) => rank(a.category) - rank(b.category) || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.seriesId.localeCompare(b.seriesId));
}
