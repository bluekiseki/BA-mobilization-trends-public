// app/components/planner/inventory/ResourceMatrix.tsx
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventData, IconData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getDisplayAmount, type DisplayMode } from '~/features/inventory/logic/inventoryDashboard';
import { splitItemKey } from '~/utils/itemType';
import { ResourceIconButton, useResourceIconSize } from './ResourceIconButton';
import { getItemName } from '~/utils/locale';

export interface MatrixAxisEntry {
  key: string;
  label: React.ReactNode;
}

interface ResourceMatrixProps {
  rows: MatrixAxisEntry[];
  cols: MatrixAxisEntry[];
  getItemKey: (rowKey: string, colKey: string) => string | null;
  inventory: Record<string, number>;
  needed?: Record<string, number>;
  /** Pool-corrected overrides (e.g. gear covered by universal blueprints); a present key replaces the raw owned/needed comparison. */
  deficitByKey?: Record<string, number>;
  diffByKey?: Record<string, number>;
  eventData: EventData;
  iconData: IconData;
  locale: Locale;
  showTarget: boolean;
  displayMode: DisplayMode;
  activeKey: string | null;
  onEditItem: (itemKey: string) => void;
}

export function ResourceMatrix({
  rows,
  cols,
  getItemKey,
  inventory,
  needed = {},
  deficitByKey,
  diffByKey,
  eventData,
  iconData,
  locale,
  showTarget,
  displayMode,
  activeKey,
  onEditItem,
}: ResourceMatrixProps) {
  const { t } = useTranslation('planner');
  // Slightly larger than the shared default — the matrix's grid cells have room to spare and
  // small equipment-tier icons are hard to tell apart at the default size.
  const size = useResourceIconSize() + 1;

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-x-1 gap-y-1 items-center" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(32px, 1fr))` }}>
        <div />
        {cols.map((col) => (
          <div key={col.key} className="text-center text-xs font-medium text-neutral-400 dark:text-neutral-500 pb-1">
            {col.label}
          </div>
        ))}
        {rows.map((row) => (
          <Fragment key={row.key}>
            <div className="flex items-center text-xs text-neutral-500 dark:text-neutral-400 pr-3 whitespace-nowrap">{row.label}</div>
            {cols.map((col) => {
              const itemKey = getItemKey(row.key, col.key);
              if (!itemKey) return <div key={col.key} />;
              const parts = splitItemKey(itemKey);
              if (!parts) return <div key={col.key} />;
              const [category, id] = parts;
              const owned = inventory[itemKey] ?? 0;
              const need = needed[itemKey] ?? 0;
              const override = deficitByKey != null && itemKey in deficitByKey ? deficitByKey[itemKey] : null;
              const status = !showTarget || need <= 0 ? null : override != null ? (override > 0 ? 'short' : 'ok') : owned >= need ? 'ok' : 'short';
              const amount =
                override != null && displayMode === 'deficit'
                  ? override
                  : override != null && displayMode === 'diff' && diffByKey
                    ? (diffByKey[itemKey] ?? 0)
                    : getDisplayAmount(owned, need, displayMode);
              return (
                <div key={col.key} className="flex justify-center">
                  <ResourceIconButton
                    itemKey={itemKey}
                    category={category}
                    id={id}
                    amount={amount}
                    icons={eventData.icons}
                    iconData={iconData}
                    size={size}
                    title={`${getItemName(itemKey, eventData.icons, locale)}${showTarget && need > 0 ? ` — ${t('inventory.helperShowOwned', { owned: owned.toLocaleString(), needed: need.toLocaleString() })}` : ''}`}
                    status={status}
                    isActive={itemKey === activeKey}
                    onEditItem={onEditItem}
                  />
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
