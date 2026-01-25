import type { EventData, IconData, IconInfos } from '~/types/plannerData';
import { EquipmentItemIcon } from './common';

// --- Redundancy Summary Panel Component ---
interface EquipmentSummaryPanelProps {
  title: string;
  icon: React.ElementType;
  items: [string, number][]; // Already sorted item list
  emptyText: string;
  eventDataForIcon: EventData;
  iconData: IconData;
  iconInfoData: IconInfos; // Required for EquipmentItemIcon to look up tier information
  panelClassName: string; // e.g., 'bg-gray-100 dark:bg-neutral-800'
}

export const EquipmentSummaryPanel: React.FC<EquipmentSummaryPanelProps> = ({ title, icon: Icon, items, emptyText, eventDataForIcon, iconData, iconInfoData, panelClassName }) => {
  return (
    <div>
      <h2 className="text-lg font-semibold dark:text-gray-200 flex items-center gap-2">
        <Icon /> {title}
      </h2>
      <div className={`flex flex-wrap gap-2 p-3 ${panelClassName} rounded-md mt-1 max-h-80 overflow-y-scroll scrollbar-thin`}>
        {items.length > 0 ? (
          items.map(([key, amount]) => {
            const itemType = key.split('_')[0] as keyof IconInfos;
            const itemId = key.split('_')[1];
            return (
              <EquipmentItemIcon
                key={key}
                type={itemType}
                itemId={itemId}
                amount={amount}
                size={13}
                eventData={eventDataForIcon}
                iconData={iconData}
                // iconInfoData={iconInfoData}
              />
            );
          })
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</span>
        )}
      </div>
    </div>
  );
};
