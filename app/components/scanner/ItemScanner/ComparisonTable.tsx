import { FaCheck } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { groupMaterialNeeds } from '~/utils/groupMaterialNeeds';
import type { ComparisonRow } from '~/scanner/types';
import { resolveIconName } from '~/scanner/iconLoader';
import { ScannerItemIcon } from './ScannerItemIcon';

interface Props {
  rows: ComparisonRow[];
  editedValues: Record<string, number>;
  confirmedItems: Record<string, boolean>;
  onEdit: (inventoryKey: string, value: number) => void;
}

function confidenceColor(c: number): string {
  if (c >= 0.6) return 'text-green-400';
  if (c >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

export function ComparisonTable({ rows, editedValues, confirmedItems, onEdit }: Props) {
  const { i18n, t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const { t: t_g } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');

  const CATEGORY_LABELS: Record<string, string> = {
    credits: t_g('credit'),
    eligma: t_g('eligma'),
    xpReports: t_g('report'),
    equipEnh: t('categoryEquipEnh'),
    uwGrowth: t('categoryUwGrowth'),
    potential: t_g('potential'),
    opart: t_g('opart'),
    tacticalBD: t('categoryTacticalBD'),
    techNote: t('categoryTechNote'),
    equipment: t_g('equipment'),
    skill: t('categorySkill'),
    eleph: t_g('eleph'),
    gifts: t_g('gift'),
    other: t_ui('etc'),
  };
  if (rows.length === 0) return null;

  const giftRows = rows.filter((r) => r.icon?.isGift);
  const materialRows = rows.filter((r) => !r.icon?.isGift);

  const scanRecord: Record<string, number> = {};
  for (const r of materialRows) scanRecord[r.inventoryKey] = r.scanned;
  const grouped = groupMaterialNeeds(scanRecord);

  const giftGroup = giftRows.length > 0 ? [{ categoryKey: 'gifts', items: giftRows.map((r) => ({ key: r.inventoryKey, amount: r.scanned })) }] : [];

  const allGroups = [...grouped, ...giftGroup];
  const rowMap = new Map(rows.map((r) => [r.inventoryKey, r]));

  return (
    <div className="space-y-2 mb-3">
      {allGroups.map((group) => (
        <div key={group.categoryKey} className="border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <div className="bg-neutral-100 dark:bg-neutral-800 px-2 py-1.5 sm:px-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            {CATEGORY_LABELS[group.categoryKey] ?? group.categoryKey}
            <span className="ml-2 text-xs font-normal text-neutral-500">
              {group.items.length} item{group.items.length !== 1 ? 's' : ''}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500">
                <th className="px-2 py-1 text-left sm:px-3">{t('tableItem')}</th>
                <th className="px-1 py-1 text-center w-5 sm:px-2"></th>
                <th className="px-2 py-1 text-right sm:px-3">{t('tableConfidence')}</th>
                <th className="px-2 py-1 text-right sm:px-3">{t('tableCurrent')}</th>
                <th className="px-2 py-1 text-right sm:px-3">{t('tableScanned')}</th>
                <th className="px-2 py-1 text-right sm:px-3">{t('tableDiff')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {group.items.map(({ key }) => {
                const row = rowMap.get(key);
                if (!row) return null;
                const edited = editedValues[key] ?? row.scanned;
                const diff = edited - row.current;
                return (
                  <tr key={key} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-2 py-1.5 sm:px-3">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <ScannerItemIcon inventoryKey={key} amount={0} size={8} />
                        <span className="hidden sm:inline text-neutral-800 dark:text-neutral-200 text-xs leading-tight">{row.icon ? resolveIconName(row.icon, i18n.language) : key}</span>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center sm:px-2">{confirmedItems[key] && <FaCheck className="text-green-500 dark:text-green-400 text-xs inline" />}</td>
                    <td className={`px-2 py-1.5 text-right text-xs font-mono sm:px-3 ${confidenceColor(row.confidence)}`}>{(row.confidence * 100).toFixed(0)}%</td>
                    <td className="px-2 py-1.5 text-right text-neutral-500 dark:text-neutral-400 text-xs sm:px-3">{row.current.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right sm:px-3">
                      <input
                        type="number"
                        min={0}
                        value={edited}
                        onChange={(e) => onEdit(key, Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-20 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-1.5 py-0.5 text-right text-neutral-800 dark:text-neutral-200 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td
                      className={[
                        'px-2 py-1.5 text-right font-mono text-xs sm:px-3',
                        diff > 0 ? 'text-green-600 dark:text-green-400' : diff < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400 dark:text-neutral-600',
                      ].join(' ')}
                    >
                      {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
