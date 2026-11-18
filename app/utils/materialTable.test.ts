import { describe, expect, it } from 'vitest';
import type { ItemIncome } from '~/utils/itemOutlook';
import { buildMaterialRow, buildMaterialRows } from './materialTable';

const income = (kind: ItemIncome['kind'], date: string, amount: number, id = `${kind}-${date}`): ItemIncome => ({ id, kind, name: id, date, amount, prediction: false });

describe('buildMaterialRow', () => {
  it('sums income and splits it by source in display order', () => {
    const row = buildMaterialRow('Item_1', 100, 10, [income('raid', '2026-01-02', 5), income('event', '2026-01-09', 20), income('event', '2026-01-03', 10)]);
    expect(row.obtainable).toBe(35);
    expect(row.sources.map((s) => s.kind)).toEqual(['event', 'raid']);
    expect(row.sources[0].total).toBe(30);
    expect(row.sources[0].entries.map((e) => e.date)).toEqual(['2026-01-03', '2026-01-09']);
  });

  it('never reports a negative deficit', () => {
    const row = buildMaterialRow('Item_1', 10, 50, undefined);
    expect(row.deficit).toBe(0);
    expect(row.covered).toBe(false);
    expect(row.sources).toEqual([]);
  });

  it('marks a deficit covered when income is enough', () => {
    expect(buildMaterialRow('Item_1', 100, 60, [income('event', '2026-01-03', 40)]).covered).toBe(true);
    expect(buildMaterialRow('Item_1', 100, 60, [income('event', '2026-01-03', 39)]).covered).toBe(false);
  });
});

describe('buildMaterialRows', () => {
  it('skips items without a goal and sorts by id', () => {
    const rows = buildMaterialRows({ needs: { Item_20: 5, Item_3: 1, Item_9: 0 }, inventory: { Item_3: 4 } });
    expect(rows.map((r) => r.key)).toEqual(['Item_3', 'Item_20']);
    expect(rows[0].current).toBe(4);
  });
});
