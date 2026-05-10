import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomNumberInput } from '~/components/CustomInput';
import { equipmentBlueprintId, equipmentId } from '~/data/growthData';
import { getTierFromEquipmentId } from '~/utils/blueprintUtils';
import type { IconData } from '~/types/plannerData';
import { EquipmentItemIcon } from './common';

const CATEGORIES = ['Hat', 'Gloves', 'Shoes', 'Bag', 'Badge', 'Hairpin', 'Charm', 'Watch', 'Necklace'] as const;
const CAT_SHORT: Record<string, string> = {
  Hat: 'Hat',
  Gloves: 'Glv',
  Shoes: 'Sho',
  Bag: 'Bag',
  Badge: 'Bdg',
  Hairpin: 'Pin',
  Charm: 'Chm',
  Watch: 'Wch',
  Necklace: 'Nkl',
};

type EquipCat = (typeof CATEGORIES)[number];

interface EquipmentInventoryMatrixProps {
  allFarmableItems: string[];
  inventory: Record<string, number>;
  setInventoryItem: (key: string, amount: number) => void;
  demandMap: Record<string, number>;
  onClearAll: () => void;
  iconData: IconData;
}

export const EquipmentInventoryMatrix: React.FC<EquipmentInventoryMatrixProps> = ({ allFarmableItems, inventory, setInventoryItem, demandMap, onClearAll, iconData }) => {
  const { t } = useTranslation('planner');
  const farmableSet = useMemo(() => new Set(allFarmableItems), [allFarmableItems]);

  // console.log('normalizeBluprintToEquipment',allFarmableItems)

  const availableTiers = useMemo(() => {
    const tiers = new Set<number>();
    for (const key of allFarmableItems) {
      const id = Number(key.split('_')[1]);
      const tier = getTierFromEquipmentId(id);
      if (tier > 0) tiers.add(tier);
    }
    return Array.from(tiers).sort((a, b) => a - b);
  }, [allFarmableItems]);

  const getKey = (cat: EquipCat, tier: number): string => {
    const ids = equipmentId[cat] as number[];
    const id = ids[tier - 1];
    return id ? `Equipment_${id}` : '';
  };

  if (availableTiers.length === 0) {
    return <div className="px-3 py-4 text-[11px] text-gray-400 dark:text-gray-500 text-center">{t('equipment.inventoryLoadingData')}</div>;
  }

  const hasAnyInventory = Object.values(inventory).some((v) => v > 0);

  return (
    <div>
      <div className="flex justify-end px-3 py-1 gap-2">
        {hasAnyInventory && (
          <button onClick={onClearAll} className="text-[10px] text-red-400 hover:text-red-500 dark:text-red-500 dark:hover:text-red-400 transition-colors">
            {t('equipment.inventoryClear')}
          </button>
        )}
      </div>
      <div className="overflow-x-auto px-1.5 pb-2">
        <table className="w-full border-collapse" style={{ fontSize: 10 }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-white dark:bg-neutral-900 w-7 text-left pb-1 z-10" />
              {availableTiers.map((tier) => (
                <th key={tier} className="text-center font-mono font-semibold text-gray-400 dark:text-gray-500 pb-1" style={{ minWidth: 30 }}>
                  T{tier}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => {
              const equipIds = equipmentBlueprintId[cat] as number[];
              const t1EquipId = equipIds[1];
              return (
                <tr key={cat}>
                  <td className="sticky left-0 bg-white dark:bg-neutral-900 pr-1.5 py-0.5 z-10 whitespace-nowrap flex items-center gap-1.5">
                    {t1EquipId && iconData.Equipment?.[String(t1EquipId)] && (
                      <EquipmentItemIcon type="Equipment" itemId={String(t1EquipId)} size={16} imageOnly iconData={iconData} eventData={{ icons: { Equipment: {} } } as any} amount={''} />
                    )}
                    <span className="text-gray-500 dark:text-gray-400 font-medium">{CAT_SHORT[cat]}</span>
                  </td>
                  {availableTiers.map((tier) => {
                    const key = getKey(cat, tier);
                    if (!key) return <td key={tier} />;

                    const owned = inventory[key] || 0;
                    const demand = demandMap[key] || 0;
                    const isFarmable = farmableSet.has(key);

                    const isDeficit = demand > 0 && owned < demand;
                    const isSurplus = demand > 0 && owned >= demand;

                    return (
                      <td key={tier} className="py-0.5 px-0.5">
                        <CustomNumberInput
                          // type="number"
                          min={0}
                          max={9999}
                          value={owned}
                          placeholder="0"
                          onChange={(v) => setInventoryItem(key, v || 0)}
                          className={[
                            'w-full text-center font-mono h-6 rounded border text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors',
                            isDeficit
                              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                              : isSurplus
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                                : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 dark:text-gray-200',
                            !isFarmable ? 'opacity-35' : '',
                          ].join(' ')}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 flex gap-3 text-[9px] text-gray-400 dark:text-gray-500 px-1">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              disabled
              value="5"
              className="w-6 h-5 text-center font-mono text-[9px] rounded border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 cursor-not-allowed"
            />
            <span>{t('equipment.inventoryDeficient')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              disabled
              value="10"
              className="w-6 h-5 text-center font-mono text-[9px] rounded border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 cursor-not-allowed"
            />
            <span>{t('equipment.inventorySufficient')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              disabled
              value="—"
              className="w-6 h-5 text-center font-mono text-[9px] rounded border bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-400 dark:text-gray-500 opacity-35 cursor-not-allowed"
            />
            <span>{t('equipment.inventoryNotFarmable')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
