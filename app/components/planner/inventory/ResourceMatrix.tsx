// app/components/planner/inventory/ResourceMatrix.tsx
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventData, IconData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getDisplayAmount, type DisplayMode } from '~/utils/inventoryDashboard';
import { splitItemKey } from '~/utils/itemType';
import { ResourceIconButton } from './ResourceIconButton';

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
  eventData: EventData;
  iconData: IconData;
  locale: Locale;
  showTarget: boolean;
  displayMode: DisplayMode;
  activeKey: string | null;
  onEditItem: (itemKey: string) => void;
}

export function ResourceMatrix({ rows, cols, getItemKey, inventory, needed = {}, eventData, iconData, locale, showTarget, displayMode, activeKey, onEditItem }: ResourceMatrixProps) {
  const { t } = useTranslation('planner');
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
              const status = !showTarget || need <= 0 ? null : owned >= need ? 'ok' : 'short';
              return (
                <div key={col.key} className="flex justify-center">
                  <ResourceIconButton
                    category={category}
                    id={id}
                    amount={getDisplayAmount(owned, need, displayMode)}
                    eventData={eventData}
                    iconData={iconData}
                    locale={locale}
                    status={status}
                    helperText={showTarget && need > 0 ? t('inventory.helperShowOwned', { owned: owned.toLocaleString(), needed: need.toLocaleString() }) : undefined}
                    isActive={itemKey === activeKey}
                    onClick={() => onEditItem(itemKey)}
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
