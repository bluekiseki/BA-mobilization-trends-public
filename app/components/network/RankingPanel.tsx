import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeRankings } from './computeRankings';
import type { NetworkGraph, NetworkNode } from './types';

type Metric = 'pageRank' | 'betweenness' | 'strength' | 'degree';

interface RankingPanelProps {
  graph: NetworkGraph;
  focusId: number | null;
  onFocus: (id: number) => void;
}

const METRIC_FMT: Record<Metric, (v: number) => string> = {
  pageRank: (v) => (v * 100).toFixed(1),
  betweenness: (v) => (v * 100).toFixed(2),
  strength: (v) => v.toLocaleString(),
  degree: (v) => String(v),
};

export function RankingPanel({ graph, focusId, onFocus }: RankingPanelProps) {
  const { t } = useTranslation('network');
  const { t: t_ui } = useTranslation('ui');
  const [metric, setMetric] = useState<Metric>('pageRank');

  const METRIC_LABELS = useMemo(
    () => ({
      pageRank: t('ranking.pageRank'),
      betweenness: t('ranking.betweenness'),
      strength: t('ranking.strength'),
      degree: t('ranking.degree'),
    }),
    [t],
  );

  const METRIC_DESCS: Record<Metric, string> = useMemo(
    () => ({
      pageRank: t('ranking.pageRankDesc'),
      betweenness: t('ranking.betweennessDesc'),
      strength: t('ranking.strengthDesc'),
      degree: t('ranking.degreeDesc'),
    }),
    [t],
  );

  const rankings = useMemo(() => computeRankings(graph.nodes, graph.edges), [graph]);

  const nodeById = useMemo(() => new Map<number, NetworkNode>(graph.nodes.map((n) => [n.id, n])), [graph]);

  const sorted = useMemo(() => [...rankings].sort((a, b) => b[metric] - a[metric]), [rankings, metric]);

  if (graph.nodes.length === 0) {
    return <div className="flex items-center justify-center h-32 text-xs text-neutral-400">{t_ui('noData')}</div>;
  }

  return (
    <div className="flex flex-col">
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`flex-1 text-xs py-1.5 transition-colors ${
              metric === m
                ? 'text-neutral-900 dark:text-neutral-100 font-semibold border-b-2 border-neutral-700 dark:border-neutral-300'
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">{METRIC_DESCS[metric]}</p>

      <div>
        {sorted.map((r, i) => {
          const node = nodeById.get(r.id);
          if (!node) return null;
          const isFocused = r.id === focusId;
          return (
            <button
              key={r.id}
              onClick={() => onFocus(r.id)}
              className={`w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors ${isFocused ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'}`}
            >
              <span className="text-xs text-neutral-400 w-4 shrink-0 text-right tabular-nums">{i + 1}</span>
              {node.portrait ? (
                <img src={node.portrait} alt="" className="w-6 h-6 rounded-full shrink-0 object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 shrink-0" />
              )}
              <span className="flex-1 text-sm truncate" title={node.name}>
                {node.name}
              </span>
              <span className="text-xs text-neutral-400 tabular-nums shrink-0">{METRIC_FMT[metric](r[metric])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
