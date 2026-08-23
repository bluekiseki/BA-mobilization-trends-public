// app/components/planner/common/ApFlowSankeyChart.tsx
import { lazy, Suspense, useMemo } from 'react';
import type { SankeyFlow } from '~/utils/resourceApCost';
import type { EventData, StudentData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { resolveLabel } from '../ResourceEfficiencyPanel';

const PlotlySankeyComponent = lazy(() => {
  if (typeof window !== 'undefined') return import('./PlotlySankeyComponent.client');
  return Promise.resolve({ default: () => <div /> });
});

// Raw resource keys (Item_16020, Character_26016, ...) anywhere inside a node label — matches both a
// bare currency node's label (which IS just the key) and composite ones like "Item_80800: farm stage 12".
const RESOURCE_KEY_PATTERN = /\b(?:Item|Character|Currency|Equipment|Furniture|GachaGroup)_\d+\b/g;

export function ApFlowSankeyChart({ flow, eventData, allStudents, locale, maxHeight = 480 }: { flow: SankeyFlow; eventData: EventData; allStudents: StudentData; locale: Locale; maxHeight?: number }) {
  const labels = useMemo(
    () => flow.labels.map((label) => label.replace(RESOURCE_KEY_PATTERN, (key) => resolveLabel(key, eventData, allStudents, locale))),
    [flow.labels, eventData, allStudents, locale],
  );
  const { x, y, maxRows, maxDepth } = useMemo(() => {
    const maxDepth = Math.max(1, ...flow.depth);
    const byDepth = new Map<number, number[]>();
    flow.depth.forEach((d, idx) => {
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)?.push(idx);
    });

    const incomingByNode = new Array<number>(flow.labels.length).fill(0);
    const outgoingByNode = new Array<number>(flow.labels.length).fill(0);
    flow.source.forEach((s, i) => {
      outgoingByNode[s] += flow.value[i];
    });
    flow.target.forEach((t, i) => {
      incomingByNode[t] += flow.value[i];
    });
    const weightOf = (idx: number) => Math.max(incomingByNode[idx], outgoingByNode[idx], 1e-9);

    const xArr = new Array<number>(flow.labels.length).fill(0.5);
    const yArr = new Array<number>(flow.labels.length).fill(0.5);
    let maxRows = 1;
    for (const indices of byDepth.values()) {
      const depth = flow.depth[indices[0]];
      const xPos = Math.min(0.999, Math.max(0.001, depth / maxDepth));
      const weights = indices.map(weightOf);
      const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
      let cursor = 0;
      indices.forEach((idx, i) => {
        const heightFrac = weights[i] / totalWeight;
        xArr[idx] = xPos;
        yArr[idx] = Math.min(0.999, Math.max(0.001, cursor + heightFrac / 2));
        cursor += heightFrac;
      });
      maxRows = Math.max(maxRows, indices.length);
    }
    return { x: xArr, y: yArr, maxRows, maxDepth };
  }, [flow]);

  const nodeColors = useMemo(
    () =>
      flow.labels.map((label) => {
        if (label === 'AP spent') return 'rgba(115,115,115,0.6)'; // neutral-500 — matches the app's neutral-only grayscale rule
        if (label.includes(': clear ')) return 'rgba(217,119,6,0.65)'; // amber-600 — one-time prefix clear
        if (label.includes(': repeat ')) return 'rgba(22,163,74,0.65)'; // green-600 — the ongoing repeat target
        return 'rgba(37,99,235,0.6)'; // blue-600 — currency/step passthrough
      }),
    [flow.labels],
  );

  const plotWidth = useMemo(() => Math.max(420, (maxDepth + 1) * 200), [maxDepth]);
  const chartHeight = useMemo(() => Math.max(160, Math.min(maxHeight, maxRows * 84 + 56)), [maxRows, maxHeight]);
  const vMargin = useMemo(() => Math.round(Math.max(16, Math.min(32, chartHeight * 0.12))), [chartHeight]);

  const data = useMemo(
    (): Partial<Plotly.SankeyData>[] => [
      {
        type: 'sankey',
        orientation: 'h',
        // 'snap' honors x/y ordering and runs resolveCollisionsTopToBottom to prevent overlap.
        arrangement: 'snap',
        // Domain inset leaves headroom for tall ribbons so they don't get clipped by CSS wrapper.
        domain: { x: [0, 1], y: [0.12, 0.88] },
        node: {
          // Thicker bar for better touch target on mobile.
          pad: 18,
          thickness: 22,
          label: labels,
          color: nodeColors,
          line: { width: 0 },
          hovertemplate: '%{label}<extra></extra>',
          x,
          y,
        },
        link: {
          source: flow.source,
          target: flow.target,
          value: flow.value,
          color: 'rgba(148,163,184,0.35)',
          hovertemplate: '%{source.label} → %{target.label}<br>AP %{value:.1f}<extra></extra>',
        },
      },
    ],
    [flow, labels, nodeColors, x, y],
  );

  const layout = useMemo(
    (): Partial<Plotly.Layout> => ({
      width: plotWidth,
      height: chartHeight,
      // vMargin scales with chartHeight to prevent tall ribbons from bulging past the plot domain.
      margin: { l: 8, r: 8, t: vMargin, b: vMargin },
      font: { size: 11 },
      hovermode: 'closest',
      paper_bgcolor: 'rgba(0,0,0,0)',
    }),
    [plotWidth, chartHeight, vMargin],
  );

  if (flow.labels.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {/* overflowY clipped (hard guarantee); overflowX scrollable for wide diagrams */}
      <div style={{ width: '100%', height: chartHeight, overflowX: 'auto', overflowY: 'hidden' }}>
        <PlotlySankeyComponent data={data} layout={layout} config={{ displayModeBar: false, responsive: false, doubleClick: false }} style={{ width: plotWidth, height: chartHeight }} />
      </div>
    </Suspense>
  );
}
