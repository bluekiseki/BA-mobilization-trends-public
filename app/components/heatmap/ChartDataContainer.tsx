import { useMemo, useEffect, memo } from 'react';
import dynamic from 'next/dynamic';
import { useShallow } from 'zustand/shallow';
import { useChartControlsStore } from '../../store/chartControlsStore';
// import { useChartDataProcessor } from '../hooks/useChartDataProcessor';
import { ChartData, RaidInfo } from '../../types/data';
import { useDataCache } from '../../utils/cache';

interface ChartDataContainerProps {
    // students: Record<string, Student>;
    xLabels: RaidInfo[];
    // maxLvJson: Record<number, number>;
}

const DynamicHeatmapChart = dynamic(() => import('./HeatmapChart'), {
    ssr: false,
    loading: () => <p>Loading Chart...</p>,
});

const ChartDataContainer = ({ xLabels }: ChartDataContainerProps) => {
    console.log('ChartDataContainer is rendering...');

    const {
        isLoading,
        error,
        chartDataByZ,
        // selectedZValuesArray,
        heatmapMode,
        selectedZValues,
        fetchAndProcessChartData
    } = useChartControlsStore(
        useShallow(state => ({
            isLoading: state.isLoading,
            error: state.error,
            chartDataByZ: state.chartDataByZ,
            // selectedZValuesArray: Array.from(state.selectedZValues),
            heatmapMode: state.heatmapMode,
            selectedZValues: state.selectedZValues,
            fetchAndProcessChartData: state.fetchAndProcessChartData
        }))
    );


    const processingParams = useChartControlsStore(useShallow(state => ({
        selectedStudentId: state.selectedStudentId,
        rankWidth: state.rankWidth,
        hideXThreshold: state.hideXThreshold,
        xRange: state.xRange,
        histogramMode: state.histogramMode,
        heatmapMode: state.heatmapMode,
        diffculty: state.diffculty
    })));
    const fetchAndProcessWithCache = useDataCache<string>();


    useEffect(() => {
        fetchAndProcessChartData(fetchAndProcessWithCache, xLabels)
    }, [
        fetchAndProcessChartData, 
        processingParams.selectedStudentId,
        processingParams.rankWidth,
        processingParams.hideXThreshold,
        processingParams.xRange,
        processingParams.heatmapMode,
        processingParams.histogramMode,
        processingParams.diffculty,
        xLabels, 
        fetchAndProcessWithCache
    ]);


    // Chart Data Processing Logic
    const aggregatedChartData = useMemo<ChartData | null>(() => {
        if (selectedZValues.size === 0 || chartDataByZ.size === 0) return null;
        const selectedData = Array.from(selectedZValues)
            .map(z => chartDataByZ.get(z))
            .filter((d): d is ChartData => d !== undefined);
        if (selectedData.length === 0) return null;
        const base = JSON.parse(JSON.stringify(selectedData[0]));
        const aggregated: ChartData = base;
        for (let i = 1; i < selectedData.length; i++) {
            const data = selectedData[i];
            for (let r = 0; r < data.heatmap.z.length; r++) {
                for (let c = 0; c < data.heatmap.z[r].length; c++) {
                    if (aggregated.heatmap.z[r][c] !== null && data.heatmap.z[r][c] !== null) {
                        (aggregated.heatmap.z[r][c] as number) += data.heatmap.z[r][c]!;
                    }
                }
            }
            data.topBar.values.forEach((val, j) => aggregated.topBar.values[j] += val);
            data.rightBar.values.forEach((val, j) => aggregated.rightBar.values[j] += val);
        }
        return aggregated;
    // }, [selectedZValues, chartDataByZ]);
    }, [selectedZValues, chartDataByZ]);

    const layout = useMemo((): Partial<Plotly.Layout> => {
        console.log('Calculating layout...');
        return {
            autosize: true,
            xaxis: { domain: [0, 0.83], automargin: true },
            yaxis: { domain: [0, 0.83], automargin: true },
            xaxis2: { domain: [0, 0.83], anchor: 'y2', showticklabels: false },
            yaxis2: { domain: [0.85, 1] },
            xaxis3: { domain: [0.85, 1] },
            yaxis3: { domain: [0, 0.83], anchor: 'x3', showticklabels: false },
            showlegend: false,
        };
    }, []);

    function transposeMatrix(matrix:(number | null)[][]) {
        if (!matrix || matrix.length === 0 || matrix[0].length === 0) {
          return [];
        }
      
        const rows = matrix.length;
        const cols = matrix[0].length;
        const transposed = new Array(cols).fill(null).map(() => new Array(rows));
      
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            transposed[j][i] = matrix[i][j];
          }
        }
      
        return transposed;
      }
      

    const heatmapData = useMemo((): Partial<Plotly.Data> => {
        // console.log('Calculating heatmapData...');
        if (!aggregatedChartData) return {};
        const data: Partial<Plotly.Data> = {
            x: aggregatedChartData.heatmap.x,
            y: aggregatedChartData.heatmap.y,
            z: aggregatedChartData.heatmap.z,
            type: 'heatmap',
            colorscale: 'Portland',
            hoverongaps: false,
        };
        if (heatmapMode === 'percent') {
            data.zmin = 0;
            data.zmax = 100;
        }
        return data;
    }, [aggregatedChartData, heatmapMode]);


    const chartComponent = useMemo(() => {
        // console.log('Memoizing chart component itself...');
        return (
            <DynamicHeatmapChart
                isLoading={isLoading}
                error={error}
                aggregatedChartData={aggregatedChartData}
                layout={layout}
                heatmapData={heatmapData}
            />
        );
    }, [isLoading, error, aggregatedChartData, layout, heatmapData]);


    // final chart component rendering
    return (
        <div>
            {chartComponent}
        </div>
    );
};

export default memo(ChartDataContainer);