// app/components/planner/RepeatableTab.tsx
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import type { EventData, IconData, Mission, Stage } from '~/types/plannerData';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { CustomNumberInput } from '../CustomInput';
import { CustomCheckbox } from '../CustomCheckbox';
import { ItemIcon } from './common/Icon';
import type { StagePrio } from './FarmingPlannerTypes';
import type { JSX } from 'react';

interface RepeatableTabProps {
  farmingStages: (Stage & { type: 'stage' | 'story' | 'challenge' })[];
  stagePrio: Record<number, StagePrio>;
  runCounts: Record<number, number>;
  firstClears: Record<number, boolean>;
  missionsByStageId: Map<number | string, Mission[]>;
  totalBonus: Record<number, number>;
  minimizeRepeatableInfo: boolean;
  setMinimizeRepeatableInfo: (v: boolean) => void;
  showOneTimeRewards: boolean;
  setShowOneTimeRewards: (v: boolean) => void;
  handleStagePrioChange: (stageId: number) => void;
  handleRunCountChange: (stageId: number, value: number) => void;
  handleFirstClearToggle: (stageId: number) => void;
  handleToggleAllFirstClears: () => void;
  handleSetMaxRuns: (stageId: number) => void;
  handleBatchTogglePrio: (start: number, end: number) => void;
  allFirstClearsState: 'unchecked' | 'checked' | 'indeterminate';
  eventData: EventData;
  iconData: IconData;
}

