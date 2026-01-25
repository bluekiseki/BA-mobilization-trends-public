// src/components/TotalBonusDisplay.tsx

import { useTranslation } from 'react-i18next';
import type { EventData, IconData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getLocalizeEtcName } from './common/locale';
import { ItemIcon } from './common/Icon';

interface TotalBonusDisplayProps {
  eventData: EventData;
  iconData: IconData;
  totalBonus: { [itemUniqueId: number]: number };
}

export const TotalBonusDisplay = ({ eventData, iconData, totalBonus }: TotalBonusDisplayProps) => {
  const { t, i18n } = useTranslation('planner');

  const locale = i18n.language as Locale;
  const bonusItems = new Set<number>([]);
  Object.entries(eventData.bonus).map(([studentId, bouns], b) => {
    for (const itemID of bouns.EventContentItemType) {
      bonusItems.add(itemID);
    }
  });

  return (
    <>
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('ui.currentBonus')}</h3>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
        {eventData.currency
          .filter((c) => bonusItems.has(c.EventContentItemType))
          .map((currency) => {
            const bonusValue = totalBonus[currency.ItemUniqueId] || 0;
            const itemId = currency.ItemUniqueId.toString();
            // const itemInfo = eventData.icons.Item[itemId as any];

            return (
              <div key={currency.ItemUniqueId} className="flex items-center gap-2">
                <ItemIcon type={'Item'} itemId={itemId} amount={bonusValue / 100} size={12} eventData={eventData} iconData={iconData} />

                <div>
                  <p className="font-bold text-blue-600 dark:text-blue-400 text-base">+{bonusValue / 100}%</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 -mt-1 truncate" style={{ maxWidth: '80px' }}>
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
