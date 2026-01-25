//PlotlyComponent.tsx

import Plotly from 'plotly.js/lib/core';
// import Plotly from 'plotly.js'
import createPlotlyComponent from 'react-plotly.js/factory';
import heatmap from 'plotly.js/lib/heatmap';
import bar from 'plotly.js/lib/bar';

Plotly.register([heatmap, bar]);

export default createPlotlyComponent(Plotly);
