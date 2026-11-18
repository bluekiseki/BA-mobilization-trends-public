import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemIcon } from './Icon';
import { MaterialLevelToggle, type MaterialDetailLevel } from './MaterialLevelToggle';
import { getItemName } from '~/utils/locale';
import type { IncomeKind } from '~/utils/itemOutlook';
import type { MaterialRow } from '~/utils/materialTable';
import type { Locale } from '~/utils/i18n/config';
import type { EventData, IconData } from '~/types/plannerData';

interface MaterialItemTableProps {
  row: MaterialRow;
  eventData: EventData;
  iconData: IconData;
  locale: Locale;
  /** Detail level of the obtainable amount; each table can override it. */
  level: MaterialDetailLevel;
  /** Shows the deficit row. */
  showDeficit?: boolean;
  onOpenItem?: (itemKey: string) => void;
}

// Event shop and coin shop income have no shared label elsewhere; the other sources reuse the game terms.
const KIND_LABEL_KEYS: Record<IncomeKind, string> = {
  event: 'game:event',
  eventFixed: 'planner:materialTable.kind.eventFixed',
  raid: 'game:raid',
  eraid: 'game:eraid',
  multifloor: 'game:multifloor',
  coinShop: 'planner:materialTable.kind.coinShop',
};

const num = (value: number) => value.toLocaleString();

export const MaterialItemTable = ({ row, eventData, iconData, locale, level, showDeficit = true, onOpenItem }: MaterialItemTableProps) => {
  const { t } = useTranslation(['planner', 'ui', 'game', 'students']);
  const tStr = t;
  const [override, setOverride] = useState<{ base: MaterialDetailLevel; value: MaterialDetailLevel } | null>(null);
  // An override only lives until the page-wide level changes.
  const current = override && override.base === level ? override.value : level;
  const [type, id] = row.key.split('_');
  const name = getItemName(row.key, eventData.icons, locale);

  const statusColor = row.deficit === 0 ? 'text-green-600 dark:text-green-400' : row.covered ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const hasSources = row.sources.length > 0;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 min-w-0">
      <div className="flex items-center gap-2 p-2 border-b border-neutral-200 dark:border-neutral-700">
        <ItemIcon type={type} itemId={id} amount={0} size={10} eventData={eventData} iconData={iconData} />
        {onOpenItem ? (
          <button type="button" onClick={() => onOpenItem(row.key)} title={name} className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline dark:text-neutral-100">
            {name}
          </button>
        ) : (
          <span title={name} className="min-w-0 flex-1 truncate text-sm font-semibold dark:text-neutral-100">
            {name}
          </span>
        )}
        {hasSources && <MaterialLevelToggle value={current} onChange={(value) => setOverride({ base: level, value })} buttonClassName="px-1.5 py-0.5" />}
      </div>
      <table className="w-full text-xs tabular-nums">
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          <tr>
            <th scope="row" className="px-2 py-1 text-left font-normal text-neutral-500 dark:text-neutral-400">
              {tStr('ui:current')}
            </th>
            <td className="px-2 py-1 text-right dark:text-neutral-200">{num(row.current)}</td>
          </tr>
          <tr>
            <th scope="row" className="px-2 py-1 text-left font-normal text-neutral-500 dark:text-neutral-400">
              {tStr('ui:target')}
            </th>
            <td className="px-2 py-1 text-right dark:text-neutral-200">{num(row.goal)}</td>
          </tr>
          <tr>
            <th scope="row" className="px-2 py-1 text-left font-normal text-neutral-500 dark:text-neutral-400">
              {tStr('materialTable.obtainable')}
            </th>
            <td className="px-2 py-1 text-right dark:text-neutral-200">{hasSources ? num(row.obtainable) : '-'}</td>
          </tr>
          {current !== 'total' && row.sources.map((source) => <SourceRows key={source.kind} source={source} showEntries={current === 'detail'} />)}
          {showDeficit && (
            <tr>
              <th scope="row" className="px-2 py-1 text-left font-normal text-neutral-500 dark:text-neutral-400">
                {tStr('materialTable.deficit')}
              </th>
              <td className={`px-2 py-1 text-right font-semibold ${statusColor}`}>{row.deficit === 0 ? '✓' : num(row.deficit)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const SourceRows = ({ source, showEntries }: { source: MaterialRow['sources'][number]; showEntries: boolean }) => {
  const { t } = useTranslation(['planner', 'ui', 'game', 'students']);
  const tStr = t as (key: string) => string;
  return (
    <>
      <tr>
        <th scope="row" className="pl-4 pr-2 py-1 text-left font-normal text-neutral-500 dark:text-neutral-400">
          {tStr(KIND_LABEL_KEYS[source.kind])}
        </th>
        <td className="px-2 py-1 text-right dark:text-neutral-300">{num(source.total)}</td>
      </tr>
      {showEntries &&
        source.entries.map((entry) => (
          <tr key={entry.id} className="text-neutral-500 dark:text-neutral-400">
            <th scope="row" className="pl-7 pr-2 py-0.5 text-left font-normal min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                <span title={entry.name} className="truncate">
                  {entry.name}
                </span>
                <span className="shrink-0 text-neutral-400 dark:text-neutral-500">{entry.date.slice(5)}</span>
                {entry.prediction && (
                  <span className="shrink-0 rounded px-1 text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">{tStr('students:recruitStatus.predicted')}</span>
                )}
              </span>
            </th>
            <td className="px-2 py-0.5 text-right">{num(entry.amount)}</td>
          </tr>
        ))}
    </>
  );
};
