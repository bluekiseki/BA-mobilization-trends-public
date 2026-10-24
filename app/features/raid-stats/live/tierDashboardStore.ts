import { create } from 'zustand';

interface TierDashboardState {
  selectedDiffs: string[];
  // Date range as [start, end] indices into `distinctDays`, Python-style: a negative value
  // counts back from the end (`-1` = latest, `-20` = 20th from the end). Storing the end as
  // `-1` keeps the range tracking newly appended snapshots instead of freezing at whatever
  // length the data had when it was last set. Resolve via `resolveDateRange` before indexing.
  dateRangeIndex: [number, number];

  setSelectedDiffs: (diffs: string[]) => void;
  setDateRangeIndex: (range: [number, number]) => void;
}

/**
 * Resolve a stored `dateRangeIndex` into concrete, clamped `[start, end]` indices into an
 * array of `length` items (typically `distinctDays`). Negative values count back from the
 * end (`-1` -> last index, `-20` -> `length - 20`), so a range ending at `-1` always spans
 * to the newest snapshot.
 */
export const resolveDateRange = ([start, end]: [number, number], length: number): [number, number] => {
  const last = Math.max(0, length - 1);
  const at = (v: number) => Math.max(0, Math.min(v < 0 ? length + v : v, last));
  const s = at(start);
  const e = at(end);
  return s <= e ? [s, e] : [e, s];
};

export const useTierDashboardStore = create<TierDashboardState>()(
  // persist(
  (set) => ({
    selectedDiffs: ['Lunatic', 'Torment', 'Insane'], // Default
    dateRangeIndex: [0, -1], // [start, "latest"] — always spans the full data range

    setSelectedDiffs: (diffs) => set({ selectedDiffs: diffs }),
    setDateRangeIndex: (range) => set({ dateRangeIndex: range }),
  }),
);
