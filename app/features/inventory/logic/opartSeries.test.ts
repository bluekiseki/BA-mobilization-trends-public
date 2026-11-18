import { describe, it, expect } from 'vitest';
import { getOpartItemKey, getOpartSeriesBase, listOpartSeriesBases } from './opartSeries';

describe('opartSeries', () => {
  it('maps an item id to its series base', () => {
    expect(getOpartSeriesBase(100)).toBe(100);
    expect(getOpartSeriesBase(103)).toBe(100);
    expect(getOpartSeriesBase(293)).toBe(290);
  });

  it('builds item keys from series base and tier', () => {
    expect(getOpartItemKey(120, 0)).toBe('Item_120');
    expect(getOpartItemKey(120, 3)).toBe('Item_123');
  });

  it('lists distinct series bases in ascending order', () => {
    expect(listOpartSeriesBases([213, 100, 101, 110, 212])).toEqual([100, 110, 210]);
  });
});
