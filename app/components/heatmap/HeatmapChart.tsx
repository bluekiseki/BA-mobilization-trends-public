import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartData } from '~/types/data';
import { ClientOnly } from '../ClientOnly';

export interface HeatmapChartProps {
  isLoading: boolean;
  error: string | null;
  aggregatedChartData: ChartData | null;
  layout: Partial<Plotly.Layout>;
  heatmapData: Partial<Plotly.Data>;
  unit: string
}


// import Plotly from 'plotly.js';
// import Plotly from 'plotly.js/lib/core';

// Plotly.register([
//     require('plotly.js/lib/heatmap'),
//     require('plotly.js/lib/bar')
// ]);
// const PlotlyComponent = lazy(() => import('react-plotly.js'));
// import PlotlyComponent = lazy(()=> import('react-plotly.js'))
// const Plotly = lazy(() => import('react-plotly.js'));


// import createPlotlyComponent from 'react-plotly.js/factory';
// const PlotlyComponent = lazy(async () => {
//   const  createPlotlyComponent = await import('react-plotly.js/factory')
//   return {
//     default: await (async () => {
//       const Plotly = (await import('plotly.js/lib/core')).default
//       // const Plotly = require('plotly.js/lib/core')
//       Plotly.register([
//         await import('plotly.js/lib/heatmap'),
//         await import('plotly.js/lib/bar')
//         // require('plotly.js/lib/heatmap'),
//         // require('plotly.js/lib/bar')
//       ]);
//       return createPlotlyComponent.default(Plotly);
//     })()
//   };
// })

const PlotlyComponent = lazy(() => { return import('./PlotlyComponent') });

const HeatmapChart = ({
  isLoading,
  error,
  aggregatedChartData,
  layout,
  heatmapData,
  unit
}: HeatmapChartProps) => {
  const { t } = useTranslation("charts", { keyPrefix: 'heatmap' });
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (isLoading) { return <p className='p-4'>{t('processingMessage')} ⏳</p>; }
  if (!aggregatedChartData) return <p className='p-4'>{t('noDataMessage')}</p>;

  return (
    <ClientOnly>
      <Suspense>
    <PlotlyComponent
      data={[
        heatmapData,
        {
          x: aggregatedChartData.topBar.x,
          y: aggregatedChartData.topBar.values,
          customdata: aggregatedChartData.heatmap.x_show,
          hovertemplate: `%{customdata}<br>%{y} %`,
          type: 'bar',
          xaxis: 'x2',
          yaxis: 'y2',
        },
        {
          x: aggregatedChartData.rightBar.values,
          y: aggregatedChartData.rightBar.y,
          hovertemplate: `%{y}<br>%{x} ${unit}`,
          type: 'bar',
          orientation: 'h',
          xaxis: 'x3',
          yaxis: 'y3',
        },
      ]}
      layout={layout}
      style={{ width: '100%', height: '90vh', maxHeight: '1300px', minHeight: `min(1300px, max(85vh, 45vw, 600px))`, }}
      useResizeHandler
    />
    </Suspense>
    </ClientOnly>
  );
};

export default HeatmapChart;