export const RepeatableTab = ({
  farmingStages,
  stagePrio,
  runCounts,
  firstClears,
  missionsByStageId,
  totalBonus,
  minimizeRepeatableInfo,
  setMinimizeRepeatableInfo,
  showOneTimeRewards,
  setShowOneTimeRewards,
  handleStagePrioChange,
  handleRunCountChange,
  handleFirstClearToggle,
  handleToggleAllFirstClears,
  handleSetMaxRuns,
  handleBatchTogglePrio,
  allFirstClearsState,
  eventData,
  iconData,
}: RepeatableTabProps) => {
  const { t, i18n } = useTranslation('planner');
  const { t: t_c } = useTranslation('common');
  const locale = i18n.language as Locale;

  const prioButtonInfo: Record<StagePrio, { text: string; className: string }> = {
    include: { text: t('common.include'), className: 'bg-green-500 hover:bg-green-600' },
    priority: { text: t('common.priority'), className: 'bg-blue-500 hover:bg-blue-600' },
    exclude: { text: t('common.exclude'), className: 'bg-gray-400 hover:bg-gray-500' },
  };

  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
        {/* Left: Display toggle options */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMinimizeRepeatableInfo(!minimizeRepeatableInfo)}
            className="text-sm font-semibold text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
          >
            {minimizeRepeatableInfo ? t_c('viewMore') : t_c('viewSimple')}
          </button>
          {!minimizeRepeatableInfo && (
            <>
              <span className="text-gray-300 dark:text-neutral-600 mx-1">|</span>
              <button onClick={() => setShowOneTimeRewards(!showOneTimeRewards)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                {showOneTimeRewards ? t('button.hideOneTimeRewards') : t('button.showOneTimeRewards')}
              </button>
            </>
          )}
        </div>

        {/* Right: Batch operation buttons */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <div className="flex items-center gap-2" role="group">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mr-1">{t('button.quickExclude')}</span>
            <button
              onClick={() => handleBatchTogglePrio(1, 4)}
              className="bg-gray-500 hover:bg-gray-600 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold py-1 px-2 rounded-md text-xs"
            >
              1-4
            </button>
            <button
              onClick={() => handleBatchTogglePrio(5, 8)}
              className="bg-gray-500 hover:bg-gray-600 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold py-1 px-2 rounded-md text-xs"
            >
              5-8
            </button>
            <button
              onClick={() => handleBatchTogglePrio(9, 12)}
              className="bg-gray-500 hover:bg-gray-600 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold py-1 px-2 rounded-md text-xs"
            >
              9-12
            </button>
          </div>
          <div className="h-4 border-l border-gray-300 dark:border-neutral-600 mx-1"></div>
          <label
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold py-1 px-3 rounded-md text-sm cursor-pointer"
            data-component-name="FarmingPlanner_f1"
          >
            <CustomCheckbox state={allFirstClearsState} onChange={handleToggleAllFirstClears} />
            <span className="select-none">{t('button.setAllFirstClear')}</span>
          </label>
        </div>
      </div>

      <div className="divide-y dark:divide-neutral-600">
        {farmingStages.map((s) => {
          const currentPrio = stagePrio[s.Id] || 'include';
          const btnInfo = prioButtonInfo[currentPrio];
          const repeatableRewards = s.EventContentStageReward.filter((r) => ['Event', 'Default', 'Rare'].includes(r.RewardTagStr));
          const associatedMissions = missionsByStageId.get(s.Id);

          const bonusRewards = repeatableRewards
            .map((r) => {
              const bonusPercent = totalBonus[r.RewardId];
              if (bonusPercent && bonusPercent > 0) {
                return {
                  id: r.RewardId,
                  type: r.RewardParcelTypeStr,
                  amount: Math.ceil((((r.RewardAmount * r.RewardProb) / 10000) * bonusPercent) / 10_000),
                };
              }
              return null;
            })
            .filter((item): item is { id: number; type: string; amount: number } => item !== null);

          if (minimizeRepeatableInfo) {
            const stageNumMatch = s.Name.match(/(\d+)$/);
            const stageNum = stageNumMatch ? stageNumMatch[1] : s.Name.split('_').pop();

            const eventCurrencyIds = eventData.currency.map((c) => c.ItemUniqueId);
            const eventRewards = s.EventContentStageReward.filter((r) => eventCurrencyIds.includes(r.RewardId) && ['Event', 'Default', 'Rare'].includes(r.RewardTagStr));
            // Highest tier Oparts (regardless of Rare tag, non-currency, non-GachaGroup, lower probability means higher tier)
            const topOopart =
              s.EventContentStageReward.filter((r) => !['FirstClear', 'ThreeStar'].includes(r.RewardTagStr) && !eventCurrencyIds.includes(r.RewardId) && r.RewardParcelTypeStr !== 'GachaGroup').sort(
                (a, b) => a.RewardProb - b.RewardProb,
              )[0] ?? null;

            return (
              <div key={s.Id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`${firstClears[s.Id] ? 'underline' : ''} font-bold text-sky-600 dark:text-sky-400 w-8 text-left`}>{stageNum}</span>
                </div>

                {/* Event Currency + Oparts */}
                <div className="flex-1 flex items-center gap-2 overflow-x-auto min-w-0">
                  {eventRewards.map((r, i) => {
                    const baseAmount = (r.RewardAmount * r.RewardProb) / 10000;
                    const bonusPercent = totalBonus[r.RewardId] || 0;
                    let amountString = `${baseAmount}+${0}`;
                    if (bonusPercent > 0) {
                      const bonusPart = Math.ceil((baseAmount * bonusPercent) / 10000);
                      amountString = `${baseAmount}+${bonusPart}`;
                    }
                    return (
                      <div key={`min-reward-${i}-${r.RewardId}`} className="flex items-center gap-1 shrink-0" title={`${amountString} per run`}>
                        <ItemIcon type={r.RewardParcelTypeStr} itemId={r.RewardId.toString()} size={12} amount={amountString} eventData={eventData} iconData={iconData} />
                      </div>
                    );
                  })}
                  {topOopart && (
                    <div className="flex items-center gap-1 shrink-0" title={`${(topOopart.RewardAmount * topOopart.RewardProb) / 10000} per run`}>
                      <ItemIcon
                        type={topOopart.RewardParcelTypeStr}
                        itemId={topOopart.RewardId.toString()}
                        size={12}
                        amount={(topOopart.RewardAmount * topOopart.RewardProb) / 10000}
                        eventData={eventData}
                        iconData={iconData}
                      />
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => handleStagePrioChange(s.Id)} className={`w-12 text-white font-bold py-1 rounded-md text-xs ${btnInfo.className}`}>
                    {btnInfo.text}
                  </button>
                  <CustomNumberInput
                    min={0}
                    value={runCounts[s.Id] || 0}
                    onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                    placeholder={t('common.count')}
                    className="w-14 py-1 text-base scale-[0.75] rounded bg-gray-100 dark:bg-neutral-700 text-center border dark:border-neutral-600 dark:text-gray-200"
                  />
                  <button onClick={() => handleSetMaxRuns(s.Id)} className="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold px-2 py-1 rounded-md text-xs">
                    M
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={s.Id} className="p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* 1: Stage information */}
                <div className="w-full sm:w-55 sm:shrink-0">
                  <h4 className="font-bold text-base text-sky-600 dark:text-sky-400 truncate">
                    {s.Name.split('_')
                      .pop()
                      ?.replace('Stage', t('common.stage') + ' ')}
                  </h4>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    <span className="shrink-0">{s.StageEnterCostAmount}AP</span>
                    <span className="shrink-0">Lv.{s.RecommandLevel}</span>
                    <span className="shrink-0">
                      {s.BattleDuration / 1000}
                      {t('common.seconds')}
                    </span>
                    {s.StageHintStr && (
                      <Tooltip
                        placement="top"
                        trigger={['hover']}
                        styles={{ root: { maxWidth: '20rem' } }}
                        overlay={<span>{locale === 'ko' ? s.StageHintStr.DescriptionKr : s.StageHintStr.DescriptionJp}</span>}
                      >
                        <span className="font-bold text-blue-500 dark:text-blue-400 cursor-help shrink-0">💡 {t('common.hint')}</span>
                      </Tooltip>
                    )}
                    {associatedMissions && (
                      <Tooltip
                        placement="top"
                        trigger={['hover']}
                        overlay={
                          <div>
                            {associatedMissions.map((m) => (
                              <div key={m.Id}>{t('mission.clearWithinSeconds').replace('{seconds}', String(m.CompleteConditionCount))}</div>
                            ))}
                          </div>
                        }
                      >
                        <span className="font-bold text-yellow-600 dark:text-yellow-500 cursor-help shrink-0">🏆 {t('common.mission')}</span>
                      </Tooltip>
                    )}
                    <label
                      className="flex items-center space-x-1.5 cursor-pointer p-1 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 shrink-0 sm:w-full"
                      title={t('button.includeOneTimeRewards')}
                    >
                      <input
                        type="checkbox"
                        checked={!!firstClears[s.Id]}
                        onChange={() => handleFirstClearToggle(s.Id)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-neutral-600 bg-transparent"
                      />
                      <span className="text-gray-700 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{t('button.includeOneTimeRewards')}</span>
                    </label>
                  </div>
                </div>

                {/* Rewards Information */}
                <div className="w-full sm:flex-1 min-w-0">
                  <div className="flex overflow-x-auto gap-1.5">
                    <div className="flex overflow-x-auto gap-1.5 mt-1 pb-2">
                      {(() => {
                        const eventCurrencyIds = eventData.currency.map((c) => c.ItemUniqueId);

                        // Categorize and sort rewards (Detail page: Show all items)
                        const specialRewards = s.EventContentStageReward.filter((r) => ['FirstClear', 'ThreeStar'].includes(r.RewardTagStr)).sort((a, b) => {
                          const order: Record<string, number> = { FirstClear: 0, ThreeStar: 1 };
                          return (order[a.RewardTagStr] ?? 2) - (order[b.RewardTagStr] ?? 2);
                        });

                        const eventCurrencyRewards = s.EventContentStageReward.filter((r) => eventCurrencyIds.includes(r.RewardId) && !['FirstClear', 'ThreeStar'].includes(r.RewardTagStr));

                        const opartsRewards = s.EventContentStageReward.filter(
                          (r) => !['FirstClear', 'ThreeStar'].includes(r.RewardTagStr) && !eventCurrencyIds.includes(r.RewardId) && r.RewardParcelTypeStr !== 'GachaGroup',
                        ).sort((a, b) => a.RewardProb - b.RewardProb); // Lower value means rarer item

                        const gachaGroupRewards = s.EventContentStageReward.filter((r) => r.RewardParcelTypeStr === 'GachaGroup');

                        const elements: JSX.Element[] = [];

                        // 1. Special Rewards (FirstClear, ThreeStar)
                        specialRewards.forEach((r, i) => {
                          const isOneTimeReward = ['FirstClear', 'ThreeStar'].includes(r.RewardTagStr);
                          if (isOneTimeReward && !showOneTimeRewards) return;

                          let label: string | null = null;
                          let labelColor = 'bg-gray-700';
                          switch (r.RewardTagStr) {
                            case 'FirstClear':
                              label = 'First';
                              labelColor = 'bg-yellow-500';
                              break;
                            case 'ThreeStar':
                              label = '３★';
                              labelColor = 'bg-amber-400';
                              break;
                          }
                          elements.push(
                            <div key={`reward-special-${i}-${r.RewardId}`}>
                              <ItemIcon
                                type={r.RewardParcelTypeStr}
                                itemId={r.RewardId.toString()}
                                amount={(r.RewardAmount * r.RewardProb) / 10000}
                                size={10}
                                eventData={eventData}
                                iconData={iconData}
                                label={label}
                                labelColor={labelColor}
                              />
                            </div>,
                          );
                        });

                        // 2. Event Currency (eventCurrencyRewards)
                        eventCurrencyRewards.forEach((r, i) => {
                          elements.push(
                            <div key={`reward-currency-${i}-${r.RewardId}`}>
                              <ItemIcon
                                type={r.RewardParcelTypeStr}
                                itemId={r.RewardId.toString()}
                                amount={(r.RewardAmount * r.RewardProb) / 10000}
                                size={10}
                                eventData={eventData}
                                iconData={iconData}
                              />
                            </div>,
                          );
                        });

                        // 3. Bonus (Immediately after eventCurrencyRewards)
                        bonusRewards.forEach((br, i) => {
                          elements.push(
                            <div key={`reward-bonus-${i}-${br.id}`}>
                              <ItemIcon type={br.type} itemId={br.id.toString()} amount={br.amount} size={10} eventData={eventData} iconData={iconData} label="Bonus" labelColor="bg-[#ea5691]" />
                            </div>,
                          );
                        });

                        // 4. Oparts (opartsRewards)
                        opartsRewards.forEach((r, i) => {
                          elements.push(
                            <div key={`reward-opart-${i}-${r.RewardId}`}>
                              <ItemIcon
                                type={r.RewardParcelTypeStr}
                                itemId={r.RewardId.toString()}
                                amount={(r.RewardAmount * r.RewardProb) / 10000}
                                size={10}
                                eventData={eventData}
                                iconData={iconData}
                                label="Rare"
                                labelColor="bg-[#2f4e73]"
                              />
                            </div>,
                          );
                        });

                        // 5. GachaGroup (gachaGroupRewards)
                        gachaGroupRewards.forEach((r, i) => {
                          elements.push(
                            <div key={`reward-gacha-${i}-${r.RewardId}`}>
                              <ItemIcon
                                type={r.RewardParcelTypeStr}
                                itemId={r.RewardId.toString()}
                                amount={(r.RewardAmount * r.RewardProb) / 10000}
                                size={10}
                                eventData={eventData}
                                iconData={iconData}
                              />
                            </div>,
                          );
                        });

                        return elements;
                      })()}
                    </div>
                  </div>
                </div>

                {/* Control button */}
                <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-48 justify-end">
                  <button onClick={() => handleStagePrioChange(s.Id)} className={`w-12 text-white font-bold py-1 rounded-md text-xs ${btnInfo.className}`}>
                    {btnInfo.text}
                  </button>
                  <CustomNumberInput
                    min={0}
                    value={runCounts[s.Id] || 0}
                    onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                    placeholder={t('common.count')}
                    className="grow sm:grow-0 w-14 py-1 text-base scale-[0.75] rounded bg-gray-100 dark:bg-neutral-700 text-center border dark:border-neutral-600 dark:text-gray-200"
                  />
                  <button onClick={() => handleSetMaxRuns(s.Id)} className="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold px-2.5 py-1 rounded-md text-xs">
                    MAX
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
