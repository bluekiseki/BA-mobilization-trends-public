import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemIcon } from '../../../components/item/Icon';
import { CustomNumberInput } from '~/components/common/CustomInput';
import type { EventData, IconData, MinigameMission, MinigameTankCharacter, MinigameTankStage } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { getItemSortPriority } from '../logic/itemSort';
import { getRewardBadge } from '../logic/rewardBadge';
import { defaultTankConfig, type MinigameTankResult } from '~/types/minigame/tank';

interface MinigameTankPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  remainingCurrency: Record<number, number>;
  onCalculate?: (result: MinigameTankResult) => void;
}

type TankTab = 'farming' | 'upgrade' | 'mission';
type LocalizedText = { Kr?: string; Jp?: string; En?: string; Tw?: string } | undefined;

const BOSS_STAGE_TYPE = 2;
const REPEATABLE_TAGS = ['Default', 'Rare'];
const ONE_TIME_TAGS = ['FirstClear', 'ThreeStar'];

// Mission condition types of the tank minigame: 197 = tank upgrade grade, 198 = clear a specific stage.
const MISSION_TANK_UPGRADE = 197;
const MISSION_STAGE_CLEAR = 198;

const pickText = (text: LocalizedText, locale: Locale): string => {
  if (!text) return '';
  if (locale === 'ko') return text.Kr || text.Jp || text.En || '';
  if (locale === 'ja') return text.Jp || text.Kr || text.En || '';
  if (locale === 'zh-Hant') return text.Tw || text.En || text.Jp || '';
  return text.En || text.Jp || text.Kr || '';
};

// Clamp the owned/goal grades of one tank group to its grade range (goal never below owned).
const resolveGrades = (grades: MinigameTankCharacter[], ownedGrade: number | undefined, goalGrade: number | undefined) => {
  const maxGrade = grades.at(-1)?.Grade ?? 1;
  const current = Math.min(ownedGrade ?? 1, maxGrade);
  const target = Math.max(current, Math.min(goalGrade ?? current, maxGrade));
  return { current, target };
};

const addTo = (target: Record<string, number>, key: string, amount: number) => {
  target[key] = (target[key] || 0) + amount;
};

