import { describe, expect, it } from 'vitest';
import { iconSheetStyle, type IconSheet } from './iconSheet';

// 3 columns x 2 rows of 10x20 cells -> 30x40 sheet
const sheet: IconSheet = {
  url: '/w/icons/test.webp',
  index: { cell: [10, 20], columns: 3, size: [30, 40], items: { a: [0, 0], b: [10, 0], c: [20, 20], '7': [10, 20] } },
};

describe('iconSheetStyle', () => {
  it('scales the sheet to columns x rows of the element', () => {
    expect(iconSheetStyle(sheet, 'a')).toMatchObject({ backgroundImage: 'url(/w/icons/test.webp)', backgroundSize: '300% 200%' });
  });

  it('converts cell offsets to background-position percentages', () => {
    expect(iconSheetStyle(sheet, 'a')?.backgroundPosition).toBe('0% 0%');
    expect(iconSheetStyle(sheet, 'b')?.backgroundPosition).toBe('50% 0%');
    expect(iconSheetStyle(sheet, 'c')?.backgroundPosition).toBe('100% 100%');
  });

  it('accepts numeric keys', () => {
    expect(iconSheetStyle(sheet, 7)?.backgroundPosition).toBe('50% 100%');
  });

  it('returns null for an unknown key', () => {
    expect(iconSheetStyle(sheet, 'zzz')).toBeNull();
  });

  it('handles a single-cell axis without dividing by zero', () => {
    const one: IconSheet = { url: 'u', index: { cell: [10, 10], columns: 1, size: [10, 10], items: { a: [0, 0] } } };
    expect(iconSheetStyle(one, 'a')?.backgroundPosition).toBe('0% 0%');
  });
});
