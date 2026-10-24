import type { IndexSeries, StoryIndex } from './types';

// URL part of a series page. Numbered series read "event-34"; main chapters use their schedule key ("main-vol3_ch3").
export function seriesSlug(id: string, series: IndexSeries | undefined): string {
  if (series?.r?.[0] === 'main') return `main-${series.r[1]}`;
  const numbered = /^(Event|Group|Mini|Favor)\/(\d+)$/.exec(id);
  if (numbered) return `${numbered[1].toLowerCase()}-${numbered[2]}`;
  return id.replace('/', '-');
}

export function seriesIdBySlug(index: StoryIndex, slug: string): string | null {
  return Object.keys(index.series).find((id) => seriesSlug(id, index.series[id]) === slug) ?? null;
}
