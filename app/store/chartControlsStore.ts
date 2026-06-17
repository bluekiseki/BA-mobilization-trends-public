import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { DifficultySelect } from '~/components/raid/Difficulty';
import type { ChartData, GameServer, RaidInfo, RaidInfoFiltered } from '~/types/data';
import type { fetchCacheProcessor } from '~/utils/cache';
import { getRawTsvData, processChartData } from '~/utils/chartDataProcessor';
import type { Locale } from '~/utils/i18n/config';

interface State {
  selectedStudentId: number;
  selectedZValues: Set<number>;
  rankWidth: number;
  heatmapMode: 'percent' | 'absolute';
  histogramMode: 'percent' | 'absolute';
  hideXThreshold: number;
  xRange: [number, number];
  fullXRange: [number, number];
  availableZValueCounter: Map<number, number>;
  isLoading: boolean;
  chartDataByZ: Map<number, ChartData>;
  error: string | null;
  difficulty: DifficultySelect;
  raidInfo: RaidInfo[];
}

interface Actions {
  setSelectedStudentId: (id: number) => void;
  handleZSelectionChange: (z: number) => void;
  setSelectedZValues: (zs: number[]) => void;
  setRankWidth: (width: number) => void;
  setHeatmapMode: (mode: 'percent' | 'absolute') => void;
  setHistogramMode: (mode: 'percent' | 'absolute') => void;
  setHideXThreshold: (threshold: number) => void;
  setXRange: (range: [number, number]) => void;
  setDifficulty: (difficulty: DifficultySelect) => void;
  fetchAndProcessChartData: (server: GameServer, fetchAndProcessWithCache: fetchCacheProcessor<string>, locale: Locale) => Promise<void>;
  getFilteredRaidInfoByDifficulty: () => RaidInfoFiltered[];
  setRaidInfo: (raidInfo: RaidInfo[]) => void;
}

// Sets the initial state.
const initialState: State = {
  selectedStudentId: 10000, //20008 1st,
  selectedZValues: new Set(),
  rankWidth: 200,
  heatmapMode: 'absolute',
  histogramMode: 'absolute',
  hideXThreshold: 0,
  xRange: [0, 150],
  fullXRange: [0, 150],
  availableZValueCounter: new Map<number, number>(),
  isLoading: false,
  chartDataByZ: new Map(),
  error: null,
  difficulty: 'All',
  raidInfo: [],
};

// Create Store
export const useChartControlsStore = create<State & Actions>()(
  devtools((set, get) => ({
    ...initialState,

    setSelectedStudentId: (id) => set({ selectedStudentId: id }),
    setRankWidth: (width) => set({ rankWidth: width }),
    setHeatmapMode: (mode) => set({ heatmapMode: mode }),
    setHistogramMode: (mode) => set({ histogramMode: mode }),
    setHideXThreshold: (threshold) => set({ hideXThreshold: threshold }),
    setXRange: (range) => set({ xRange: range }),
    setDifficulty: (difficulty) => set({ difficulty: difficulty }),
    handleZSelectionChange: (z) =>
      set((state) => {
        const newSet = new Set(state.selectedZValues);
        if (newSet.has(z)) {
          newSet.delete(z);
        } else {
          newSet.add(z);
        }
        return { selectedZValues: newSet };
      }),
    setSelectedZValues: (zs) =>
      set(() => {
        const newSet = new Set(zs);
        return { selectedZValues: newSet };
      }),
    getFilteredRaidInfoByDifficulty: () => {
      const { raidInfo, difficulty } = get();
      return raidInfo
        .map((raid, index) => ({ ...raid, index }))
        .filter((raidInfo) => {
          if (difficulty == 'All') return true;
          return difficulty in raidInfo.Cnt;
        });
    },
    setRaidInfo: (raidInfo: RaidInfo[]) => {
      set({ raidInfo });
    },
    fetchAndProcessChartData: async (server, fetchAndProcessWithCache, locale) => {
      const { selectedStudentId, rankWidth, hideXThreshold, xRange, heatmapMode, histogramMode, difficulty, getFilteredRaidInfoByDifficulty } = get();

      const xLabels = getFilteredRaidInfoByDifficulty();

      if (!selectedStudentId) {
        set({ isLoading: false, chartDataByZ: new Map() });
        return;
      }

      set({ isLoading: true, error: null });

      const rawTsvData = await getRawTsvData(server, selectedStudentId, fetchAndProcessWithCache);

      try {
        const result = processChartData({
          rankWidth,
          hideXThreshold,
          xRange,
          heatmapMode,
          histogramMode,
          difficulty,
          xLabels,
          rawTsvData,
          locale,
        });

        // Update processing results to store status
        set({
          isLoading: false,
          chartDataByZ: result.chartDataByZ,
          availableZValueCounter: result.availableZValueCounter,
          fullXRange: result.fullXRange,
        });
      } catch (e) {
        set({ isLoading: false, error: (e as Error).message });
      }
    },
  })),
);
