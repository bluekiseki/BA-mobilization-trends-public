// app/components/planner/FinalResultsDisplay.tsx
import { useState } from 'react';
import { ItemIcon } from './common/Icon';
import { useTranslation } from 'react-i18next';
import type { EventData, IconData, TransactionEntry } from '~/types/plannerData';
import { getItemSortPriority } from '~/utils/itemSort';
import type { TFunction } from 'i18next';

interface FinalResultsDisplayProps {
  acquiredItemsResult: {
    totalItems: Record<string, { amount: number; isBonusApplied: boolean }>;
    transactions: TransactionEntry[];
  };
  eventData: EventData;
  iconData: IconData;
}

const getTransactionSourceName = (source: string, t: TFunction<'planner', undefined>) => {
  const keyMap: Record<string, string> = {
    shop_cost: 'source.shopCost',
    shop_reward: 'source.shopReward',
    farming: 'source.farming',
    cardShop_cost: 'source.cardShopCost',
    cardShop_reward: 'source.cardShopReward',
    treasure_cost: 'source.treasureCost',
    treasure_reward: 'source.treasureReward',
    boxGacha_cost: 'source.boxGachaCost',
    boxGacha_reward: 'source.boxGachaReward',
    customGame_cost: 'source.customGameCost',
    customGame_reward: 'source.customGameReward',
    fortuneGacha_cost: 'source.fortuneGachaCost',
    fortuneGacha_reward: 'source.fortuneGachaReward',
    totalReward_reward: 'source.totalRewardReward',
    totalReward_cost: 'source.totalRewardCost',
    mission_reward: 'source.missionReward',
    diceRace_cost: 'source.diceRaceCost',
    diceRace_reward: 'source.diceRaceReward',
    dreamMaker_cost: 'source.dreamMakerCost',
    dreamMaker_reward: 'source.dreamMakerReward',
    studentGrowth_cost: 'source.studentGrowthCost',
    cardMatch_reward: 'source.cardMatchReward',
    cardMatch_cost: 'source.cardMatchCost',
    minigame_ccg_cost: 'source.minigameCCGCost',
    minigame_ccg_reward: 'source.minigameCCGReward',
  };
  return t(keyMap[source] || (source as any));
};

