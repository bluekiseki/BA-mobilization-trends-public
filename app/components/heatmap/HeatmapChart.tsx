import Plot from 'react-plotly.js';
import { ChartData } from '../../types/data';
import { useTranslations } from 'next-intl';

interface HeatmapChartProps {
  isLoading: boolean;
  error: string | null;
  aggregatedChartData: ChartData | null;
  layout: Partial<Plotly.Layout>;
  heatmapData: Partial<Plotly.Data>;
}

const HeatmapChart = ({ 
  isLoading, 
  error, 
  aggregatedChartData,
  layout,
  heatmapData
}: HeatmapChartProps) => {
  const t = useTranslations('charts.heatmap')
  if (error) return <p style={{color: 'red'}}>Error: {error}</p>;
  if (isLoading) {/*console.log('HeatmapChart-isLoading', isLoading);*/ return <p className='p-4'>{t('processingMessage')} ⏳</p>;}
  if (!aggregatedChartData) return <p className='p-4'>{t('noDataMessage')}</p>;
  console.log('HeatmapChart', {isLoading, error}, {aggregatedChartData, heatmapData,layout})

  return (
    <Plot
      data={[
        heatmapData,
        {
          x: aggregatedChartData.topBar.x,
          y: aggregatedChartData.topBar.values,
          type: 'bar',
          xaxis: 'x2',
          yaxis: 'y2',
        },
        {
          x: aggregatedChartData.rightBar.values,
          y: aggregatedChartData.rightBar.y,
          type: 'bar',
          orientation: 'h',
          xaxis: 'x3',
          yaxis: 'y3',
        },
      ]}
      layout={layout}
      style={{ width: '100%', height: '80vh', minHeight: `max(60vh, 60vw, 500px)` }}
      useResizeHandler
    />
  );
};

export default HeatmapChart;