export const MinigameTankPlanner: React.FC<MinigameTankPlannerProps> = ({ eventId, eventData, iconData, remainingCurrency, onCalculate }) => {
  const { i18n, t } = useTranslation('planner', { keyPrefix: 'minigame_tank' });
  const { t: t_planner } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;

  const [activeTab, setActiveTab] = useState<TankTab>('farming');
  const [hideOneTimeRewards, setHideOneTimeRewards] = useState(false);

  const tankData = eventData.minigame_tank;
  const missions = useMemo(() => eventData.minigame_mission || [], [eventData]);

  // The time-attack stage has no cost and no rewards, so it is left out of every list.
  const stages = useMemo(() => (tankData?.stage || []).filter((s) => (s.EventContentStageReward?.length ?? 0) > 0).sort((a, b) => a.StageNumber - b.StageNumber), [tankData]);
  const hasTimeAttack = (tankData?.stage.length ?? 0) > stages.length;

  const tankGroups = useMemo(() => {
    const groups = new Map<number, MinigameTankCharacter[]>();
    (tankData?.character || []).forEach((c) => groups.set(c.TankGroupId, [...(groups.get(c.TankGroupId) || []), c]));
    return [...groups.entries()].map(([groupId, grades]) => ({ groupId, grades: grades.sort((a, b) => a.Grade - b.Grade) }));
  }, [tankData]);

  const stageByNumber = useMemo(() => new Map(stages.map((s) => [s.StageNumber, s])), [stages]);
  const tankNameOf = (groupId: number) => pickText(tankGroups.find((g) => g.groupId === groupId)?.grades[0]?.TankNameStr, locale);

  const entryItemId = stages[0]?.CostParcelId ?? 0;

  // --- Store State ---
  const { plan, minigameTankConfig: rawConfig, setMinigameMissionStatus, setMinigameTankConfig } = usePlanForEvent(eventId);
  const config = { ...defaultTankConfig, ...rawConfig };
  const missionStatus = useMemo(() => plan.minigameMissionStatus ?? {}, [plan.minigameMissionStatus]);
  const prevResultRef = useRef('');

  // --- Handlers ---
  const handleRunCountChange = (stageId: number, value: number) => setMinigameTankConfig({ ...config, runCounts: { ...config.runCounts, [stageId]: Math.max(0, value) } });

  // Claiming one-time rewards needs at least one run, so enabling it raises an empty run count to 1.
  const withMinRun = (runCounts: Record<string, number>, stageId: number) => ({ ...runCounts, [stageId]: Math.max(1, runCounts[stageId] || 0) });

  const handleClearToggle = (stageId: number) => {
    const enabled = !config.clearStatus[stageId];
    setMinigameTankConfig({
      ...config,
      clearStatus: { ...config.clearStatus, [stageId]: enabled },
      runCounts: enabled ? withMinRun(config.runCounts, stageId) : config.runCounts,
    });
  };

  const toggleAllOneTime = () => {
    const enable = !stages.every((s) => config.clearStatus[s.UniqueId]);
    setMinigameTankConfig({
      ...config,
      clearStatus: Object.fromEntries(stages.map((s) => [s.UniqueId, enable])),
      runCounts: enable ? stages.reduce((counts, s) => withMinRun(counts, s.UniqueId), config.runCounts) : config.runCounts,
    });
  };

  const resetFarming = () => setMinigameTankConfig({ ...config, runCounts: {}, clearStatus: {} });

  const handleMissionToggle = (missionId: number) => setMinigameMissionStatus({ ...missionStatus, [missionId]: !missionStatus[missionId] });

  const toggleAllMissions = () => {
    const allChecked = missions.every((m) => missionStatus[m.Id]);
    setMinigameMissionStatus(Object.fromEntries(missions.map((m) => [m.Id, !allChecked])));
  };

  // --- Calculation ---
  const calcResult = useMemo(() => {
    const cost: Record<string, number> = {};
    const rewards: Record<string, number> = {};

    stages.forEach((stage) => {
      const totalRuns = config.runCounts[stage.UniqueId] || 0;
      if (totalRuns <= 0) return;
      // One-time rewards come with the first of the runs.
      const cleared = config.clearStatus[stage.UniqueId] ?? false;
      addTo(cost, `${stage.CostParcelTypeStr}_${stage.CostParcelId}`, stage.CostParcelAmount * totalRuns);
      (stage.EventContentStageReward ?? []).forEach((r) => {
        const key = `${r.RewardParcelTypeStr}_${r.RewardId}`;
        if (REPEATABLE_TAGS.includes(r.RewardTagStr)) addTo(rewards, key, r.RewardAmount * (r.RewardProb / 10000) * totalRuns);
        else if (cleared && ONE_TIME_TAGS.includes(r.RewardTagStr)) addTo(rewards, key, r.RewardAmount);
      });
    });

    tankGroups.forEach(({ groupId, grades }) => {
      const { current, target } = resolveGrades(grades, config.currentGrade[groupId], config.targetGrade[groupId]);
      grades.filter((c) => c.Grade > current && c.Grade <= target).forEach((c) => addTo(cost, `${c.UpgradeItemParcelTypeStr ?? 'Item'}_${c.UpgradeItemParcelId}`, c.UpgradeItemAmount));
    });

    missions.forEach((mission) => {
      if (!missionStatus[mission.Id]) return;
      mission.MissionRewardParcelId.forEach((rid, idx) => addTo(rewards, `${mission.MissionRewardParcelTypeStr[idx]}_${rid}`, mission.MissionRewardAmount[idx]));
    });

    return { cost, rewards };
  }, [stages, tankGroups, missions, missionStatus, config.runCounts, config.clearStatus, config.currentGrade, config.targetGrade]);

  // remainingCurrency is already net of this planner's own spending, so add it back to get the owned amount.
  const entryItemTypeStr = stages[0]?.CostParcelTypeStr ?? 'Item';
  const totalEntryCost = calcResult.cost[`${entryItemTypeStr}_${entryItemId}`] || 0;
  const ownedCurrencyAmount = (remainingCurrency[entryItemId] || 0) + totalEntryCost;

  const handleSetMaxRuns = (stage: MinigameTankStage) => {
    // Currency already committed to the other stages' runs is not available here.
    const usedByOthers = stages.reduce((sum, s) => (s.UniqueId === stage.UniqueId ? sum : sum + s.CostParcelAmount * (config.runCounts[s.UniqueId] || 0)), 0);
    handleRunCountChange(stage.UniqueId, Math.floor(Math.max(0, ownedCurrencyAmount - usedByOthers) / stage.CostParcelAmount));
  };

  useEffect(() => {
    if (!onCalculate) return;
    const serialized = JSON.stringify(calcResult);
    if (serialized === prevResultRef.current) return;
    prevResultRef.current = serialized;
    onCalculate(calcResult);
  }, [calcResult, onCalculate]);

  if (!tankData) return null;

  const stageName = (stage: MinigameTankStage) => {
    const name = pickText(stage.NameStr, locale);
    return name ? `${t_planner('common.stage')} ${stage.StageNumber} · ${name}` : `${t_planner('common.stage')} ${stage.StageNumber}`;
  };

  const getMissionDesc = (m: MinigameMission) => {
    const desc = pickText({ Kr: m.DescriptionStr.Kr, Jp: m.DescriptionStr.Jp, En: m.DescriptionStr.En, Tw: m.DescriptionStr.Tw }, locale);
    const [, first, second] = m.CompleteConditionParameter;
    if (m.CompleteConditionType === MISSION_TANK_UPGRADE) return desc.replace('{0}', tankNameOf(first)).replace('{1}', String(second));
    if (m.CompleteConditionType === MISSION_STAGE_CLEAR) {
      const stage = stageByNumber.get(first);
      return desc.replace('{0}', stage ? pickText(stage.NameStr, locale) || String(stage.StageNumber) : String(first));
    }
    return desc.replace('{0}', String(m.CompleteConditionCount));
  };

  const renderCost = (amount: number, itemId: number, itemTypeStr: string, size = 6) => (
    <span className="inline-flex items-center gap-1">
      <ItemIcon type={itemTypeStr} itemId={String(itemId)} amount="" size={size} eventData={eventData} iconData={iconData} />
      <span>x {amount.toLocaleString()}</span>
    </span>
  );

  const renderRewards = (stage: MinigameTankStage) => (
    <div className="flex overflow-x-auto gap-1.5 pb-2 scrollbar-hide">
      {(stage.EventContentStageReward ?? []).map((r, i) => {
        if (hideOneTimeRewards && ONE_TIME_TAGS.includes(r.RewardTagStr)) return null;
        const { label, labelColor } = getRewardBadge(r.RewardTagStr);
        return (
          <div key={`${stage.UniqueId}-${i}`} className="shrink-0">
            <ItemIcon
              type={r.RewardParcelTypeStr}
              itemId={String(r.RewardId)}
              amount={r.RewardAmount * (r.RewardProb / 10000)}
              size={10}
              eventData={eventData}
              iconData={iconData}
              label={label}
              labelColor={labelColor}
            />
          </div>
        );
      })}
    </div>
  );

  const tabs: { id: TankTab; name: string }[] = [
    { id: 'farming', name: t_planner('label.repeatedFarming') },
    { id: 'upgrade', name: t('upgrade') },
    { id: 'mission', name: t_ui('mission') },
  ];

  const bulkButtonClass = 'text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors';
  const selectClass = 'p-1.5 rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-sm ios-compact-14';

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t_planner('minigame.minigame_tank')} (BETA)</h2>
        <button
          onClick={() => setHideOneTimeRewards(!hideOneTimeRewards)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            hideOneTimeRewards
              ? 'bg-neutral-800 text-white dark:bg-white dark:text-neutral-900'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600'
          }`}
        >
          {hideOneTimeRewards ? t_planner('button.hideOneTimeRewards') : t_planner('button.showOneTimeRewards')}
        </button>
      </div>

      <div className="flex border-b border-neutral-200 dark:border-neutral-700 mb-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <div className="divide-y divide-neutral-100 dark:divide-neutral-700 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
        {activeTab === 'farming' && (
          <>
            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-2 flex justify-end gap-4 border-b dark:border-neutral-700">
              <button onClick={toggleAllOneTime} className={bulkButtonClass}>
                {t_planner('button.includeOneTimeRewards')} (All)
              </button>
              <button onClick={resetFarming} className={bulkButtonClass}>
                {t_ui('reset')}
              </button>
            </div>
            <div className="divide-y dark:divide-neutral-700">
              {stages.map((s) => {
                const unlocks = tankGroups.filter((g) => g.grades[0]?.UnlockConditionStageId === s.StageNumber);
                return (
                  <div key={s.UniqueId} className="p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="w-full sm:w-48 sm:shrink-0">
                        <h4 className="font-bold text-sm text-blue-600 dark:text-blue-400 truncate" title={stageName(s)}>
                          {stageName(s)}
                          {s.StageType === BOSS_STAGE_TYPE && <span className="ml-2 text-xs font-medium text-red-600 dark:text-red-400">{t('boss')}</span>}
                        </h4>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{renderCost(s.CostParcelAmount, s.CostParcelId, s.CostParcelTypeStr)}</div>
                        {unlocks.length > 0 && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 truncate" title={unlocks.map((g) => tankNameOf(g.groupId)).join(', ')}>
                            {unlocks.map((g) => tankNameOf(g.groupId)).join(', ')}
                          </div>
                        )}
                        <label className="flex items-center space-x-2 mt-2 cursor-pointer select-none group">
                          <input
                            type="checkbox"
                            checked={config.clearStatus[s.UniqueId] ?? false}
                            onChange={() => handleClearToggle(s.UniqueId)}
                            className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-neutral-600 dark:text-neutral-300 group-hover:text-neutral-800 dark:group-hover:text-neutral-200 transition-colors">
                            {t_planner('button.includeOneTimeRewards')}
                          </span>
                        </label>
                      </div>

                      <div className="w-full sm:flex-1 min-w-0 overflow-hidden">{renderRewards(s)}</div>

                      <div className="flex flex-col sm:items-end justify-center shrink-0 w-full sm:w-auto gap-1">
                        <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase hidden sm:block">{t_ui('count')}</span>
                        <div className="flex rounded-md h-8">
                          <CustomNumberInput
                            min={0}
                            max={9999}
                            value={config.runCounts[s.UniqueId] || 0}
                            onChange={(val) => handleRunCountChange(s.UniqueId, val || 0)}
                            className="w-16 min-w-0 flex-1 rounded-l-md border border-r-0 border-neutral-300 bg-white px-2 text-center text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                          />
                          <button
                            onClick={() => handleSetMaxRuns(s)}
                            className="inline-flex items-center rounded-r-md border border-l-0 border-neutral-300 bg-neutral-50 px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-500"
                          >
                            MAX
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {hasTimeAttack && <p className="p-3 text-xs text-neutral-500 dark:text-neutral-400">{t('time_attack')}</p>}
          </>
        )}

        {activeTab === 'upgrade' &&
          tankGroups.map(({ groupId, grades }) => {
            const { current, target } = resolveGrades(grades, config.currentGrade[groupId], config.targetGrade[groupId]);
            const base = grades[0];
            const unlockStage = base?.UnlockConditionStageId ? stageByNumber.get(base.UnlockConditionStageId) : undefined;
            const upgradeItem = grades.find((c) => c.UpgradeItemParcelId);
            const upgradeCost = grades.filter((c) => c.Grade > current && c.Grade <= target).reduce((sum, c) => sum + c.UpgradeItemAmount, 0);
            return (
              <div key={groupId} className="p-3 space-y-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200 truncate" title={tankNameOf(groupId)}>
                    {tankNameOf(groupId)}
                    <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">{pickText(base?.TeamNameStr, locale)}</span>
                  </div>
                  {unlockStage && <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{t('unlock_by', { n: unlockStage.StageNumber })}</div>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-neutral-500 dark:text-neutral-400">
                      <tr>
                        <th className="py-1 pr-3 font-medium">{t('grade_header')}</th>
                        <th className="py-1 pr-3 font-medium">HP</th>
                        <th className="py-1 pr-3 font-medium">{t('speed_header')}</th>
                        <th className="py-1 pr-3 font-medium">{t('attack_header')}</th>
                        <th className="py-1 font-medium">{t('upgrade_cost')}</th>
                      </tr>
                    </thead>
                    <tbody className="text-neutral-700 dark:text-neutral-300">
                      {grades.map((c) => (
                        <tr key={c.UniqueId} className={c.Grade > current && c.Grade <= target ? 'text-blue-600 dark:text-blue-400' : undefined}>
                          <td className="py-1 pr-3">{t('grade', { n: c.Grade })}</td>
                          <td className="py-1 pr-3">{c.MaxHp.toLocaleString()}</td>
                          <td className="py-1 pr-3">{c.MaxSpeed.toLocaleString()}</td>
                          <td className="py-1 pr-3">{c.AttackPower.toLocaleString()}</td>
                          <td className="py-1">{c.UpgradeItemAmount > 0 ? renderCost(c.UpgradeItemAmount, c.UpgradeItemParcelId, c.UpgradeItemParcelTypeStr ?? 'Item', 5) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
                  <label className="flex items-center gap-2">
                    {t('current_grade')}
                    <select value={current} onChange={(e) => setMinigameTankConfig({ ...config, currentGrade: { ...config.currentGrade, [groupId]: Number(e.target.value) } })} className={selectClass}>
                      {grades.map((c) => (
                        <option key={c.Grade} value={c.Grade}>
                          {c.Grade}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    {t('target_grade')}
                    <select value={target} onChange={(e) => setMinigameTankConfig({ ...config, targetGrade: { ...config.targetGrade, [groupId]: Number(e.target.value) } })} className={selectClass}>
                      {grades
                        .filter((c) => c.Grade >= current)
                        .map((c) => (
                          <option key={c.Grade} value={c.Grade}>
                            {c.Grade}
                          </option>
                        ))}
                    </select>
                  </label>
                  {upgradeItem && upgradeCost > 0 && renderCost(upgradeCost, upgradeItem.UpgradeItemParcelId, upgradeItem.UpgradeItemParcelTypeStr ?? 'Item', 8)}
                </div>
              </div>
            );
          })}

        {activeTab === 'mission' && (
          <>
            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-2 flex justify-end border-b dark:border-neutral-700">
              <button onClick={toggleAllMissions} className={bulkButtonClass}>
                {t_ui('selectAll')}
              </button>
            </div>
            <div className="divide-y dark:divide-neutral-700">
              {missions.map((m) => (
                <label key={m.Id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                  <span className="flex items-center gap-3 sm:flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={missionStatus[m.Id] ?? false}
                      onChange={() => handleMissionToggle(m.Id)}
                      className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-neutral-800 dark:text-neutral-200 font-medium">{getMissionDesc(m)}</span>
                  </span>
                  <span className="shrink-0 flex gap-1">
                    {m.MissionRewardParcelId.map((id, idx) => (
                      <ItemIcon key={idx} type={m.MissionRewardParcelTypeStr[idx]} itemId={String(id)} amount={m.MissionRewardAmount[idx]} size={9} eventData={eventData} iconData={iconData} />
                    ))}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="space-y-4 mt-4 pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <div className="flex justify-between items-center text-sm font-medium">
          <span className="dark:text-neutral-200">{t('cost')}:</span>
          <span className={`flex items-center gap-1 ${ownedCurrencyAmount < totalEntryCost ? 'text-red-500' : 'text-neutral-700 dark:text-neutral-300'}`}>
            <ItemIcon type={entryItemTypeStr} itemId={String(entryItemId)} amount="" size={9} eventData={eventData} iconData={iconData} />
            {totalEntryCost.toLocaleString()}
            <span className="text-neutral-400 text-xs"> / {ownedCurrencyAmount.toLocaleString()}</span>
          </span>
        </div>
        <div>
          <h4 className="text-sm font-bold mb-3 text-neutral-800 dark:text-neutral-100">{t('total_rewards')}</h4>
          {Object.keys(calcResult.rewards).length === 0 ? (
            <p className="text-sm text-neutral-400 italic text-center py-4 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg">{t('no_rewards')}</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Object.entries(calcResult.rewards)
                .sort(([a], [b]) => getItemSortPriority(a, eventData) - getItemSortPriority(b, eventData))
                .map(([key, amount]) => {
                  const [typeStr, idStr] = key.split('_');
                  return (
                    <div key={key} className="shrink-0">
                      <ItemIcon type={typeStr} itemId={idStr} amount={amount} size={12} eventData={eventData} iconData={iconData} />
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
