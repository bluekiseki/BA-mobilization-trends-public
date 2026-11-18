import { describe, expect, it } from 'vitest';
import type { BgmEntry } from '~/features/jukebox/BgmItem';
import { compareBgmId, filterBgm, parseIdBound, xrefMatchesFilters, type ActiveFilters } from './jukeboxFilters';

const entry = (id: string): BgmEntry => ({ id, youtube_url: `https://www.youtube.com/watch?v=${id}`, xref: [{ type: 'UI', title: 'ui' }] });

const allBgm = ['1', '199', '200', '250', '300', '301', '316_Light', '11055', 'BlueNewWorld'].map(entry);
const activeFilters: ActiveFilters = { general: ['Other'], mainStories: [], eventStories: [], favorStudents: [], memorialStudents: [] };
const matcher = (target: string, query: string) => target.includes(query);

const run = (idRange: { min: number | null; max: number | null }, sortOrder: 'ascending' | 'descending' = 'ascending') =>
  filterBgm({ allBgm, activeFilters, searchTerm: '', idRange, sortOrder, matcher }).map((bgm) => bgm.id);

describe('parseIdBound', () => {
  it('treats empty or invalid input as no bound', () => {
    expect(parseIdBound('')).toBeNull();
    expect(parseIdBound('  ')).toBeNull();
    expect(parseIdBound('abc')).toBeNull();
  });

  it('parses a number', () => {
    expect(parseIdBound('200')).toBe(200);
  });
});

describe('filterBgm id range', () => {
  it('keeps every entry when no bound is set', () => {
    expect(run({ min: null, max: null })).toHaveLength(allBgm.length);
  });

  it('keeps entries inside the inclusive range and drops non-numeric ids', () => {
    expect(run({ min: 200, max: 300 })).toEqual(['200', '250', '300']);
  });

  it('supports open-ended bounds', () => {
    expect(run({ min: 300, max: null })).toEqual(['300', '301', '316_Light', '11055']);
    expect(run({ min: null, max: 199 })).toEqual(['1', '199']);
  });

  it('uses the leading number of an id such as 316_Light and drops ids without one', () => {
    expect(run({ min: 310, max: 320 })).toEqual(['316_Light']);
    expect(run({ min: 0, max: 99999 })).not.toContain('BlueNewWorld');
  });

  it('treats ids of 10000 and up as plain numbers', () => {
    expect(run({ min: 10000, max: 20000 })).toEqual(['11055']);
  });

  it('respects the sort order', () => {
    expect(run({ min: 200, max: 300 }, 'descending')).toEqual(['300', '250', '200']);
  });
});

describe('filterBgm search over xrefs', () => {
  const withXref: BgmEntry[] = [
    { id: '1', xref: [{ type: 'UI', title: 'ui' }] },
    { id: '2', xref: [{ type: 'Main_Story', title: 'ch1' }] },
  ];
  const xrefText = (xref: { type: string }) => (xref.type === 'UI' ? 'Lobby theme' : 'Secret chapter');
  const search = (activeFilters: ActiveFilters) =>
    filterBgm({ allBgm: withXref, activeFilters, searchTerm: 'Secret', idRange: { min: null, max: null }, sortOrder: 'ascending', matcher, xrefText }).map((bgm) => bgm.id);

  it('finds a track by the text of an xref that the active filters allow', () => {
    expect(search({ ...activeFilters, general: ['Other'], mainStories: ['ch1'] })).toEqual(['2']);
  });

  it('does not search xrefs that are not allowed, so hidden spoilers stay hidden', () => {
    expect(search({ ...activeFilters, general: ['Other'], mainStories: [] })).toEqual([]);
  });
});

describe('filterBgm UI usages of an event', () => {
  const eventUi: BgmEntry[] = [{ id: '1', xref: [{ type: 'UI', title: 'minigame', event: '58' }] }];
  const run = (eventStories: string[]) =>
    filterBgm({ allBgm: eventUi, activeFilters: { ...activeFilters, general: [], eventStories }, searchTerm: '', idRange: { min: null, max: null }, sortOrder: 'ascending', matcher }).map(
      (bgm) => bgm.id,
    );

  it('lists the track when only that event is selected', () => {
    expect(run(['58'])).toEqual(['1']);
    expect(run(['57'])).toEqual([]);
  });

  it('counts the UI usage as matching that event, so its line is shown', () => {
    expect(xrefMatchesFilters(eventUi[0].xref[0], { ...activeFilters, general: [], eventStories: ['58'] })).toBe(true);
    expect(xrefMatchesFilters(eventUi[0].xref[0], { ...activeFilters, general: [], eventStories: [] })).toBe(false);
  });
});

describe('compareBgmId', () => {
  const sorted = (ids: string[], order: 'ascending' | 'descending') => [...ids].sort((a, b) => compareBgmId(a, b, order));
  const ids = ['BlueNewWorld', '319', '11055', '316_Light', '318', '316', 'ClearMorning', '2'];

  it('sorts by number with unnumbered ids last', () => {
    expect(sorted(ids, 'ascending')).toEqual(['2', '316', '316_Light', '318', '319', '11055', 'BlueNewWorld', 'ClearMorning']);
  });

  it('keeps unnumbered ids last when descending', () => {
    expect(sorted(ids, 'descending')).toEqual(['11055', '319', '318', '316_Light', '316', '2', 'BlueNewWorld', 'ClearMorning']);
  });
});
