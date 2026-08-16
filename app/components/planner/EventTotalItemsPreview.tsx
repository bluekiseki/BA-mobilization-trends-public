import { useState, useEffect } from 'react';
import { ItemIcon } from '~/components/planner/common/Icon';
import { cdn } from '~/utils/cdn';
import { isOverviewPriorityItem, getItemTypeOrder } from '~/utils/itemType';
import type { IconData, IconInfos, EventData, IconInfo } from '~/types/plannerData';

interface Props {
  cachedTotalItems: {
    savedAt: number;
    gained: Record<string, { amount: number; isBonusApplied: boolean }>;
    spent: Record<string, { amount: number; isBonusApplied: boolean }>;
    availableAp: number;
  };
}

let _iconData: IconData | null = null;
let _iconInfoData: IconInfos | null = null;
let _loading = false;
const _listeners: Array<() => void> = [];

function loadGlobalIconData(onLoaded: () => void): void {
  if (_iconData && _iconInfoData) {
    onLoaded();
    return;
  }
  _listeners.push(onLoaded);
  if (_loading) return;
  _loading = true;

  const p1: Promise<IconData> = fetch(cdn('/ew/icon_img.json')).then((r) => r.json());
  const p2: Promise<IconInfos> = fetch(cdn('/ew/icon_info.json')).then((r) => r.json());

  void Promise.all([p1, p2])
    .then(([img, info]) => {
      _iconData = img;
      _iconInfoData = info;
      _listeners.forEach((fn) => fn());
      _listeners.length = 0;
    })
    .catch(() => {
      _loading = false;
      _listeners.length = 0;
    });
}

function sortByTypeOrder(
  entries: [string, { amount: number; isBonusApplied: boolean }][],
  iconInfos: Record<string, Record<string, IconInfo>>,
): [string, { amount: number; isBonusApplied: boolean }][] {
  return [...entries].sort(([keyA], [keyB]) => {
    const [typeA, idA] = keyA.split('_');
    const [typeB, idB] = keyB.split('_');
    const orderDiff = getItemTypeOrder(typeA, idA, iconInfos) - getItemTypeOrder(typeB, idB, iconInfos);
    return orderDiff !== 0 ? orderDiff : 0;
  });
}

export function EventTotalItemsPreview({ cachedTotalItems }: Props) {
  const [iconsReady, setIconsReady] = useState(() => !!(_iconData && _iconInfoData));
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (iconsReady) return;
    loadGlobalIconData(() => setIconsReady(true));
  }, [iconsReady]);

  if (!iconsReady) {
    return (
      <div className="mt-1.5 flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-8 h-8 rounded-md bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
        ))}
      </div>
    );
  }

  const iconInfos = _iconInfoData as unknown as Record<string, Record<string, IconInfo>>;
  const fakeEventData = { icons: _iconInfoData } as EventData;

  const allGained = sortByTypeOrder(Object.entries(cachedTotalItems.gained), iconInfos);
  const allSpent = sortByTypeOrder(Object.entries(cachedTotalItems.spent), iconInfos);

  const priorityGained = allGained.filter(([key]) => {
    const [type, id] = key.split('_');
    return isOverviewPriorityItem(type, id, iconInfos);
  });
  const prioritySpent = allSpent.filter(([key]) => {
    const [type, id] = key.split('_');
    return isOverviewPriorityItem(type, id, iconInfos);
  });

  const hasMore = allGained.length > priorityGained.length || allSpent.length > prioritySpent.length;

  const gainedToShow = showAll ? allGained : priorityGained;
  const spentToShow = showAll ? allSpent : prioritySpent;

  if (gainedToShow.length === 0 && spentToShow.length === 0 && !hasMore) return null;

  const renderIcon = (key: string, amount: number, labelProps?: { label: string; labelColor: string }) => {
    const [type, id] = key.split('_');
    return <ItemIcon key={key} type={type} itemId={id} amount={Math.round(amount)} size={12} eventData={fakeEventData} iconData={_iconData || {}} {...labelProps} />;
  };

  return (
    <div className="mt-1.5 space-y-1">
      {cachedTotalItems.availableAp > 0 && (
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
          AP <span className="font-semibold text-neutral-700 dark:text-neutral-300">{Math.round(cachedTotalItems.availableAp).toLocaleString()}</span> consume
        </p>
      )}
      {gainedToShow.length > 0 && (
        <div>
          <p className="text-[9px] font-bold text-neutral-400 dark:text-neutral-500 mb-0.5">Acquire</p>
          <div className="flex flex-wrap gap-1">{gainedToShow.map(([key, data]) => renderIcon(key, data.amount))}</div>
        </div>
      )}
      {spentToShow.length > 0 && (
        <div>
          <p className="text-[9px] font-bold text-red-400 dark:text-red-500 mb-0.5">consume</p>
          <div className="flex flex-wrap gap-1">{spentToShow.map(([key, data]) => renderIcon(key, data.amount, { label: '-', labelColor: 'bg-red-500' }))}</div>
        </div>
      )}
      {hasMore && (
        <button onClick={() => setShowAll((v) => !v)} className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline">
          {showAll ? 'Hide' : `View all (+${allGained.length - priorityGained.length + allSpent.length - prioritySpent.length})`}
        </button>
      )}
    </div>
  );
}
