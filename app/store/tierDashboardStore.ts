import { create } from 'zustand';

interface TierDashboardState {
  selectedDiffs: string[];
  // We store indices for the date range (start index, end index)
  dateRangeIndex: [number, number];

  setSelectedDiffs: (diffs: string[]) => void;
  setDateRangeIndex: (range: [number, number]) => void;
}

export const useTierDashboardStore = create<TierDashboardState>()(
  // persist(
  (set) => ({
    selectedDiffs: ['Lunatic', 'Torment', 'Insane'], // Default
    dateRangeIndex: [0, 10000], // Default to a wide range, will be clamped by actual data

    setSelectedDiffs: (diffs) => set({ selectedDiffs: diffs }),
    setDateRangeIndex: (range) => set({ dateRangeIndex: range }),
  }),
  //   {
  //     name: 'tier-dashboard-storage', // unique name for localStorage
  //   }
  // )
);
