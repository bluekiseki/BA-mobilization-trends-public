// app/components/planner/OnetimeTab.tsx
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import type { EventData, IconData, Mission, Stage } from '~/types/plannerData';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { CustomNumberInput } from '../CustomInput';
import { CustomCheckbox } from '../CustomCheckbox';
import { ItemIcon } from './common/Icon';

interface OnetimeTabProps {
  oneTimeStages: (Stage & { type: 'stage' | 'story' | 'challenge' })[];
  missionsByStageId: Map<number | string, Mission[]>;
  runCounts: Record<number, number>;
  handleRunCountChange: (stageId: number, value: number) => void;
  handleToggleAllOneTimeRuns: () => void;
  allOneTimeRunsState: 'unchecked' | 'checked' | 'indeterminate';
  eventData: EventData;
  iconData: IconData;
}

export const OnetimeTab = ({ oneTimeStages, missionsByStageId, runCounts, handleRunCountChange, handleToggleAllOneTimeRuns, allOneTimeRunsState, eventData, iconData }: OnetimeTabProps) => {
  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;

  return (
    <>
      <div className="flex justify-end my-2">
        <label
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded-md text-sm cursor-pointer"
          data-component-name="FarmingPlanner_f2"
        >
          <CustomCheckbox state={allOneTimeRunsState} onChange={handleToggleAllOneTimeRuns} />
          <span className="select-none">{t('button.setAllOneTime')}</span>
        </label>
      </div>

      <div className="divide-y dark:divide-neutral-600">
        {oneTimeStages.map((s) => {
          const associatedMissions = missionsByStageId.get(s.Id);
          return (
            <div key={s.Id} className="p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex flex-row justify-between items-center sm:contents sm:flex-1">
                  <div className="grow sm:shrink-0 min-w-0">
                    <h4 className="font-bold text-base text-indigo-600 dark:text-indigo-400 truncate">
                      {(s.type === 'story' ? t('common.story') + ' ' : t('common.challenge') + ' ') + s.Name.split('_').pop()?.replace('Stage', ' ')}
                    </h4>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span>{s.StageEnterCostAmount}AP</span>
                      <span>Lv.{s.RecommandLevel}</span>
                      <span>
                        {s.BattleDuration / 1000}
                        {t('common.seconds')}
                      </span>
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
                    </div>
                  </div>
                  <div className="sm:hidden flex items-center gap-2 shrink-0 justify-end">
                    <CustomNumberInput
                      min={0}
                      max={1}
                      value={runCounts[s.Id] || 0}
                      onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                      className="w-12 px-0 text-base scale-[0.75] p-1 text-center rounded bg-gray-100 dark:bg-neutral-700 border dark:border-neutral-600 dark:text-gray-200"
                    />
                  </div>
                </div>

                {/* Rewards */}
                <div className="w-full sm:flex sm:justify-end min-w-0">
                  {s.EventContentStageReward.length > 0 && (
                    <div className="flex overflow-x-auto gap-1.5 pb-2">
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.EventContentStageReward.map((r, i) => {
                          const amount = (r.RewardAmount * r.RewardProb) / 10000;
                          let label: string | null = null;
                          let labelColor = 'bg-gray-700';
                          switch (r.RewardTagStr) {
                            case 'Rare':
                              label = 'Rare';
                              labelColor = 'bg-[#2f4e73]';
                              break;
                            case 'FirstClear':
                              label = 'First';
                              labelColor = 'bg-yellow-500';
                              break;
                            case 'ThreeStar':
                              label = '３★';
                              labelColor = 'bg-amber-400';
                              break;
                          }
                          return (
                            <ItemIcon
                              key={`1t-${i}-${r.RewardId}`}
                              type={r.RewardParcelTypeStr}
                              itemId={r.RewardId.toString()}
                              amount={amount}
                              size={10}
                              eventData={eventData}
                              iconData={iconData}
                              label={label}
                              labelColor={labelColor}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="hidden sm:flex items-center gap-2 shrink-0 w-full sm:w-24 justify-end">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('common.count')}</label>
                  <CustomNumberInput
                    min={0}
                    max={1}
                    value={runCounts[s.Id] || 0}
                    onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                    className="w-12 px-0 text-base scale-[0.75] p-1 text-center rounded bg-gray-100 dark:bg-neutral-700 border dark:border-neutral-600 dark:text-gray-200"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
