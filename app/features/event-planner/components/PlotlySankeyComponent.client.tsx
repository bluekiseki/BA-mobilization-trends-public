// app/components/planner/common/PlotlySankeyComponent.client.tsx
import type { FC } from 'react';
import Plotly from 'plotly.js/lib/core';
import createPlotlyComponent from 'react-plotly.js/factory';
import sankey from 'plotly.js/lib/sankey';

Plotly.register([sankey]);

// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
const PlotlySankeyComponent = ((createPlotlyComponent as any).default || createPlotlyComponent)(Plotly) as FC<{
  data: Plotly.Data[];
  layout: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  style?: React.CSSProperties;
  useResizeHandler?: boolean;
}>;

export default PlotlySankeyComponent;
