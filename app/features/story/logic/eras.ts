import type { SeriesReleases, Server } from './releaseDates';
import type { StoryIndex } from './types';

export type Era = 'before-final' | 'after-final' | 'part2';

// Only these stories belong to a part of the story; bond stories and content explanations stand on their own.
export const ERA_CATEGORIES = ['Main', 'Event', 'Group', 'Mini'];

export const ERAS: Era[] = ['before-final', 'after-final', 'part2'];

export interface EraAnchors {
  finalDate: string | null; // last release step of the last chapter of the Final edition on the server: the day the Final edition was complete
  part2Date: string | null; // first release of the Part 2 prologue on the server
}

const firstRelease = (releases: SeriesReleases, id: string | undefined, server: Server) => (id ? (releases[id]?.[server]?.[0]?.date ?? null) : null);
const lastRelease = (releases: SeriesReleases, id: string | undefined, server: Server) => (id ? (releases[id]?.[server]?.at(-1)?.date ?? null) : null);

export function eraAnchors(index: StoryIndex, releases: SeriesReleases, server: Server = 'jp'): EraAnchors {
  const byKey = (key: string) => Object.entries(index.series).find(([, series]) => series.r?.[0] === 'main' && series.r[1] === key)?.[0];
  return { finalDate: lastRelease(releases, byKey('final_ch4'), server), part2Date: firstRelease(releases, byKey('part2_prologue'), server) };
}

// Where a series sits in the story: by its first release on the server against the end of the Final edition (every part of its last chapter
// included) and the start of Part 2.
// (A guide only: the community wiki sorts by in-story time, which is not in the data.)
export function seriesEra(releases: SeriesReleases, id: string, anchors: EraAnchors, server: Server = 'jp'): Era | null {
  return dateEra(firstRelease(releases, id, server), anchors);
}

export function dateEra(date: string | null, anchors: EraAnchors): Era | null {
  if (!date || !anchors.finalDate) return null;
  if (anchors.part2Date && date >= anchors.part2Date) return 'part2';
  return date <= anchors.finalDate ? 'before-final' : 'after-final';
}
