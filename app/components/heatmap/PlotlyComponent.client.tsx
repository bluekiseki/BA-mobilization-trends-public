//PlotlyComponent.tsx

import type { FC } from 'react';
import Plotly from 'plotly.js/lib/core';
// import Plotly from 'plotly.js'
import createPlotlyComponent from 'react-plotly.js/factory';
import heatmap from 'plotly.js/lib/heatmap';
import bar from 'plotly.js/lib/bar';

Plotly.register([heatmap, bar]);

// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
const PlotlyComponent = ((createPlotlyComponent as any).default || createPlotlyComponent)(Plotly) as FC<{
  data: Plotly.Data[];
  layout: Partial<Plotly.Layout>;
  style?: React.CSSProperties;
  useResizeHandler?: boolean;
}>;

export default PlotlyComponent;
