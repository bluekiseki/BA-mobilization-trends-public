// app/components/heatmap/ChartDataContainer.tsx

import { useMemo, useEffect, memo, lazy, Suspense } from 'react';
import { useShallow } from 'zustand/shallow';
import { useChartControlsStore } from '../../store/chartControlsStore';
import { useDataCache } from '../../utils/cache';
import type { ChartData, GameServer } from '~/types/data';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { RaidUsageStackChart } from './RaidUsageStackChart';

interface ChartDataContainerProps {
  server: GameServer;
}

const DynamicHeatmapChart = lazy(() => import('./HeatmapChart'));

const ChartDataContainer = ({ server }: ChartDataContainerProps) => {
  const { t, i18n } = useTranslation('charts', { keyPrefix: 'heatmap.draw' });
  const locale = i18n.language as Locale;

  const {
    isLoading,
    error,
    chartDataByZ,
    // selectedZValuesArray,
    heatmapMode,
    selectedZValues,
    fetchAndProcessChartData,
    histogramMode,
  } = useChartControlsStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      error: state.error,
      chartDataByZ: state.chartDataByZ,
      // selectedZValuesArray: Array.from(state.selectedZValues),
      heatmapMode: state.heatmapMode,
      selectedZValues: state.selectedZValues,
      fetchAndProcessChartData: state.fetchAndProcessChartData,
      histogramMode: state.histogramMode,
    })),
  );

  const processingParams = useChartControlsStore(
    useShallow((state) => ({
      selectedStudentId: state.selectedStudentId,
      rankWidth: state.rankWidth,
      hideXThreshold: state.hideXThreshold,
      xRange: state.xRange,
      histogramMode: state.histogramMode,
      heatmapMode: state.heatmapMode,
      difficulty: state.difficulty,
    })),
  );
  const fetchAndProcessWithCache = useDataCache<string>();

  useEffect(() => {
    void fetchAndProcessChartData(server, fetchAndProcessWithCache, locale);
  }, [
    fetchAndProcessChartData,
    processingParams.selectedStudentId,
    processingParams.rankWidth,
    processingParams.hideXThreshold,
    processingParams.xRange,
    processingParams.heatmapMode,
    processingParams.histogramMode,
    processingParams.difficulty,
    // xLabels,
    fetchAndProcessWithCache,
  ]);

  // Chart Data Processing Logic
  const aggregatedChartData = useMemo<ChartData | null>(() => {
    if (selectedZValues.size === 0 || chartDataByZ.size === 0) return null;
    const selectedData = Array.from(selectedZValues)
      .map((z) => chartDataByZ.get(z))
      .filter((d): d is ChartData => d !== undefined);
    if (selectedData.length === 0) return null;
    const base: ChartData = JSON.parse(JSON.stringify(selectedData[0])) as ChartData;
    const aggregated: ChartData = base;
    for (let i = 1; i < selectedData.length; i++) {
      const data = selectedData[i];
      for (let r = 0; r < data.heatmap.z.length; r++) {
        for (let c = 0; c < data.heatmap.z[r].length; c++) {
          const currVal = aggregated.heatmap.z[r][c];
          const dataVal = data.heatmap.z[r][c];
          if (currVal !== null && dataVal !== null) {
            aggregated.heatmap.z[r][c] = currVal + dataVal;
          }
        }
      }
      data.topBar.values.forEach((val, j) => (aggregated.topBar.values[j] += val));
      data.rightBar.values.forEach((val, j) => (aggregated.rightBar.values[j] += val));
    }
    return aggregated;
    // }, [selectedZValues, chartDataByZ]);
  }, [selectedZValues, chartDataByZ]);

  const layout = useMemo((): Partial<Plotly.Layout> => {
    return {
      autosize: true,
      xaxis: { domain: [0, 0.83], automargin: true }, // tickangle:(0), tickmode: 'auto'
      yaxis: { domain: [0, 0.83], automargin: true, autorange: 'reversed' },
      xaxis2: { domain: [0, 0.83], anchor: 'y2', showticklabels: false },
      yaxis2: { domain: [0.85, 1] },
      xaxis3: { domain: [0.85, 1] },
      yaxis3: { domain: [0, 0.83], anchor: 'x3', showticklabels: false },
      showlegend: false,
      margin: {
        l: 0,
        r: 0,
        t: 40,
        b: 0,
      },
    };
  }, []);

  const getAvgV = (x: string) => {
    const [a, b] = x.split('-').map((v) => parseInt(v));
    return ((a + b - 1) / 2) | 0;
  };

  const heatmapData = useMemo((): Partial<Plotly.Data> => {
    if (!aggregatedChartData) return {};
    const data: Partial<Plotly.Data> = {
      x: aggregatedChartData.heatmap.x,
      y: aggregatedChartData.heatmap.y.map((v) => getAvgV(v)),
      z: aggregatedChartData.heatmap.z,
      customdata: aggregatedChartData.heatmap.y.map((y) => aggregatedChartData.heatmap.x_show.map((x) => `<b>${x}</b><br>${t(`rank`)} ${y}`)),
      type: 'heatmap',
      colorscale: 'Portland',
      hoverongaps: false,
      hovertemplate: '%{customdata}<br>' + '→ %{z}%',
      showscale: false,
      yaxis: 'rank',
    };
    if (heatmapMode === 'percent') {
      data.zmin = 0;
      data.zmax = 100;
    }
    return data;
  }, [aggregatedChartData, heatmapMode]);

  const chartComponent = useMemo(() => {
    return (
      <Suspense fallback={null}>
        <DynamicHeatmapChart isLoading={isLoading} error={error} aggregatedChartData={aggregatedChartData} layout={layout} heatmapData={heatmapData} unit={t(`unit.${histogramMode}`)} />
      </Suspense>
    );
  }, [isLoading, error, aggregatedChartData, layout, heatmapData]);

  // final chart component rendering
  return (
    <div data-component-name="ChartDataContainer">
      <div className="md-4">
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 transition-colors duration-300">{t('desp_chart')}</p>
      </div>
      {chartComponent}

      {!isLoading && processingParams.selectedStudentId && (
        <div className="mt-10 pt-8 border-t border-neutral-200 dark:border-neutral-700">
          <RaidUsageStackChart />
        </div>
      )}
    </div>
  );
};

export default memo(ChartDataContainer);
