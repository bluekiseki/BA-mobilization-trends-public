import { makeInstanceKey, type ScanEntry } from '../core/types';

export function aggregateConfirmedQuantities(entries: ScanEntry[], confirmedItems: Record<string, boolean>, editedValues: Record<string, number>): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const entry of entries) {
    const fileTotals = new Map<string, number>();
    entry.results.forEach((result, index) => {
      const instanceKey = makeInstanceKey(entry.id, index);
      if (!result.icon || !confirmedItems[instanceKey]) return;
      const key = result.icon.inventoryKey;
      // Limited-time and regular 10-recruitment tickets can share the same recognized item ID.
      // Sum distinct cells within one photo/video to include both holdings.
      fileTotals.set(key, (fileTotals.get(key) ?? 0) + (editedValues[instanceKey] ?? result.quantity));
    });
    for (const [key, total] of fileTotals) {
      // Different files may show the same inventory again; keep the largest file total.
      quantities.set(key, Math.max(quantities.get(key) ?? 0, total));
    }
  }
  return quantities;
}
