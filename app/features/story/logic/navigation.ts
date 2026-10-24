import type { Server } from './releaseDates';
import { ALL_CATEGORIES } from './storyIndex';

export const STORY_CATEGORIES = ['Main', 'Event', 'Group', 'Mini', 'Favor', 'Content'] as const;

export function readStoryFilters(params: URLSearchParams, server: Server = 'jp') {
  const requestedCategory = params.get('category');
  return {
    query: params.get('q') ?? '',
    // '' is the timeline of main, event, group and mini stories; 'all' adds bond stories and the rest.
    category: requestedCategory === ALL_CATEGORIES ? ALL_CATEGORIES : (STORY_CATEGORIES.find((value) => value === requestedCategory) ?? ''),
    sort: server,
    descending: params.get('order') === 'desc',
    year: /^\d{4}$/.test(params.get('year') ?? '') ? params.get('year') : null,
  };
}

export function storyQuery(query: string, changes: Record<string, string | null>): string {
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function storyListPath(query: string): string {
  const selected = new URLSearchParams(query).get('focus');
  return `/utils/story${query}${selected ? `#series-${encodeURIComponent(selected)}` : ''}`;
}

// Keep chapter numbers with their titles while moving the volume to a quieter line.
export function splitSeriesTitle(label: string, main: boolean): { context: string; title: string } {
  if (!main) return { context: '', title: label };
  const match = /^(.*?)(\d+장\s.*|第\d+章.*|Ch\.\s*\d+.*)$/.exec(label);
  return match ? { context: match[1].replace(/[,\s]+$/, ''), title: match[2].trim() } : { context: '', title: label };
}
