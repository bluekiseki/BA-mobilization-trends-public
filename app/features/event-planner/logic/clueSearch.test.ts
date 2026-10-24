import { describe, it, expect, vi } from 'vitest';
import { getClueSearchCostModel, searchesForFragments } from '~/features/event-planner/logic/clueSearch';
import { getLoadedEvent, loadEventsFromCdn } from './loadEventsFromCdn';

vi.hoisted(() => vi.stubEnv('VITE_USE_CDN', 'true'));

const events = await loadEventsFromCdn([857, 863]);

const loadEvent = (id: number) => getLoadedEvent(events, id);

describe('searchesForFragments', () => {
  it('counts one bonus fragment per 4 searches', () => {
    expect(searchesForFragments(0, 4)).toBe(0);
    expect(searchesForFragments(1, 4)).toBe(1);
    expect(searchesForFragments(4, 4)).toBe(4);
    expect(searchesForFragments(5, 4)).toBe(4);
    expect(searchesForFragments(6, 4)).toBe(5);
    expect(searchesForFragments(15, 4)).toBe(12);
    expect(searchesForFragments(145, 4)).toBe(116);
  });

  it('falls back to one search per fragment without inspiration', () => {
    expect(searchesForFragments(7, 0)).toBe(7);
  });
});

describe('getClueSearchCostModel', () => {
  it('event 857 (shop-purchase clues) has no search model', () => {
    const clue = loadEvent(857).clue;
    if (!clue) throw new Error('857 should have clue data');
    expect(getClueSearchCostModel(clue)).toBeNull();
  });

  it('event 863 searches cost 100 Item_80890 with 4-point inspiration', () => {
    const clue = loadEvent(863).clue;
    if (!clue) throw new Error('863 should have clue data');
    expect(getClueSearchCostModel(clue)).toEqual({ costKey: 'Item_80890', costPerSearch: 100, inspirationConvertCount: 4 });
  });
});
