// app/components/planner/inventory/ResourceGrid.tsx
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import type { EventData, IconData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getDisplayAmount, type DisplayMode, type ResourceEntry } from '~/features/inventory/logic/inventoryDashboard';
import { ResourceIconButton, useResourceIconSize } from './ResourceIconButton';

const PAGE_SIZE = 120;

interface ResourceGridProps {
  entries: ResourceEntry[];
  eventData: EventData;
  iconData: IconData;
  locale: Locale;
  showTarget: boolean;
  displayMode: DisplayMode;
  activeKey: string | null;
  onEditItem: (itemKey: string) => void;
  // Fungible-pool-aware overrides (reports/equipment enhancement stones) — a key present here
  // (even at 0) belongs to a pool with active demand, so its status dot and deficit/diff number
  // reflect the whole pool's coverage rather than this one tier's raw owned/needed count. See
  // ~/utils/groupMaterialNeeds compactPoolDeficit/compactPoolNet for how these are computed.
  fungibleDeficitByKey?: Record<string, number>; // always >= 0, used for 'deficit' mode + the status dot
  fungibleDiffByKey?: Record<string, number>; // signed, used for 'diff' mode
  // Carry-up: pool-wide owned counts re-expressed as the fewest highest-denomination items (see
  // ~/utils/groupMaterialNeeds compactPoolOwned). Only affects the 'owned' mode number — status,
  // the edit sheet, and every other mode always use the entry's real per-tier owned count.
  fungibleOwnedByKey?: Record<string, number>;
}

// Flat list — no per-type section headers. Entries are already sorted by the caller (default:
// type order, then id), so items naturally cluster by type without needing a grouped layout.
export function ResourceGrid({ entries, eventData, iconData, showTarget, displayMode, activeKey, onEditItem, fungibleDeficitByKey, fungibleDiffByKey, fungibleOwnedByKey }: ResourceGridProps) {
  const { t } = useTranslation('planner');
  const size = useResourceIconSize();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibleCount >= entries.length || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((count) => Math.min(count + PAGE_SIZE, entries.length));
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, entries.length]);

  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-10">{t('inventory.noResourcesToShow')}</p>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-1">
      {entries.slice(0, visibleCount).map((entry) => {
        // A key present in fungibleDeficitByKey (even at 0) belongs to a fungible pool that has
        // active demand — its coverage is judged pool-wide, not by this one tier's raw owned/needed.
        const poolDeficit = fungibleDeficitByKey != null && entry.key in fungibleDeficitByKey ? fungibleDeficitByKey[entry.key] : null;
        const status = !showTarget ? null : poolDeficit != null ? (poolDeficit > 0 ? 'short' : 'ok') : entry.needed <= 0 ? null : entry.owned >= entry.needed ? 'ok' : 'short';
        const amount =
          displayMode === 'deficit' && poolDeficit != null
            ? poolDeficit
            : displayMode === 'diff' && poolDeficit != null && fungibleDiffByKey
              ? (fungibleDiffByKey[entry.key] ?? 0)
              : displayMode === 'owned' && fungibleOwnedByKey != null && entry.key in fungibleOwnedByKey
                ? fungibleOwnedByKey[entry.key]
                : getDisplayAmount(entry.owned, entry.needed, displayMode);
        return (
          <ResourceIconButton
            key={entry.key}
            itemKey={entry.key}
            category={entry.category}
            id={entry.id}
            amount={amount}
            icons={eventData.icons}
            iconData={iconData}
            size={size}
            title={showTarget && entry.needed > 0 ? `${entry.name} — ${t('inventory.helperShowOwned', { owned: entry.owned.toLocaleString(), needed: entry.needed.toLocaleString() })}` : entry.name}
            status={status}
            isActive={entry.key === activeKey}
            onEditItem={onEditItem}
          />
        );
      })}
      {visibleCount < entries.length && <div ref={sentinelRef} className="w-full h-px" aria-hidden="true" />}
    </div>
  );
}
