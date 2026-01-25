// app/components/planner/FloatingCurrencyStatus.tsx
import { useState, useRef, useEffect } from 'react';
import { ItemIcon } from './common/Icon';
import type { EventData, IconData, TransactionEntry } from '~/types/plannerData';
import { getFreeStudentID } from './getFreeStudentId';
import { CurrencyStatus } from './CurrencyStatus';
import { FinalResultsDisplay } from './FinalResultsDisplay';
import { IoMdClose } from 'react-icons/io';
import { BsArrowsFullscreen } from 'react-icons/bs';
import { useTranslation } from 'react-i18next';

interface FloatingCurrencyStatusProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  ownedCurrency: Record<number, number>; // for CurrencyStatus
  setOwnedCurrency: React.Dispatch<React.SetStateAction<Record<number, number>>>; // for CurrencyStatus
  remainingCurrency: Record<string, number>; // For display at scale/extension
  acquiredItemsResult: {
    totalItems: Record<
      string,
      {
        amount: number;
        isBonusApplied: boolean;
      }
    >;
    transactions: TransactionEntry[];
    totalApUsed: number;
  } | null; // for FinalResultsDisplay
}

const getShowItems = (eventData: EventData, remainingCurrency: Record<number, number>) => {
  const items = eventData.currency
    .filter((currency) => currency.EventContentItemType != 7) // Exclusion of Type 7 (e.g., Event Points)
    .map((currency) => ({
      type: 'Item',
      id: currency.ItemUniqueId,
      amount: remainingCurrency[currency.ItemUniqueId] || 0,
    }));

  const freeStudentID = getFreeStudentID(eventData);
  if (freeStudentID) {
    items.push({
      id: freeStudentID,
      type: 'Item',
      amount: remainingCurrency[freeStudentID] || 0,
    });
  }
  return items;
};

export const FloatingCurrencyStatus = ({ eventId, eventData, iconData, ownedCurrency, setOwnedCurrency, remainingCurrency, acquiredItemsResult }: FloatingCurrencyStatusProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation('planner');

  const showItems = getShowItems(eventData, remainingCurrency);

  //Close Modal External Click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };
    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  return (
    <>
      {!isExpanded && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="relative bg-white/90 dark:bg-neutral-800/90 backdrop-blur-md rounded-xl shadow-lg border dark:border-neutral-700">
            <button
              onClick={() => setIsExpanded(true)}
              className="absolute -top-3 -left-3 z-10 p-2 bg-gray-400 hover:bg-gray-500 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold rounded-full shadow-md transition-all hover:scale-110 active:scale-95"
              aria-label="View more"
            >
              <BsArrowsFullscreen size={14} />
            </button>

            <div className="p-3 pt-4">
              <div className="flex flex-wrap gap-x-3 gap-y-2 justify-center px-2" style={{ maxWidth: '300px' }}>
                {showItems.map(({ type, id, amount }) => (
                  <div key={`${type}-${id}`} className="flex items-center flex-col gap-0.5" style={{ minWidth: '40px' }}>
                    <ItemIcon type={type} itemId={String(id)} amount={Math.abs(amount)} size={8} eventData={eventData} iconData={iconData} />
                    <span className={`text-xs font-bold ${amount < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}>{Math.round(amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isExpanded && (
        // <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-100 flex items-end sm:items-start justify-center p-0 sm:p-4 transition-opacity duration-200">
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-100 flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity duration-200">
          <div
            ref={modalRef}
            className="bg-white dark:bg-neutral-800 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-4xl h-[95vh] sm:h-auto sm:max-h-[185vh] flex flex-col overflow-hidden border dark:border-neutral-700 animate-slide-up sm:animate-fade-in-up"
          >
            <div className="flex justify-between items-center p-3 sm:p-4 border-b dark:border-neutral-700 ">
              <h2 className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100">{t('ui.currencyStatusTitle')}</h2>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-neutral-700"
                aria-label="Close"
              >
                <IoMdClose size={20} />
              </button>
            </div>

            <div className="grow overflow-y-hidden sm:overflow-y-auto p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <CurrencyStatus eventData={eventData} iconData={iconData} ownedCurrency={ownedCurrency} setOwnedCurrency={setOwnedCurrency} remainingCurrency={remainingCurrency} />
                </div>
                <div>
                  {acquiredItemsResult ? (
                    <FinalResultsDisplay acquiredItemsResult={acquiredItemsResult} eventData={eventData} iconData={iconData} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">There is no calculation result.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
