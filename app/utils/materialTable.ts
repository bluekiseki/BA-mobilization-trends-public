import { isCoveredByIncome, type IncomeByKey, type IncomeKind, type ItemIncome } from '~/utils/itemOutlook';

/** Display order of the income sources inside a material table. */
export const INCOME_KIND_ORDER: readonly IncomeKind[] = ['event', 'eventFixed', 'raid', 'eraid', 'multifloor', 'coinShop'];

export interface MaterialSourceGroup {
  kind: IncomeKind;
  total: number;
  /** Individual acquisitions, oldest first. */
  entries: ItemIncome[];
}

export interface MaterialRow {
  key: string;
  current: number;
  goal: number;
  /** Sum of every expected acquisition. */
  obtainable: number;
  /** goal - current, never negative. */
  deficit: number;
  /** The deficit is fully covered by the expected income. */
  covered: boolean;
  sources: MaterialSourceGroup[];
}

interface BuildMaterialRowsOptions {
  needs: Record<string, number>;
  inventory: Record<string, number>;
  incomeByKey?: IncomeByKey;
}

function itemId(key: string): number {
  return parseInt(key.split('_')[1] ?? '0', 10);
}

export function buildMaterialRow(key: string, goal: number, current: number, income: ItemIncome[] | undefined): MaterialRow {
  const grouped = new Map<IncomeKind, ItemIncome[]>();
  for (const entry of income ?? []) {
    const list = grouped.get(entry.kind);
    if (list) list.push(entry);
    else grouped.set(entry.kind, [entry]);
  }
  const sources: MaterialSourceGroup[] = INCOME_KIND_ORDER.flatMap((kind) => {
    const list = grouped.get(kind);
    if (!list) return [];
    const entries = [...list].sort((a, b) => a.date.localeCompare(b.date));
    return [{ kind, total: entries.reduce((sum, entry) => sum + entry.amount, 0), entries }];
  });
  const deficit = Math.max(0, goal - current);
  return {
    key,
    current,
    goal,
    obtainable: sources.reduce((sum, source) => sum + source.total, 0),
    deficit,
    covered: deficit > 0 && isCoveredByIncome(goal - current, income),
    sources,
  };
}

/** One row per item that has a goal, ordered by item id. */
export function buildMaterialRows({ needs, inventory, incomeByKey }: BuildMaterialRowsOptions): MaterialRow[] {
  return Object.entries(needs)
    .filter(([, goal]) => goal > 0)
    .map(([key, goal]) => buildMaterialRow(key, goal, inventory[key] ?? 0, incomeByKey?.[key]))
    .sort((a, b) => itemId(a.key) - itemId(b.key));
}