export const FinalResultsDisplay = ({ acquiredItemsResult, eventData, iconData }: FinalResultsDisplayProps) => {
  const { t } = useTranslation('planner');
  const { t: t_c } = useTranslation('common');

  const [showDetails, setShowDetails] = useState(false);

  const [isExpanded, setIsExpanded] = useState({ gained: false, spent: false });

  const { transactions, totalItems } = acquiredItemsResult;

  const gainedItems: [string, { amount: number; isBonusApplied: boolean }][] = [];
  const spentItems: [string, { amount: number; isBonusApplied: boolean }][] = [];

  Object.entries(totalItems).forEach(([key, data]) => {
    if (data.amount > 0) gainedItems.push([key, data]);
    else if (data.amount < 0) spentItems.push([key, data]);
  });

  gainedItems.sort(([keyA, dataA], [keyB, dataB]) => {
    const prioA = getItemSortPriority(keyA, eventData);
    const prioB = getItemSortPriority(keyB, eventData);
    if (prioA !== prioB) return prioA - prioB;
    return dataB.amount - dataA.amount; // Second place: descending order of quantity
  });
  spentItems.sort(([keyA, dataA], [keyB, dataB]) => {
    const prioA = getItemSortPriority(keyA, eventData);
    const prioB = getItemSortPriority(keyB, eventData);
    if (prioA !== prioB) return prioA - prioB;
    return dataA.amount - dataB.amount; // 2nd place: In ascending order by negative
  });

  if (Object.keys(totalItems).length === 0 && transactions.length === 0) {
    return (
      <>
        <h2 className="text-xl font-bold mb-3">{t('ui.finalResultPreview')}</h2>
        <div className="text-center h-45 text-gray-500 dark:text-gray-400 py-4">{t('ui.previewDescription')}</div>
      </>
    );
  }

  const toggleExpand = (section: 'gained' | 'spent') => {
    setIsExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold">{t('ui.finalResultPreview')}</h2>
        {transactions.length > 0 && (
          <button onClick={() => setShowDetails(!showDetails)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
            {showDetails ? t('ui.viewSummary') : t('ui.viewDetails')}
          </button>
        )}
      </div>

      {!showDetails ? (
        <div className={'space-y-4 h-45'}>
          {gainedItems.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold text-green-700 dark:text-green-400">{t('label.totalAcquisition')}</h3>
                <button onClick={() => toggleExpand('gained')} className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  {isExpanded.gained ? t_c('close') : t_c('open')}
                </button>
              </div>

              <div className={`flex gap-2 border-t border-gray-200 dark:border-neutral-700 pt-2 ${isExpanded.gained ? 'flex-wrap  bg-white dark:bg-neutral-800' : 'overflow-x-auto pb-2'}`}>
                {gainedItems.map(([key, data]) => {
                  const [type, id] = key.split('_');
                  return (
                    <div key={key} className="relative shrink-0">
                      <ItemIcon type={type} itemId={id} amount={Math.round(data.amount)} size={10} eventData={eventData} iconData={iconData} />
                      {data.isBonusApplied && (
                        <span
                          className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-blue-500 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-neutral-800"
                          title={t('ui.studentBonus')}
                        >
                          B
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {spentItems.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold text-red-700 dark:text-red-400">{t('label.totalConsumption')}</h3>
                <button onClick={() => toggleExpand('spent')} className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  {isExpanded.spent ? t_c('close') : t_c('open')}
                </button>
              </div>
              <div className={`flex gap-2 border-t border-gray-200 dark:border-neutral-700 pt-2 ${isExpanded.spent ? 'flex-wrap' : 'overflow-x-auto pb-2'}`}>
                {spentItems.map(([key, data]) => {
                  const [type, id] = key.split('_');
                  return (
                    <div key={key} className="shrink-0">
                      <ItemIcon type={type} itemId={id} amount={Math.round(-data.amount)} size={10} eventData={eventData} iconData={iconData} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto pr-2">
          {transactions.map((transaction, index) => {
            const gainedTxItems: [string, { amount: number; isBonusApplied: boolean }][] = [];
            const spentTxItems: [string, { amount: number; isBonusApplied: boolean }][] = [];

            Object.entries(transaction.items).forEach(([key, data]) => {
              if (data.amount > 0) gainedTxItems.push([key, data]);
              else if (data.amount < 0) spentTxItems.push([key, data]);
            });

            gainedTxItems.sort(([keyA], [keyB]) => getItemSortPriority(keyA, eventData) - getItemSortPriority(keyB, eventData));
            spentTxItems.sort(([keyA], [keyB]) => getItemSortPriority(keyA, eventData) - getItemSortPriority(keyB, eventData));

            if (gainedTxItems.length === 0 && spentTxItems.length === 0) return null;

            return (
              <div key={`${transaction.source}-${index}`}>
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-2 border-b dark:border-neutral-700 pb-1">{getTransactionSourceName(transaction.source, t)}</h3>

                {gainedTxItems.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-2 pt-2 pb-1 border-t-3 border-green-500/30">
                    {gainedTxItems.map(([key, data]) => {
                      const [type, id] = key.split('_');
                      const roundedAmount = Math.round(data.amount);
                      if (roundedAmount === 0) return null;
                      return (
                        <div key={key} className="relative shrink-0">
                          <ItemIcon type={type} itemId={id} amount={roundedAmount} size={10} eventData={eventData} iconData={iconData} />
                          {data.isBonusApplied && (
                            <span
                              className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-blue-500 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-neutral-800"
                              title={t('ui.studentBonus')}
                            >
                              B
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {spentTxItems.length > 0 && (
                  <div className={`flex flex-wrap gap-x-3 gap-y-2 pt-2 pb-1 border-t-3 border-red-500/30 ${gainedTxItems.length > 0 ? 'mt-2' : ''}`}>
                    {spentTxItems.map(([key, data]) => {
                      const [type, id] = key.split('_');
                      const roundedAmount = Math.round(Math.abs(data.amount));
                      if (roundedAmount === 0) return null;
                      return (
                        <div key={key} className="relative shrink-0">
                          <ItemIcon type={type} itemId={id} amount={roundedAmount} size={10} eventData={eventData} iconData={iconData} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
