import { makeInstanceKey, type IconEntry, type ScanEntry } from '../core/types';

/**
 * Gifts, eleph and base OOParts (not selection tickets) are listed as separate stacks of the same item,
 * so their cells within one file add up. Everything else seen twice is the same holding captured twice.
 */
export function sumsDuplicateStacks(icon: IconEntry): boolean {
  if (icon.isGift || icon.itemCategory === 2) return true;
  const id = Number(icon.numericId);
  return icon.inventoryKey.startsWith('Item_') && icon.itemCategory === 3 && id >= 100 && id <= 299;
}

export interface AggregatedQuantity {
  total: number;
  /** Per-cell quantities of the winning file, in scan order; more than one entry means the item appeared on several cells. */
  parts: number[];
  mode: 'sum' | 'max';
}

export function aggregateConfirmedDetails(entries: ScanEntry[], confirmedItems: Record<string, boolean>, editedValues: Record<string, number>): Map<string, AggregatedQuantity> {
  const details = new Map<string, AggregatedQuantity>();
  for (const entry of entries) {
    const fileParts = new Map<string, { parts: number[]; mode: AggregatedQuantity['mode'] }>();
    entry.results.forEach((result, index) => {
      const instanceKey = makeInstanceKey(entry.id, index);
      if (!result.icon || !confirmedItems[instanceKey]) return;
      const key = result.icon.inventoryKey;
      const group = fileParts.get(key) ?? { parts: [], mode: sumsDuplicateStacks(result.icon) ? 'sum' : 'max' };
      group.parts.push(editedValues[instanceKey] ?? result.quantity);
      fileParts.set(key, group);
    });
    for (const [key, { parts, mode }] of fileParts) {
      const total = mode === 'sum' ? parts.reduce((a, b) => a + b, 0) : Math.max(...parts);
      // Different files may show the same inventory again; keep the largest file total.
      if (total > (details.get(key)?.total ?? -1)) details.set(key, { total, parts, mode });
    }
  }
  return details;
}

export function aggregateConfirmedQuantities(entries: ScanEntry[], confirmedItems: Record<string, boolean>, editedValues: Record<string, number>): Map<string, number> {
  return new Map([...aggregateConfirmedDetails(entries, confirmedItems, editedValues)].map(([key, { total }]) => [key, total]));
}
