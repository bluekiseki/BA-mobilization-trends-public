// components/planner/resources/TrackedItemsBar.tsx
import { useRef, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizeEtcName } from '~/components/planner/common/locale';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import type { TrackingItem } from '~/components/planner/resources/ResourcePanel';
import type { IconInfos, IconInfo } from '~/types/plannerData';
import type { Student } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';

interface TrackedItemsBarProps {
  trackingItems: TrackingItem[];
  selectedItemKey: string | null;
  iconInfos: IconInfos | null;
  studentsRecord: Record<number, Student>;
  locale: Locale;
  onSelectSearchResult: (key: string) => void;
  onSelectItem: (key: string) => void;
  renderItemIcon: (itemKey: string, size: number, amount: number) => ReactNode;
}

function hasLocalizeEtc(info: unknown): info is IconInfo {
  return typeof info === 'object' && info !== null && 'LocalizeEtc' in info;
}

export function TrackedItemsBar({ trackingItems, selectedItemKey, iconInfos, studentsRecord, locale, onSelectSearchResult, onSelectItem, renderItemIcon }: TrackedItemsBarProps) {
  const { t } = useTranslation('resources');
  const [itemSearch, setItemSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const matcher = useSearchMatcher(locale);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setItemSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const searchResults = useMemo(() => {
    if (!itemSearch.trim() || !iconInfos) return [];
    const q = itemSearch.trim();
    const results: { key: string; label: string }[] = [];
    const seen = new Set<string>();

    // Match by localized item name
    const searchGroup = (type: string, group: Record<string, { LocalizeEtc?: IconInfo['LocalizeEtc'] }>) => {
      for (const [id, info] of Object.entries(group)) {
        const loc = getLocalizeEtcName(info.LocalizeEtc, locale);
        if (loc && matcher(loc, q)) {
          const key = `${type}_${id}`;
          seen.add(key);
          results.push({ key, label: loc });
        }
      }
    };
    if (iconInfos.Item) searchGroup('Item', iconInfos.Item);
    if (iconInfos.Currency) searchGroup('Currency', iconInfos.Currency);
    if (iconInfos.Equipment) searchGroup('Equipment', iconInfos.Equipment);

    // Also match student eleph items by SearchTags (aliases/nicknames).
    // Student IDs are >= 10000, stored as `Item_${id}` keys.
    for (const [id, student] of Object.entries(studentsRecord)) {
      const key = `Item_${id}`;
      if (seen.has(key)) continue; // already matched by name above
      if (!student.SearchTags.some((tag) => matcher(tag, q))) continue;
      const loc = getLocalizeEtcName(iconInfos.Item?.[id]?.LocalizeEtc, locale) ?? student.Name;
      seen.add(key);
      results.push({ key, label: loc });
    }

    return results;
  }, [itemSearch, iconInfos, studentsRecord, locale, matcher]);

  const selectedItemLabel = useMemo(() => {
    if (!selectedItemKey) return null;

    const trackedItem = trackingItems.find((item) => item.key === selectedItemKey);
    if (trackedItem) {
      return getLocalizeEtcName(trackedItem.iconInfo?.LocalizeEtc, locale) ?? trackedItem.label ?? trackedItem.key;
    }

    const separatorIndex = selectedItemKey.lastIndexOf('_');
    if (separatorIndex < 0 || !iconInfos) return selectedItemKey;

    const type = selectedItemKey.slice(0, separatorIndex);
    const id = selectedItemKey.slice(separatorIndex + 1);
    const iconInfo = iconInfos[type as keyof IconInfos]?.[id];
    return (hasLocalizeEtc(iconInfo) ? getLocalizeEtcName(iconInfo.LocalizeEtc, locale) : null) ?? studentsRecord[Number(id)]?.Name ?? selectedItemKey;
  }, [selectedItemKey, trackingItems, iconInfos, studentsRecord, locale]);

  return (
    <div className="p-3 space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('trackedItems.title')}</h2>

      {/* Search input */}
      <div className="relative" ref={searchRef}>
        {/* font-size 16px prevents iOS auto-zoom; scale-75 restores visual size to text-xs */}
        <div className="relative h-7">
          <input
            type="text"
            placeholder={t('trackedItems.searchPlaceholder')}
            value={itemSearch}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setItemSearch(e.target.value);
              setIsOpen(true);
            }}
            className="absolute top-0 left-0 w-[calc(100%/0.75)] scale-75 origin-top-left px-2.5 py-1.5 text-[16px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
          />
        </div>

        {isOpen && itemSearch.trim() && (
          <div className="absolute left-0 top-full max-h-[80vh] mt-1 z-20 w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden overflow-y-scroll">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">{t('trackedItems.noResults')}</p>
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    onSelectSearchResult(r.key);
                    setItemSearch('');
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  {renderItemIcon(r.key, 10, 0)}
                  <span className="truncate" title={r.label}>
                    {r.label}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedItemKey && selectedItemLabel && (
        <div className="flex min-h-8 items-center gap-2 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-700">
          <span className="shrink-0">{renderItemIcon(selectedItemKey, 6, 0)}</span>
          <span className="min-w-0 truncate font-semibold text-neutral-800 dark:text-neutral-100" title={selectedItemLabel}>
            {selectedItemLabel}
          </span>
          <span className="ml-auto shrink-0 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{t('trackedItems.activeTarget')}</span>
        </div>
      )}

      {/* Tracked item pills */}
      {trackingItems.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {trackingItems.map((item) => {
            const itemLabel = getLocalizeEtcName(item.iconInfo?.LocalizeEtc, locale) ?? item.label ?? item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelectItem(item.key)}
                aria-label={itemLabel}
                title={itemLabel}
                className={`flex h-9 w-9 items-center justify-center rounded border transition-colors ${
                  selectedItemKey === item.key
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-neutral-800'
                    : 'border-transparent bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {renderItemIcon(item.key, 9, 0)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
