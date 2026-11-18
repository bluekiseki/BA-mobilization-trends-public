import type { BgmEntry, XrefEntry } from '~/features/jukebox/BgmItem';

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

/** The number a BGM id starts with ("316_Light" -> 316), or null when it has none ("BlueNewWorld"). */
function leadingBgmNumber(id: string): number | null {
  const digits = /^\d+/.exec(id)?.[0];
  return digits === undefined ? null : Number(digits);
}

/** Orders BGM ids by their leading number ("316_Light" after 316); ids without a number ("BlueNewWorld") always come last. */
export function compareBgmId(a: string, b: string, order: 'ascending' | 'descending' = 'ascending'): number {
  const na = leadingBgmNumber(a);
  const nb = leadingBgmNumber(b);
  if (na === null || nb === null) return na === nb ? a.localeCompare(b) : na === null ? 1 : -1;
  const diff = na === nb ? a.localeCompare(b) : na - nb;
  return order === 'ascending' ? diff : -diff;
}

/** Inclusive BGM number range; a null bound is open-ended. */
export interface IdRange {
  min: number | null;
  max: number | null;
}

/** Parses a number input value; empty or invalid text means no bound. */
export function parseIdBound(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Whether an xref is covered by one of the active story filters. */
export function xrefMatchesFilters(xref: XrefEntry, { general, mainStories, eventStories, favorStudents, memorialStudents }: ActiveFilters): boolean {
  if (xref.type === 'Favor_Story' && xref.title && favorStudents.includes(String(xref.title))) return true;
  if (xref.type === 'Memorial' && xref.title && memorialStudents.includes(String(xref.title))) return true;
  if ((xref.type === 'raid' || xref.type === 'limitraid') && general.includes('Raid')) return true;
  if (xref.type === 'UI' && general.includes('Other')) return true;
  if (xref.type === 'UI' && xref.event && eventStories.includes(xref.event)) return true;
  if ((xref.type === 'main_work' || xref.type === 'event_work') && general.includes('Work')) return true;
  if (xref.type === 'Main_Story' && xref.title && mainStories.includes(String(xref.title))) return true;
  if (xref.type === 'Event_Story' && xref.title && eventStories.includes(String(xref.title))) return true;
  if (xref.type === 'Group_Story' && general.includes('GroupStory')) return true;
  if (xref.type === 'Mini_Story' && general.includes('MiniStory')) return true;
  if (xref.type === 'Work_Story' && general.includes('WorkStory')) return true;
  return false;
}

export interface FilterBgmInput {
  allBgm: BgmEntry[];
  activeFilters: ActiveFilters;
  searchTerm: string;
  idRange: IdRange;
  sortOrder: 'ascending' | 'descending';
  matcher: (target: string, query: string) => boolean;
  /** The text shown for an xref; when given, the search also looks through the xrefs that the active filters allow. */
  xrefText?: (xref: XrefEntry, bgm: BgmEntry) => string;
}

/** BGM entries that match the active story filters, the search term and the id range, sorted by id. */
export function filterBgm({ allBgm, activeFilters, searchTerm, idRange, sortOrder, matcher, xrefText }: FilterBgmInput): BgmEntry[] {
  const { general, mainStories, eventStories, favorStudents, memorialStudents } = activeFilters;
  let results: BgmEntry[] = [];

  if ([...general, ...mainStories, ...eventStories, ...favorStudents, ...memorialStudents].length > 0) {
    results = allBgm.filter((bgm) => bgm.xref.some((xref) => xrefMatchesFilters(xref, activeFilters)));
  }

  if (searchTerm) {
    results = results.filter(
      (bgm) =>
        matcher(bgm.id, searchTerm) ||
        (bgm.title ? matcher(bgm.title, searchTerm) : false) ||
        (bgm.composer ? matcher(bgm.composer, searchTerm) : false) ||
        (xrefText !== undefined && bgm.xref.some((xref) => xrefMatchesFilters(xref, activeFilters) && matcher(xrefText(xref, bgm), searchTerm))),
    );
  }

  if (idRange.min !== null || idRange.max !== null) {
    results = results.filter((bgm) => {
      const id = leadingBgmNumber(bgm.id);
      if (id === null) return false;
      return (idRange.min === null || id >= idRange.min) && (idRange.max === null || id <= idRange.max);
    });
  }

  results.sort((a, b) => compareBgmId(a.id, b.id, sortOrder));

  return results;
}
