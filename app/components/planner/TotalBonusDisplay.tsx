// src/components/TotalBonusDisplay.tsx

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventData, IconData, StudentData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getLocalizeEtcName } from './common/locale';
import { ItemIcon } from './common/Icon';
import type { WithNonNullable } from '~/utils/WithNonNullable';

interface TotalBonusDisplayProps {
  eventData: WithNonNullable<EventData, 'currency' | 'bonus'>;
  iconData: IconData;
  totalBonus: { [itemUniqueId: number]: number };
  allStudents: StudentData; // Added to calculate theoretical max based on SquadType
}

export const TotalBonusDisplay = ({ eventData, iconData, totalBonus, allStudents }: TotalBonusDisplayProps) => {
  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;

  // 1. Identification of items that have bonuses in this event
  const bonusItems = useMemo(() => {
    const items = new Set<number>();
    Object.values(eventData.bonus || {}).forEach((bonus) => {
      bonus.EventContentItemType.forEach((itemId) => items.add(itemId));
    });
    return items;
  }, [eventData.bonus]);

  // 2. Calculate Theoretical Max Bonus (Top 4 Strikers + Top 2 Specials)
  const maxBonusMap = useMemo(() => {
    const map: { [itemUniqueId: number]: number } = {};

    eventData.currency.forEach((currency) => {
      // Skip if this currency has no bonus students
      if (!bonusItems.has(currency.EventContentItemType)) return;

      const itemType = currency.EventContentItemType;

      // Filter students who have a bonus for this specific item
      const relevantStudents = Object.entries(eventData.bonus)
        .map(([id, bonusInfo]) => {
          const typeIndex = bonusInfo.EventContentItemType.indexOf(itemType);
          if (typeIndex === -1) return null;

          const studentInfo = allStudents[Number(id)];
          // Fallback logic for SquadType if data is missing (10000~19999 is usually Main)
          const squadType = studentInfo?.SquadType || (Number(id) < 20000 ? 'Main' : 'Support');

          return {
            id,
            squadType,
            bonusValue: bonusInfo.BonusPercentage[typeIndex],
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      // Separate into Main (Striker) and Support (Special)
      const strikers = relevantStudents.filter((s) => s.squadType === 'Main');
      const specials = relevantStudents.filter((s) => s.squadType === 'Support');

      // Sort descending by bonus value
      strikers.sort((a, b) => b.bonusValue - a.bonusValue);
      specials.sort((a, b) => b.bonusValue - a.bonusValue);

      // Sum: Top 4 Strikers + Top 2 Specials
      const topStrikers = strikers.slice(0, 4);
      const topSpecials = specials.slice(0, 2);

      const totalStrikersBonus = topStrikers.reduce((sum, s) => sum + s.bonusValue, 0);
      const totalSpecialsBonus = topSpecials.reduce((sum, s) => sum + s.bonusValue, 0);

      map[currency.ItemUniqueId] = totalStrikersBonus + totalSpecialsBonus;
    });

    return map;
  }, [eventData, allStudents, bonusItems]);

  return (
    <>
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">{t('ui.currentBonus')}</h3>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
        {eventData.currency
          .filter((c) => bonusItems.has(c.EventContentItemType))
          .map((currency) => {
            const currentVal = totalBonus[currency.ItemUniqueId] || 0;
            const maxVal = maxBonusMap[currency.ItemUniqueId] || 0;
            const itemId = currency.ItemUniqueId.toString();

            return (
              <div key={currency.ItemUniqueId} className="flex items-center gap-2">
                {/* Icon size maintained as original */}
                <ItemIcon type={'Item'} itemId={itemId} amount={currentVal / 100} size={12} eventData={eventData} iconData={iconData} />

                <div>
                  <div className="flex items-baseline gap-1">
                    {/* Current Bonus: Blue color maintained */}
                    <p className="font-bold text-blue-600 dark:text-blue-400 text-base">+{currentVal / 100}%</p>
                    {/* Max Bonus: Gray color, smaller font */}
                    {maxVal > 0 && <p className="font-medium text-neutral-400 dark:text-neutral-500 text-xs">/ {maxVal / 100}%</p>}
                  </div>

                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 -mt-0.5 truncate" style={{ maxWidth: '90px' }}>
                    {getLocalizeEtcName(eventData.icons.Item?.[itemId]?.LocalizeEtc, locale)}
                  </p>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
};
