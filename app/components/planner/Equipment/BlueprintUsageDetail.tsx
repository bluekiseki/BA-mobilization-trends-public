import type { EventData, IconData } from '~/types/plannerData';
import { EquipmentItemIcon } from './common';
import { getTierFromEquipmentId, calculateBlueprintCost, equipmentTypeToBlueprint } from '~/utils/blueprintUtils';
import { useTranslation } from 'react-i18next';

interface BlueprintUsageDetailProps {
  blueprintsUsedByItem: Record<string, Record<string, number>>;
  blueprintsUsed: Record<string, number>;
  eventDataForIcon: EventData;
  iconData: IconData;
}

export const BlueprintUsageDetail: React.FC<BlueprintUsageDetailProps> = ({ blueprintsUsedByItem, blueprintsUsed, eventDataForIcon, iconData }) => {
  const { t } = useTranslation('planner');

  if (Object.keys(blueprintsUsedByItem).length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-neutral-100 dark:border-neutral-800 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">{t('equipment.blueprintUsageDetail')}</p>
      {Object.entries(blueprintsUsedByItem).map(([eqType, itemMap]) => {
        const bpId = equipmentTypeToBlueprint[eqType];
        const totalUsed = blueprintsUsed[eqType] || 0;
        return (
          <div key={eqType} className="mb-2">
            {/* Type header */}
            <div className="flex items-center gap-1 mb-1">
              {bpId && iconData.Equipment?.[String(bpId)] && (
                <EquipmentItemIcon type="Equipment" itemId={String(bpId)} size={16} imageOnly eventData={eventDataForIcon} iconData={iconData} amount={''} />
              )}
              <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">{eqType}</span>
              <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 ml-1">{t('equipment.blueprintTotalUsed', { count: totalUsed })}</span>
            </div>
            {/* Details per item */}
            <div className="pl-5 flex flex-wrap gap-1">
              {Object.entries(itemMap).map(([key, usedBp]) => {
                const equipId = Number(key.split('_')[1]);
                const tier = getTierFromEquipmentId(equipId);
                const cost = calculateBlueprintCost(tier);
                const itemCount = cost > 0 ? (usedBp / cost).toFixed(1) : '?';
                return (
                  <div key={key} className="flex items-center gap-0.5 bg-yellow-50 dark:bg-yellow-900/20 rounded px-1.5 py-0.5">
                    <EquipmentItemIcon type="Equipment" itemId={String(equipId % 10000)} amount={''} size={12} eventData={eventDataForIcon} iconData={iconData} />
                    <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">×{itemCount}</span>
                    <span className="text-[9px] text-neutral-400 dark:text-neutral-500">{t('equipment.blueprintSheets', { count: usedBp })}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
