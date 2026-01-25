import type { EventData, IconData, IconInfos } from '~/types/plannerData';
// useTranslation import
import { useTranslation } from 'react-i18next';
import { EquipmentItemIcon } from './common';
import { FaFilter, FaUndo } from 'react-icons/fa';

export const EquipmentFilterModal = ({
  isOpen,
  onClose,
  allFarmableItems,
  itemFilter,
  setItemFilter,
  eventDataForIcon,
  iconData,
  iconInfoData,
}: {
  isOpen: boolean;
  onClose: () => void;
  allFarmableItems: string[];
  itemFilter: Set<string>;
  setItemFilter: React.Dispatch<React.SetStateAction<Set<string>>>;
  eventDataForIcon: EventData;
  iconData: IconData;
  iconInfoData: IconInfos;
}) => {
  // Use useTranslation hook
  const { t } = useTranslation('planner');

  if (!isOpen) return null;
  const toggleItem = (itemKey: string) => {
    const newFilter = new Set(itemFilter);
    if (newFilter.has(itemKey)) {
      newFilter.delete(itemKey);
    } else {
      newFilter.add(itemKey);
    }
    setItemFilter(newFilter);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[70vh] bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold dark:text-gray-100 flex items-center gap-2">
            <FaFilter /> {t('equipment.itemFilter')}
          </h3>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-2xl">
            &times;
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('equipment.filterModalDesc')}</p>
        <div className="max-h-[50vh] overflow-y-auto pr-2 -mr-2">
          <div className="flex flex-wrap gap-2">
            {allFarmableItems.map((key) => {
              const isSelected = itemFilter.has(key);
              const itemType = key.split('_')[0] as keyof IconInfos;
              const itemId = key.split('_')[1];
              // Remove unnecessary variable (handled internally by EquipmentItemIcon)
              // const itemInfo = iconInfoData.Equipment?.[itemId];
              // const tierLabel = getEquipmentTierLabel(itemInfo);
              return (
                <button
                  key={key}
                  onClick={() => toggleItem(key)}
                  className={`p-1 rounded-md transition-all ${isSelected ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500' : 'bg-gray-100 dark:bg-neutral-700 opacity-60 hover:opacity-100'}`}
                >
                  <EquipmentItemIcon type={itemType} itemId={itemId} amount={0} size={12} eventData={eventDataForIcon} iconData={iconData} />
                </button>
              );
            })}
          </div>
        </div>
        {itemFilter.size > 0 && (
          <button onClick={() => setItemFilter(new Set())} className="mt-4 text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
            <FaUndo size={10} /> {t('equipment.resetFilter')}
          </button>
        )}
      </div>
    </div>
  );
};
