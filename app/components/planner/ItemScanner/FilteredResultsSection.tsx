import { useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { groupMaterialNeeds } from '~/utils/groupMaterialNeeds';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import type { ComparisonRow } from '~/scanner/types';
import { ComparisonTable } from './ComparisonTable';

interface Props {
  rows: ComparisonRow[];
  editedValues: Record<string, number>;
  confirmedItems: Record<string, boolean>;
  onEdit: (key: string, value: number) => void;
  onApply?: (updatedRows: ComparisonRow[]) => void;
}

export function FilteredResultsSection({ rows, editedValues, confirmedItems, onEdit, onApply }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const [activeCats, setActiveCats] = useState<Set<string> | null>(null); // null = all
  const [toast, setToast] = useState<string | null>(null);
  const { updateMaterialInventory, updateOwnedGifts } = useGlobalStore();

  const CATEGORY_LABELS: Record<string, string> = {
    credits: t('categoryCredits'),
    eligma: t('categoryEligma'),
    xpReports: t('categoryXpReports'),
    equipEnh: t('categoryEquipEnh'),
    uwGrowth: t('categoryUwGrowth'),
    potential: t('categoryPotential'),
    opart: t('categoryOpart'),
    tacticalBD: t('categoryTacticalBD'),
    techNote: t('categoryTechNote'),
    equipment: t('categoryEquipment'),
    skill: t('categorySkill'),
    eleph: t('categoryEleph'),
    gifts: t('categoryGifts'),
    other: t('categoryOther'),
  };

  const materialRows = rows.filter((r) => !r.icon?.isGift);
  const giftRows = rows.filter((r) => r.icon?.isGift);
  const scanRecord: Record<string, number> = {};
  for (const r of materialRows) scanRecord[r.inventoryKey] = r.scanned;
  const grouped = groupMaterialNeeds(scanRecord);
  const giftGroup = giftRows.length > 0 ? [{ categoryKey: 'gifts', items: giftRows.map((r) => ({ key: r.inventoryKey, amount: r.scanned })) }] : [];
  const allGroups = [...grouped, ...giftGroup];

  const catOfKey = new Map<string, string>();
  for (const g of allGroups) for (const { key } of g.items) catOfKey.set(key, g.categoryKey);

  const filteredRows = activeCats === null ? rows : rows.filter((r) => activeCats.has(catOfKey.get(r.inventoryKey) ?? 'other'));

  function toggleCat(cat: string) {
    setActiveCats((prev) => {
      if (prev === null) return new Set([cat]);
      const s = new Set(prev);
      if (s.has(cat)) s.delete(cat);
      else s.add(cat);
      return s.size === 0 ? null : s;
    });
  }

  function applyFiltered() {
    const targets = filteredRows.filter((r) => confirmedItems[r.inventoryKey] && (editedValues[r.inventoryKey] ?? r.scanned) > 0);
    if (targets.length === 0) return;

    const updatedRows = rows.map((row) => {
      const value = editedValues[row.inventoryKey] ?? row.scanned;
      if (targets.find((r) => r.inventoryKey === row.inventoryKey) && value > 0) {
        return { ...row, current: value };
      }
      return row;
    });

    for (const row of targets) {
      const value = editedValues[row.inventoryKey] ?? row.scanned;
      if (row.icon?.isGift) {
        updateOwnedGifts(row.icon.numericId, value);
      } else {
        // Blueprint (10xxxx) -> Equipment (xxxx) conversion
        let finalKey = row.inventoryKey;
        const match = row.inventoryKey.match(/^Equipment_(\d+)$/);
        if (match) {
          const id = parseInt(match[1]);
          if (id >= 100000 && id < 200000) {
            finalKey = `Equipment_${id - 100000}`;
          }
        }
        updateMaterialInventory(finalKey, value);
      }
    }

    onApply?.(updatedRows);

    const catLabel = activeCats?.size === 1 ? (CATEGORY_LABELS[[...activeCats][0]] ?? [...activeCats][0]) : t('filterAll');
    setToast(t('appliedToast', { count: targets.length, plural: targets.length !== 1 ? 's' : '', category: catLabel }));
    setTimeout(() => setToast(null), 3000);
  }

  const applyableCount = filteredRows.filter((r) => confirmedItems[r.inventoryKey] && (editedValues[r.inventoryKey] ?? r.scanned) > 0).length;
  const isFiltered = activeCats !== null;

  return (
    <div>
      {/* Category filter tags */}
      <div className="flex flex-wrap items-center gap-1 mb-2 sm:gap-1.5 sm:mb-3">
        <span className="text-xs text-neutral-500 mr-0.5">{t('filterLabel')}</span>
        <button
          onClick={() => setActiveCats(null)}
          className={[
            'rounded px-2 py-0.5 text-xs font-medium transition-colors',
            !isFiltered ? 'bg-neutral-300 text-neutral-900' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600',
          ].join(' ')}
        >
          {t('filterAll')}
        </button>
        {allGroups.map((g) => {
          const rowMap = new Map(rows.map((r) => [r.inventoryKey, r]));
          const count = g.items.filter(({ key }) => {
            const r = rowMap.get(key);
            return r && (editedValues[key] ?? r.scanned) > 0;
          }).length;
          if (count === 0) return null;
          const active = activeCats === null || activeCats.has(g.categoryKey);
          return (
            <button
              key={g.categoryKey}
              onClick={() => toggleCat(g.categoryKey)}
              className={[
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-sky-100 dark:bg-sky-800/60 text-sky-700 dark:text-sky-200 hover:bg-sky-200 dark:hover:bg-sky-700/60 border border-sky-400/50 dark:border-sky-700/50'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700',
              ].join(' ')}
            >
              {CATEGORY_LABELS[g.categoryKey] ?? g.categoryKey}
              <span className={`ml-1 ${active ? 'text-sky-600 dark:text-sky-400' : 'text-neutral-500 dark:text-neutral-600'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Apply bar */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={applyFiltered}
          disabled={applyableCount === 0}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold text-neutral-900 transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
        >
          <FaCheck className="text-xs" />
          {t('applyButton', { count: applyableCount, plural: applyableCount !== 1 ? 's' : '' })}
          {isFiltered && activeCats && activeCats.size === 1 && <span className="font-normal opacity-80">· {CATEGORY_LABELS[[...activeCats][0]] ?? [...activeCats][0]}</span>}
        </button>
        {toast && <span className="text-xs text-green-400">{toast}</span>}
      </div>

      <ComparisonTable rows={filteredRows} editedValues={editedValues} confirmedItems={confirmedItems} onEdit={onEdit} />
    </div>
  );
}
