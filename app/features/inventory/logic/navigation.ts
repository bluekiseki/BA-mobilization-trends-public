import { NON_BLUEPRINT_EQUIPMENT_KEYS } from '~/utils/groupMaterialNeeds';
import type { ItemType } from '~/utils/itemType';

export interface MatrixNavConfig {
  rows: { key: string }[];
  cols: { key: string }[];
  getItemKey: (rowKey: string, colKey: string) => string | null;
}

export interface NavigableKeysInput {
  groupByStudent: boolean;
  studentGroups: { entries: { key: string }[] }[];
  showMatrix: boolean;
  singleMatrixType: ItemType | undefined;
  filteredEntries: { key: string }[];
  getMatrixConfig: (itemType: ItemType) => MatrixNavConfig | null;
}

/** The item keys Tab / Shift-Tab can step through, in the order the current view shows them. */
export function buildNavigableKeys({ groupByStudent, studentGroups, showMatrix, singleMatrixType, filteredEntries, getMatrixConfig }: NavigableKeysInput): string[] {
  if (groupByStudent) return Array.from(new Set(studentGroups.flatMap((g) => g.entries.map((e) => e.key))));
  if (showMatrix && singleMatrixType !== undefined) {
    const config = getMatrixConfig(singleMatrixType);
    if (!config) return [];
    const keys: string[] = [];
    for (const row of config.rows)
      for (const col of config.cols) {
        const k = config.getItemKey(row.key, col.key);
        if (k) keys.push(k);
      }
    // Equipment also shows a supplementary flat list below the matrix (enhancement stones,
    // unique weapon materials) — include it so Tab/Shift-Tab can reach those items too.
    if (singleMatrixType === 'Equipment') {
      for (const e of filteredEntries) if (NON_BLUEPRINT_EQUIPMENT_KEYS.has(e.key)) keys.push(e.key);
    }
    return keys;
  }
  return filteredEntries.map((e) => e.key);
}
