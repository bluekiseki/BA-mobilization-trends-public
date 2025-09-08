import { processChartData } from '@/app/utils/chartDataProcessor';
import { create } from 'zustand';
import { fetchCacheProcessor } from '../utils/cache';
import { ChartData, RaidInfo } from '../types/data';
import { devtools } from 'zustand/middleware';
import { DifficultySelect } from '../components/Difficulty';

interface State {
  selectedStudentId: number;
  selectedZValues: Set<number>;
  rankWidth: number;
  heatmapMode: 'percent' | 'absolute';
  histogramMode: 'percent' | 'absolute';
  hideXThreshold: number;
  xRange: [number, number];
  fullXRange: [number, number];
  availableZValues: Set<number>;
  isLoading: boolean;
  chartDataByZ: Map<number, ChartData>;
  error: string|null;
  diffculty: DifficultySelect;
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
  setDiffculty: (diffculty:DifficultySelect) => void;
  fetchAndProcessChartData: (fetchAndProcessWithCache: fetchCacheProcessor<string>, xLabels:RaidInfo[])=> Promise<void>;
}

// Sets the initial state.
const initialState: State = {
  selectedStudentId: 20008,
  selectedZValues: new Set(),
  rankWidth: 500,
  heatmapMode: 'absolute',
  histogramMode: 'absolute',
  hideXThreshold: 1000,
  xRange: [0, 150],
  fullXRange: [0, 150],
  availableZValues: new Set(),
  isLoading: false,
  chartDataByZ: new Map(),
  error: null,
  diffculty: 'All'
};

// Create Store
export const useChartControlsStore = create<State & Actions>()(devtools(
  (set, get) => ({
  ...initialState,

  setSelectedStudentId: (id) => set({ selectedStudentId: id }),
  setRankWidth: (width) => set({ rankWidth: width }),
  setHeatmapMode: (mode) => set({ heatmapMode: mode }),
  setHistogramMode: (mode) => set({ histogramMode: mode }),
  setHideXThreshold: (threshold) => set({ hideXThreshold: threshold }),
  setXRange: (range) => set({ xRange: range }),
  setDiffculty: (diffculty) => set({ diffculty: diffculty }),
  
  handleZSelectionChange: (z) => set((state) => {
    const newSet = new Set(state.selectedZValues);
    if (newSet.has(z)) {
      newSet.delete(z);
    } else {
      newSet.add(z);
    }
    return { selectedZValues: newSet };
  }),
  setSelectedZValues: (zs)=>set(() => {
    const newSet = new Set(zs);
    return { selectedZValues: newSet };
  }),
  fetchAndProcessChartData: async (fetchAndProcessWithCache, xLabels) => {
    const {
        selectedStudentId,
        rankWidth,
        hideXThreshold,
        xRange,
        heatmapMode,
        histogramMode,
        diffculty
    } = get();

    if (!selectedStudentId) {
        set({ isLoading: false, chartDataByZ: new Map() });
        return;
    }

    set({ isLoading: true, error: null });

    try {
        const result = await processChartData({
            selectedStudentId,
            rankWidth,
            hideXThreshold,
            xRange,
            heatmapMode,
            histogramMode,
            diffculty,
            xLabels,
            fetchAndProcessWithCache: fetchAndProcessWithCache
        });

        // Update processing results to store status
        set({
            isLoading: false,
            chartDataByZ: result.chartDataByZ,
            availableZValues: result.availableZValues,
            fullXRange: result.fullXRange,
        });

    } catch (e) {
        set({ isLoading: false, error: (e as Error).message });
    }
  }
})));