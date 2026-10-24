import type { BgmEntry } from '~/features/jukebox/BgmItem';

export interface SpoilerFilters {
  general: Record<string, boolean>;
  mainStories: Record<string, boolean>;
  eventStories: Record<string, boolean>;
  favorStudents: Record<string, boolean>;
  memorialStudents: Record<string, boolean>;
}

export type ActiveFilters = {
  general: string[];
  mainStories: string[];
  eventStories: string[];
  favorStudents: string[];
  memorialStudents: string[];
};

/** The keys that are switched on in each filter group. */
export function getActiveFilters(spoilerFilters: SpoilerFilters): ActiveFilters {
  return {
    general: Object.entries(spoilerFilters.general)
      .filter(([, v]) => v)
      .map(([k]) => k),
    mainStories: Object.keys(spoilerFilters.mainStories).filter((k) => spoilerFilters.mainStories[k]),
    eventStories: Object.keys(spoilerFilters.eventStories).filter((k) => spoilerFilters.eventStories[k]),
    favorStudents: Object.keys(spoilerFilters.favorStudents).filter((k) => spoilerFilters.favorStudents[k]),
    memorialStudents: Object.keys(spoilerFilters.memorialStudents).filter((k) => spoilerFilters.memorialStudents[k]),
  };
}

export interface FilterBgmInput {
  allBgm: BgmEntry[];
  activeFilters: ActiveFilters;
  searchTerm: string;
  sortOrder: 'ascending' | 'descending';
  matcher: (target: string, query: string) => boolean;
}

/** BGM entries that match the active story filters and the search term, sorted by id. */
export function filterBgm({ allBgm, activeFilters, searchTerm, sortOrder, matcher }: FilterBgmInput): BgmEntry[] {
  const { general, mainStories, eventStories, favorStudents, memorialStudents } = activeFilters;
  let results: BgmEntry[] = [];

  if ([...general, ...mainStories, ...eventStories, ...favorStudents, ...memorialStudents].length > 0) {
    results = allBgm.filter((bgm) =>
      bgm.xref.some((xref) => {
        if (xref.type === 'Favor_Story' && xref.title && favorStudents.includes(String(xref.title))) return true;
        if (xref.type === 'Memorial' && xref.title && memorialStudents.includes(String(xref.title))) return true;
        if ((xref.type === 'raid' || xref.type === 'limitraid') && general.includes('Raid')) return true;
        if (xref.type === 'UI' && general.includes('Other')) return true;
        if ((xref.type === 'main_work' || xref.type === 'event_work') && general.includes('Work')) return true;
        if (xref.type === 'Main_Story' && xref.title && mainStories.includes(String(xref.title))) return true;
        if (xref.type === 'Event_Story' && xref.title && eventStories.includes(String(xref.title))) return true;
        if (xref.type === 'Group_Story' && general.includes('GroupStory')) return true;
        if (xref.type === 'Mini_Story' && general.includes('MiniStory')) return true;
        if (xref.type === 'Work_Story' && general.includes('WorkStory')) return true;
        return false;
      }),
    );
  }

  if (searchTerm) {
    results = results.filter((bgm) => matcher(bgm.id, searchTerm) || (bgm.title ? matcher(bgm.title, searchTerm) : false) || (bgm.composer ? matcher(bgm.composer, searchTerm) : false));
  }

  results.sort((a, b) => (sortOrder === 'ascending' ? Number(a.id) - Number(b.id) : Number(b.id) - Number(a.id)));

  return results;
}
