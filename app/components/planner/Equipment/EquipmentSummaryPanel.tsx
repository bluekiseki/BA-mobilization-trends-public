import type { EventData, IconData, IconInfos } from '~/types/plannerData';
import { EquipmentItemIcon } from './common';

interface EquipmentSummaryPanelProps {
  items: [string, number][];
  emptyText: string;
  eventDataForIcon: EventData;
  iconData: IconData;
  // iconInfoData: IconInfos;
  panelClassName: string;
}

export const EquipmentSummaryPanel: React.FC<EquipmentSummaryPanelProps> = ({ items, emptyText, eventDataForIcon, iconData, /*iconInfoData,*/ panelClassName }) => {
  if (items.length === 0) {
    return <div className={`px-3 py-4 text-center text-xs text-neutral-400 dark:text-neutral-500 ${panelClassName}`}>{emptyText}</div>;
  }

  return (
    <div className={`flex flex-wrap gap-1.5 px-3 py-2 max-h-128 overflow-y-auto ${panelClassName}`}>
      {items.map(([key, amount]) => {
        const itemType = key.split('_')[0] as keyof IconInfos;
        const itemId = key.split('_')[1];
        return <EquipmentItemIcon key={key} type={itemType} itemId={itemId} amount={amount} size={13} eventData={eventDataForIcon} iconData={iconData} forceDecimal />;
      })}
    </div>
  );
};
