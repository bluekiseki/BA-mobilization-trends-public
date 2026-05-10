// src/components/CurrencyStatus.tsx

import { useState } from 'react';
import { ItemIcon } from './common/Icon';
import type { EventData, IconData } from '~/types/plannerData';
import { getLocalizeEtcName } from './common/locale';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { CustomNumberInput } from '../CustomInput';

interface CurrencyStatusProps {
  eventData: EventData;
  iconData: IconData;
  ownedCurrency: Record<number, number>;
  setOwnedCurrency: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  remainingCurrency: Record<number, number>;
  defaultEditing?: boolean;
  // ref: RefObject<HTMLDivElement | null>  ;
}

export const CurrencyStatus = ({
  eventData,
  iconData,
  ownedCurrency,
  setOwnedCurrency,
  remainingCurrency,
  defaultEditing = false,
  // ref
}: CurrencyStatusProps) => {
  const [isEditing, setIsEditing] = useState(defaultEditing);

  const handleOwnedChange = (itemId: number, value: string) => {
    const amount = parseInt(value) || 0;
    setOwnedCurrency((prev) => ({ ...prev, [itemId]: amount }));
  };

  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;

  return (
    <>
      <div
        className="flex justify-between items-center mb-3"
        //  ref={ref}
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('ui.remainingCurrency')}</h2>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-300 px-3 py-1 rounded-md transition-colors"
        >
          {isEditing ? t('button.confirmInput') : t('ui.initialAmount')}
        </button>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {eventData.currency
          .filter((currency) => currency.EventContentItemType != 7)
          .map((currency) => {
            const itemId = currency.ItemUniqueId;
            const finalAmount = remainingCurrency[itemId] || 0;

            return (
              <div key={itemId} className="shrink-0">
                <div className="flex items-center gap-2">
                  <ItemIcon type="Item" itemId={String(itemId)} amount={finalAmount > 0 ? finalAmount : -finalAmount} size={10} eventData={eventData} iconData={iconData} />
                  <div>
                    <p className={`text-lg font-bold leading-tight ${finalAmount < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{finalAmount.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 -mt-1 truncate" style={{ maxWidth: '80px' }}>
                      {getLocalizeEtcName(eventData.icons.Item?.[itemId]?.LocalizeEtc, locale)}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{t('ui.initialOwned', { value: (ownedCurrency[itemId] || 0).toLocaleString() })}</p>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-1">
                    <CustomNumberInput
                      // type="number"
                      value={ownedCurrency[itemId] || null}
                      onChange={(e) => handleOwnedChange(itemId, String(e))}
                      placeholder={t('ui.currencyInitialInput')}
                      className="w-full p-1 text-xs rounded border dark:border-neutral-600 text-right bg-transparent dark:text-gray-200"
                    />
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </>
  );
};
