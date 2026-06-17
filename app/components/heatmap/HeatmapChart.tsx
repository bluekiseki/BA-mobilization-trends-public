// app/components/heatmap/HeatmapChart.tsx

import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartData } from '~/types/data';
import { ClientOnly } from '../common/ClientOnly';

export interface HeatmapChartProps {
  isLoading: boolean;
  error: string | null;
  aggregatedChartData: ChartData | null;
  layout: Partial<Plotly.Layout>;
  heatmapData: Partial<Plotly.Data>;
  unit: string;
}

const PlotlyComponent = lazy(() => {
  // Import the actual file only in a browser environment where 'window' exists.
  if (typeof window !== 'undefined') {
    return import('./PlotlyComponent.client');
  }
  // Return an empty component in server environments to prevent errors.
  return Promise.resolve({ default: () => <div /> });
});

const HeatmapChart = ({ isLoading, error, aggregatedChartData, layout, heatmapData, unit }: HeatmapChartProps) => {
  const { t } = useTranslation('charts', { keyPrefix: 'heatmap' });
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (isLoading) {
    return <p className="p-4">{t('processingMessage')} ⏳</p>;
  }
  if (!aggregatedChartData) return <p className="p-4">{t('noDataMessage')}</p>;

  const plotlyProps = {
    data: [
      heatmapData,
      {
        x: aggregatedChartData.topBar.x,
        y: aggregatedChartData.topBar.values,
        customdata: aggregatedChartData.heatmap.x_show,
        hovertemplate: `%{customdata}<br>%{y} %`,
        type: 'bar' as const,
        xaxis: 'x2',
        yaxis: 'y2',
      },
      {
        x: aggregatedChartData.rightBar.values,
        y: aggregatedChartData.rightBar.y,
        hovertemplate: `%{y}<br>%{x} ${unit}`,
        type: 'bar' as const,
        orientation: 'h' as const,
        xaxis: 'x3',
        yaxis: 'y3',
      },
    ],
    layout,
    style: {
      width: '100%',
      height: '90vh',
      maxHeight: '1300px',
      minHeight: `min(1300px, max(85vh, 45vw, 600px))`,
    },
    useResizeHandler: true,
  };

  return (
    <ClientOnly>
      <Suspense>
        <PlotlyComponent {...plotlyProps} />
      </Suspense>
    </ClientOnly>
  );
};

export default HeatmapChart;
