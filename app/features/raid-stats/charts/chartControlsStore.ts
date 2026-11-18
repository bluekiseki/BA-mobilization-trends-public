import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { difficultyInfo, type DifficultySelect } from '~/utils/difficultyPolicy';
import type { ChartData, GameServer, RaidInfo, RaidInfoFiltered } from '~/types/data';
import type { fetchCacheProcessor } from '~/hooks/cache';
import type { ColumnTable } from '~/utils/columnTable';
import { getStudentTablesForCombatStyleView, processChartData } from '~/features/raid-stats/charts/chartDataProcessor';
import type { Locale } from '~/utils/i18n/config';
import { matchesBossType, type BossTypeSelect } from './bossType';

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
  selectedDifficulties: Set<DifficultySelect>;
  selectedBossTypes: Set<BossTypeSelect>;
  raidInfo: RaidInfo[];
  combatStyleViewMode: 'separate' | 'combined';
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
  setSelectedDifficulties: (difficulties: Set<DifficultySelect>) => void;
  setSelectedBossTypes: (types: Set<BossTypeSelect>) => void;
  setCombatStyleViewMode: (mode: 'separate' | 'combined') => void;
  fetchAndProcessChartData: (server: GameServer, fetchAndProcessWithCache: fetchCacheProcessor<ColumnTable>, locale: Locale) => Promise<void>;
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
  xRange: [0, 999],
  fullXRange: [0, 999],
  availableZValueCounter: new Map<number, number>(),
  isLoading: false,
  chartDataByZ: new Map(),
  error: null,
  selectedDifficulties: new Set(['All']),
  selectedBossTypes: new Set(['All']),
  raidInfo: [],
  combatStyleViewMode: 'combined',
};

// Monotonic id of the latest chart request; older responses are discarded
let latestRequestId = 0;

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
    setSelectedDifficulties: (difficulties) => set({ selectedDifficulties: difficulties }),
    setSelectedBossTypes: (types) => set({ selectedBossTypes: types }),
    setCombatStyleViewMode: (mode) => set({ combatStyleViewMode: mode }),
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
      const { raidInfo, selectedDifficulties, selectedBossTypes } = get();
      const difficultiesToShow = selectedDifficulties.has('All') ? new Set(difficultyInfo.filter((d) => d.name !== 'Extreme').map((d) => d.name)) : selectedDifficulties;
      return raidInfo
        .map((raid, index) => ({ ...raid, index }))
        .filter((raidInfo) => {
          if (!matchesBossType(raidInfo, selectedBossTypes)) return false;
          for (const difficulty of difficultiesToShow) {
            if (difficulty in raidInfo.Cnt) return true;
          }
          return false;
        });
    },
    setRaidInfo: (raidInfo: RaidInfo[]) => {
      set({ raidInfo });
    },
    fetchAndProcessChartData: async (server, fetchAndProcessWithCache, locale) => {
      const { selectedStudentId, rankWidth, hideXThreshold, xRange, heatmapMode, histogramMode, selectedDifficulties, combatStyleViewMode, getFilteredRaidInfoByDifficulty } = get();

      const xLabels = getFilteredRaidInfoByDifficulty();

      const requestId = ++latestRequestId;

      if (!selectedStudentId) {
        set({ isLoading: false, chartDataByZ: new Map() });
        return;
      }

      set({ isLoading: true, error: null });

      try {
        const tables = await getStudentTablesForCombatStyleView(server, selectedStudentId, combatStyleViewMode, fetchAndProcessWithCache);
        if (requestId !== latestRequestId) return;

        const result = processChartData({
          rankWidth,
          hideXThreshold,
          xRange,
          heatmapMode,
          histogramMode,
          selectedDifficulties,
          xLabels,
          tables,
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
        if (requestId !== latestRequestId) return;
        set({ isLoading: false, error: (e as Error).message });
      }
    },
  })),
);
