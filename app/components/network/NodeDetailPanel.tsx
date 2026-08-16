import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FiBarChart2 } from 'react-icons/fi';
import { localeLink } from '~/utils/localeLink';

export interface SelectedNodeInfo {
  id: number;
  name: string;
  portrait: string;
  totalAppearances: number;
  partners: { id: number; name: string; portrait: string; weight: number; pct: number }[];
}

interface NodeDetailPanelProps {
  node: SelectedNodeInfo | null;
  locale: string;
  onFocusPartner: (id: number) => void;
}

export function NodeDetailPanel({ node, locale, onFocusPartner }: NodeDetailPanelProps) {
  const { t } = useTranslation('network');

  if (!node) {
    return <div className="flex items-center justify-center h-32 text-xs text-neutral-400 px-4 text-center">{t('nodeDetail.clickToSeeDetails')}</div>;
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        {node.portrait ? (
          <img src={node.portrait} alt="" className="w-12 h-12 rounded-full shrink-0 object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-neutral-200 dark:bg-neutral-700 shrink-0" />
        )}
        <div>
          <p className="font-semibold text-sm leading-tight">{node.name}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{t('nodeDetail.appearances', { count: node.totalAppearances.toLocaleString() })}</p>
        </div>
      </div>

      <Link
        to={localeLink(locale, '/charts/jp/heatmap')}
        state={{ studentId: node.id }}
        className="mx-4 mb-3 text-xs flex items-center gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400 transition-colors"
      >
        <FiBarChart2 className="w-4 h-4 shrink-0" />
        {t('nodeDetail.viewProfile')}
      </Link>

      <div className="border-t border-neutral-200 dark:border-neutral-800" />

      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-4 pt-3 pb-1.5">{t('nodeDetail.coOccurrences')}</p>

      {node.partners.length === 0 ? (
        <p className="px-4 py-2 text-xs text-neutral-400">{t('nodeDetail.noConnections')}</p>
      ) : (
        node.partners.map((p) => (
          <button key={p.id} onClick={() => onFocusPartner(p.id)} className="w-full flex items-center gap-2.5 px-4 py-1.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors">
            {p.portrait ? <img src={p.portrait} alt="" className="w-6 h-6 rounded-full shrink-0 object-cover" /> : <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 shrink-0" />}
            <span className="flex-1 text-sm truncate" title={p.name}>
              {p.name}
            </span>
            <span className="text-xs text-neutral-400 tabular-nums shrink-0">
              {p.weight.toLocaleString()} · {p.pct}%
            </span>
          </button>
        ))
      )}
    </div>
  );
}
