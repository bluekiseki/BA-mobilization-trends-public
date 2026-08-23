// app/components/planner/inventory/ResourceGrid.tsx
import { useTranslation } from 'react-i18next';
import type { EventData, IconData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getDisplayAmount, type DisplayMode, type ResourceEntry } from '~/utils/inventoryDashboard';
import { ResourceIconButton } from './ResourceIconButton';

interface ResourceGridProps {
  entries: ResourceEntry[];
  eventData: EventData;
  iconData: IconData;
  locale: Locale;
  showTarget: boolean;
  displayMode: DisplayMode;
  activeKey: string | null;
  onEditItem: (itemKey: string) => void;
}

// Flat list — no per-type section headers. Entries are already sorted by the caller (default:
// type order, then id), so items naturally cluster by type without needing a grouped layout.
export function ResourceGrid({ entries, eventData, iconData, locale, showTarget, displayMode, activeKey, onEditItem }: ResourceGridProps) {
  const { t } = useTranslation('planner');
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-10">{t('inventory.noResourcesToShow')}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((entry) => {
        const status = !showTarget || entry.needed <= 0 ? null : entry.owned >= entry.needed ? 'ok' : 'short';
        return (
          <ResourceIconButton
            key={entry.key}
            category={entry.category}
            id={entry.id}
            amount={getDisplayAmount(entry.owned, entry.needed, displayMode)}
            eventData={eventData}
            iconData={iconData}
            locale={locale}
            status={status}
            helperText={showTarget && entry.needed > 0 ? t('inventory.helperShowOwned', { owned: entry.owned.toLocaleString(), needed: entry.needed.toLocaleString() }) : undefined}
            isActive={entry.key === activeKey}
            onClick={() => onEditItem(entry.key)}
          />
        );
      })}
    </div>
  );
}
