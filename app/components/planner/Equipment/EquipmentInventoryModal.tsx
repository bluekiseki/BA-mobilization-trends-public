import { FaBoxOpen, FaSort } from 'react-icons/fa6';
import { NumberInput } from '../common/NumberInput';
import { EquipmentItemIcon, getEquipmentTierLabel } from './common';
import { useMemo, useState } from 'react';
import type { EventData, IconData, IconInfos } from '~/types/plannerData';
import { FaCheckSquare, FaMinusSquare } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

export const EquipmentInventoryModal = ({
  isOpen,
  onClose,
  allFarmableItems,
  inventory,
  setInventoryItem,
  eventDataForIcon,
  iconData,
  iconInfoData,
}: {
  isOpen: boolean;
  onClose: () => void;
  allFarmableItems: string[];
  inventory: Record<string, number>;
  setInventoryItem: (key: string, amount: number) => void;
  eventDataForIcon: EventData;
  iconData: IconData;
  iconInfoData: IconInfos;
}) => {
  // Sort state (id: By ID, tier: By Tier)
  const [sortMode, setSortMode] = useState<'tier' | 'id'>('tier');
  const { t } = useTranslation('planner');

  const sortedFarmableItems = useMemo(() => {
    return [...allFarmableItems].sort((a, b) => {
      const idA = parseInt(a.split('_')[1], 10);
      const idB = parseInt(b.split('_')[1], 10);
      if (sortMode === 'tier') {
        // Apply requested tier sorting logic
        const itemInfoA = iconInfoData.Equipment?.[idA];
        const itemInfoB = iconInfoData.Equipment?.[idB];
        const tierLabelA = getEquipmentTierLabel(itemInfoA);
        const tierLabelB = getEquipmentTierLabel(itemInfoB);
        const tierA = tierLabelA ? parseInt(tierLabelA) : 0;
        const tierB = tierLabelB ? parseInt(tierLabelB) : 0;
        // High Tier -> Low Tier -> ID order (Use 1e7 logic)
        return tierB * 1e7 + idB - (tierA * 1e7 + idA);
      }
      // By ID (Ascending)
      return idA - idB;
    });
  }, [allFarmableItems, sortMode, iconInfoData.Equipment]);

  if (!isOpen) return null;

  // Set All Handler
  const handleSetAll = (value: number) => {
    // Do not apply only to items displayed (sorted) in the modal,
    // Apply to allFarmableItems
    allFarmableItems.forEach((key) => {
      setInventoryItem(key, value);
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[70vh] bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold dark:text-gray-100 flex items-center gap-2">
            <FaBoxOpen /> {t('equipment.inventoryModalTitle')}
          </h3>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-2xl">
            &times;
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('equipment.inventoryModalDesc')}</p>
        {/* Control Buttons (Sort, Min/Max) */}
        <div className="flex justify-between items-center mb-4 gap-2">
          <button onClick={() => setSortMode((prev) => (prev === 'id' ? 'tier' : 'id'))} className="text-sm flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-neutral-700 rounded-md">
            <FaSort /> {sortMode === 'id' ? t('equipment.sortById') : t('equipment.sortByTier')}
          </button>
          <div className="flex gap-2">
            <button onClick={() => handleSetAll(0)} className="text-sm flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded-md">
              <FaMinusSquare /> {t('equipment.setAllZero')}
            </button>
            <button onClick={() => handleSetAll(9999)} className="text-sm flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 rounded-md">
              <FaCheckSquare /> {t('equipment.setAllMax')}
            </button>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto pr-2 -mr-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {sortedFarmableItems.map((key) => {
              const itemType = key.split('_')[0] as keyof IconInfos;
              const itemId = key.split('_')[1];
              const itemInfo = iconInfoData.Equipment?.[itemId];
              const tierLabel = getEquipmentTierLabel(itemInfo);
              return (
                <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-neutral-700/50 rounded-md">
                  <div className="shrink-0">
                    <EquipmentItemIcon
                      type={itemType}
                      itemId={itemId}
                      amount={0}
                      size={10}
                      eventData={eventDataForIcon}
                      iconData={iconData}
                      label={tierLabel}
                      labelColor="bg-teal-700 dark:bg-teal-800"
                    />
                  </div>
                  {/* NumberInput Wrapper */}
                  <div className="flex-1 min-w-0">
                    <NumberInput value={inventory[key] || 0} onChange={(val) => setInventoryItem(key, val || 0)} min={0} max={9999} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
