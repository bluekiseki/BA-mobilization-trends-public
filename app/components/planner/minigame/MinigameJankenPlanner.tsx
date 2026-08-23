// app/components/planner/minigame/MinigameJankenPlanner.tsx
import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FaRedoAlt, FaRegStar, FaTrophy, FaTasks, FaCheckDouble, FaEye, FaEyeSlash } from 'react-icons/fa';
import { ItemIcon } from '../common/Icon';
import { CustomNumberInput } from '~/components/CustomInput';
import type { EventData, IconData, MinigameJankenStage, StageReward } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { defaultJankenConfig } from '~/types/minigame/janken';
import { getItemSortPriority } from '~/utils/itemSort';

export type MinigameJankenResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

interface MinigameJankenPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  remainingCurrency: Record<number, number>;
  onCalculate?: (result: MinigameJankenResult) => void;
}

export const MinigameJankenPlanner: React.FC<MinigameJankenPlannerProps> = ({ eventId, eventData, iconData, remainingCurrency, onCalculate }) => {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'minigame_janken' });
  const locale = i18n.language as Locale;

  const [activeTab, setActiveTab] = useState<'overview' | 'story' | 'normal' | 'challenge' | 'mission'>('overview');
  const [hideOneTimeRewards, setHideOneTimeRewards] = useState(false);

  // --- Data Extraction ---
  const jankenData = eventData.minigame_janken;
  const missions = eventData.minigame_mission || [];
  const gameInfo = jankenData?.info?.[0];

  const entryItemId = gameInfo?.CostParcelId || 0;
  const entryItemTypeStr = gameInfo?.CostParcelTypeStr || 'Item';
  const currentCurrencyAmount = remainingCurrency[entryItemId] || 0;

  const equipItemId = gameInfo?.CostParcelEquipUpgradeId || 0;
  const equipItemTypeStr = gameInfo?.CostParcelEquipUpgradeTypeStr || entryItemTypeStr;

  const { storyStages, normalStages, challengeStage, allStagesMap } = useMemo(() => {
    const stages = jankenData?.stage || [];
    const story: MinigameJankenStage[] = [];
    const normal: MinigameJankenStage[] = [];
    let challenge: MinigameJankenStage | undefined;
    const stageMap = new Map<number, MinigameJankenStage>();

    stages.forEach((s) => {
      stageMap.set(s.Id, s);
      if (s.JankenStageType === 1) story.push(s);
      else if (s.JankenStageType === 2) normal.push(s);
      else if (s.JankenStageType === 3) challenge = s;
    });

    return {
      storyStages: story.sort((a, b) => a.StageNumber - b.StageNumber),
      normalStages: normal.sort((a, b) => a.StageNumber - b.StageNumber),
      challengeStage: challenge,
      allStagesMap: stageMap,
    };
  }, [jankenData]);

  const rewardScore = jankenData?.reward_score?.[0];
  const rewardScoreItems = jankenData?.reward_score_item || [];

  const challengeLadder = useMemo(() => {
    if (!rewardScore) return [];
    return rewardScore.ScoreRewardId.map((id, idx) => ({
      id,
      requiredScore: rewardScore.StackedScore[idx],
      item: rewardScoreItems.find((r) => r.Id === id),
    })).sort((a, b) => a.requiredScore - b.requiredScore);
  }, [rewardScore, rewardScoreItems]);

  const tierCosts = [gameInfo?.NeedItemAmountT2 ?? 0, gameInfo?.NeedItemAmountT3 ?? 0, gameInfo?.NeedItemAmountT4 ?? 0, gameInfo?.NeedItemAmountT5 ?? 0];
  const equipmentMaxTier = gameInfo?.EquipmentMaxTier ?? 5;

  // --- Store State ---
  const { plan, minigameJankenConfig: rawConfig, setMinigameMissionStatus, setMinigameJankenConfig } = usePlanForEvent(eventId);
  const { minigameMissionStatus } = plan;
  const config = { ...defaultJankenConfig, ...rawConfig };

  useEffect(() => {
    if (plan.minigameMissionStatus === undefined) {
      setMinigameMissionStatus({});
    }
  }, [plan.minigameMissionStatus]);

  const missionStatusSafe = minigameMissionStatus ?? {};

  const prevResultRef = useRef<string>('');

  // --- Handlers ---
  const updateNormalRunCount = (stageId: number, value: number) => {
    setMinigameJankenConfig({ ...config, normalRunCounts: { ...config.normalRunCounts, [stageId]: Math.max(0, value) } });
  };

  const setMaxNormalRuns = (stage: MinigameJankenStage) => {
    if (stage.StageEnterCostAmount <= 0) return;
    const maxRuns = Math.floor(currentCurrencyAmount / stage.StageEnterCostAmount);
    updateNormalRunCount(stage.Id, maxRuns);
  };

  const toggleClear = (stageId: number) => {
    setMinigameJankenConfig({ ...config, clearStatus: { ...config.clearStatus, [stageId]: !config.clearStatus[stageId] } });
  };

  const toggleAllStoryClear = () => {
    const allChecked = storyStages.every((s) => config.clearStatus[s.Id]);
    const updated = { ...config.clearStatus };
    storyStages.forEach((s) => {
      updated[s.Id] = !allChecked;
    });
    setMinigameJankenConfig({ ...config, clearStatus: updated });
  };

  const toggleAllNormalOneTime = () => {
    const allChecked = normalStages.every((s) => config.clearStatus[s.Id]);
    const updated = { ...config.clearStatus };
    normalStages.forEach((s) => {
      updated[s.Id] = !allChecked;
    });
    setMinigameJankenConfig({ ...config, clearStatus: updated });
  };

  const toggleMission = (missionId: number) => {
    setMinigameMissionStatus({ ...missionStatusSafe, [missionId]: !missionStatusSafe[missionId] });
  };

  const toggleAllMissions = (checked: boolean) => {
    const updated: Record<number, boolean> = {};
    missions.forEach((m) => {
      updated[m.Id] = checked;
    });
    setMinigameMissionStatus(updated);
  };

  const getMissionDesc = (mission: (typeof missions)[number]) => {
    let desc: string;
    if (locale === 'ko') desc = mission.DescriptionStr.Kr || mission.DescriptionStr.Jp || mission.DescriptionStr.En || '';
    else if (locale === 'ja') desc = mission.DescriptionStr.Jp || mission.DescriptionStr.Kr || mission.DescriptionStr.En || '';
    else if (locale === 'zh-Hant') desc = mission.DescriptionStr.Tw || mission.DescriptionStr.En || '';
    else desc = mission.DescriptionStr.En || mission.DescriptionStr.Jp || mission.DescriptionStr.Kr || '';

    if (desc.includes('{1}')) {
      // Score-threshold mission: {0} = stage reference, {1} = required score
      const stageId = mission.CompleteConditionParameter?.[1];
      const stage = allStagesMap.get(stageId);
      const stageLabel = stage ? (stage.JankenStageType === 3 ? t('section_challenge', 'Challenge') : `${t('normal', 'Normal')} ${stage.StageNumber}`) : '';
      desc = desc.replace('{0}', stageLabel).replace('{1}', mission.CompleteConditionCount.toLocaleString());
    } else if (mission.CompleteConditionParameter && mission.CompleteConditionParameter.length > 1) {
      // Equipment tier mission: {0} = target tier
      desc = desc.replace('{0}', String(mission.CompleteConditionParameter[1]));
    } else {
      // Clear-count mission: {0} = required count
      desc = desc.replace('{0}', String(mission.CompleteConditionCount));
    }
    return desc;
  };

  // --- Calculation ---
  const calcResult = useMemo(() => {
    const cost: Record<string, number> = {};
    const rewards: Record<string, number> = {};
    let totalCost = 0;

    // 1. Normal (farming) + Challenge repeatable runs
    [...normalStages, ...(challengeStage ? [challengeStage] : [])].forEach((stage) => {
      const runs = config.normalRunCounts[stage.Id] || 0;
      if (runs <= 0) return;
      totalCost += stage.StageEnterCostAmount * runs;
      (stage.EventContentStageReward || []).forEach((r) => {
        if (['Default', 'Rare'].includes(r.RewardTagStr)) {
          const key = `${r.RewardParcelTypeStr}_${r.RewardId}`;
          rewards[key] = (rewards[key] || 0) + r.RewardAmount * (r.RewardProb / 10000) * runs;
        }
      });
    });

    // 2. One-time clear (Story, Normal, and Challenge FirstClear/ThreeStar bonuses)
    [...storyStages, ...normalStages, ...(challengeStage ? [challengeStage] : [])].forEach((stage) => {
      if (!config.clearStatus[stage.Id]) return;
      totalCost += stage.StageEnterCostAmount;
      (stage.EventContentStageReward || []).forEach((r) => {
        const key = `${r.RewardParcelTypeStr}_${r.RewardId}`;
        if (['FirstClear', 'ThreeStar'].includes(r.RewardTagStr)) {
          rewards[key] = (rewards[key] || 0) + r.RewardAmount;
        } else if (['Default', 'Rare'].includes(r.RewardTagStr)) {
          rewards[key] = (rewards[key] || 0) + r.RewardAmount * (r.RewardProb / 10000);
        }
      });
    });

    // 3. Equipment tier upgrade
    const tierUpCost = tierCosts.slice(0, Math.max(0, config.equipmentTargetTier - 1)).reduce((sum, v) => sum + v, 0);
    if (tierUpCost > 0 && equipItemId) {
      const key = `${equipItemTypeStr}_${equipItemId}`;
      cost[key] = (cost[key] || 0) + tierUpCost;
    }

    // 4. Challenge score ladder (current -> target)
    challengeLadder.forEach((tier) => {
      const item = tier.item;
      if (!item) return;
      if (tier.requiredScore > config.challengeCurrentScore && tier.requiredScore <= config.challengeTargetScore) {
        item.ParcelUniqueId.forEach((id, idx) => {
          const key = `${item.ParcelTypeStr[idx]}_${id}`;
          rewards[key] = (rewards[key] || 0) + item.Amount[idx];
        });
      }
    });

    // 5. Missions
    missions.forEach((mission) => {
      if (!missionStatusSafe[mission.Id]) return;
      mission.MissionRewardParcelId.forEach((rid, idx) => {
        const key = `${mission.MissionRewardParcelTypeStr[idx]}_${rid}`;
        rewards[key] = (rewards[key] || 0) + mission.MissionRewardAmount[idx];
      });
    });

    if (totalCost > 0 && entryItemId) {
      const key = `${entryItemTypeStr}_${entryItemId}`;
      cost[key] = (cost[key] || 0) + totalCost;
    }

    return { cost, rewards, totalCost };
  }, [normalStages, storyStages, challengeStage, challengeLadder, missions, missionStatusSafe, config, tierCosts, entryItemId, entryItemTypeStr, equipItemId, equipItemTypeStr]);

  useEffect(() => {
    if (!onCalculate) return;
    const result: MinigameJankenResult = { cost: calcResult.cost, rewards: calcResult.rewards };
    const resultStr = JSON.stringify(result);
    if (resultStr === prevResultRef.current) return;
    prevResultRef.current = resultStr;
    onCalculate(result);
  }, [calcResult, onCalculate]);

  if (!jankenData) return null;

  const tabs = [
    { id: 'overview' as const, name: t('overview', 'Overview'), icon: null },
    { id: 'story' as const, name: t('story', 'Story'), icon: FaRegStar },
    { id: 'normal' as const, name: t('normal', 'Normal'), icon: FaRedoAlt },
    { id: 'challenge' as const, name: t('section_challenge', 'Challenge'), icon: FaTrophy },
    { id: 'mission' as const, name: t('missions', 'Missions'), icon: FaTasks },
  ] as const;

  const renderRewardIcons = (rewards: StageReward[] | undefined, size = 9) => {
    const grouped = new Map<string, { type: string; id: number; amount: number; label?: string; labelColor?: string }>();
    (rewards || []).forEach((r) => {
      const isOneTimeTag = ['FirstClear', 'ThreeStar'].includes(r.RewardTagStr);
      if (hideOneTimeRewards && isOneTimeTag) return;
      const amount = isOneTimeTag ? r.RewardAmount : r.RewardAmount * (r.RewardProb / 10000);
      if (amount <= 0) return;
      const label = r.RewardTagStr === 'FirstClear' ? t('label_first', 'First') : r.RewardTagStr === 'ThreeStar' ? t('label_three_star', '3★') : undefined;
      const labelColor = r.RewardTagStr === 'FirstClear' ? 'bg-blue-600' : r.RewardTagStr === 'ThreeStar' ? 'bg-amber-500' : undefined;
      // Keep one-time (FirstClear/ThreeStar) rewards separate from repeatable (Default/Rare) rewards
      // for the same item, so a first-clear bonus doesn't get merged into the per-run drop icon.
      const key = `${r.RewardParcelTypeStr}_${r.RewardId}_${isOneTimeTag ? r.RewardTagStr : 'repeatable'}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        grouped.set(key, { type: r.RewardParcelTypeStr, id: r.RewardId, amount, label, labelColor });
      }
    });
    return Array.from(grouped.entries()).map(([key, g]) => (
      <div key={key} className="shrink-0">
        <ItemIcon type={g.type} itemId={String(g.id)} amount={g.amount} size={size} eventData={eventData} iconData={iconData} label={g.label} labelColor={g.labelColor} />
      </div>
    ));
  };

  // Consumed currency is shown as icon + separate "x N" text, not badged onto the icon (matches MinigameDefensePlanner).
  const renderCost = (amount: number, itemId: number = entryItemId, itemTypeStr: string = entryItemTypeStr, size = 6) => (
    <span className="inline-flex items-center gap-1">
      <ItemIcon type={itemTypeStr} itemId={String(itemId)} amount="" size={size} eventData={eventData} iconData={iconData} />
      <span>x {amount.toLocaleString()}</span>
    </span>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title', 'Hermit Crab Janken Tournament')} (Beta)</h2>
        <button
          onClick={() => setHideOneTimeRewards(!hideOneTimeRewards)}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            hideOneTimeRewards
              ? 'bg-neutral-800 text-white dark:bg-white dark:text-neutral-900'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600'
          }`}
        >
          {hideOneTimeRewards ? <FaEyeSlash /> : <FaEye />}
          {hideOneTimeRewards ? t('show_onetime_rewards', 'Show One-Time Rewards') : t('hide_onetime_rewards', 'Hide One-Time Rewards')}
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 flex items-center whitespace-nowrap ${activeTab === tab.id ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-neutral-500 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200'}`}
            >
              {tab.icon && <tab.icon className="mr-2" />}
              {tab.name}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-4 text-sm dark:text-neutral-300">
            <div className="bg-neutral-50 dark:bg-neutral-700/50 p-4 rounded-lg">
              <h3 className="font-bold mb-2 text-base dark:text-neutral-100">{t('game_rules', 'Game Rules')}</h3>
              <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-300">
                <li>{t('desc_1', 'A rock-paper-scissors battle: winning deals heavy damage, a tie damages both sides, and losing damages only you.')}</li>
                <li>{t('desc_2', 'Hands with a lower win rate deal more damage when they win.')}</li>
                <li>{t('desc_3', 'Losing or giving up fully refunds the entry cost, so there is no risk in retrying.')}</li>
                <li>{t('desc_4', 'No daily play limit, so there is no need to rush.')}</li>
              </ul>
            </div>

            <div className="flex items-center gap-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
              <span className="font-semibold text-sm text-blue-900 dark:text-blue-100">{t('entry_cost', 'Entry Cost')}:</span>
              {renderCost(storyStages[0]?.StageEnterCostAmount ?? normalStages[0]?.StageEnterCostAmount ?? 0, entryItemId, entryItemTypeStr, 12)}
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <h3 className="font-bold p-3 bg-neutral-100 dark:bg-neutral-700 border-b border-neutral-200 dark:border-neutral-600 text-neutral-800 dark:text-neutral-100">
                {t('equipment_tier_table', 'Equipment Tier Upgrade Cost')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-700/50 text-neutral-700 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-2 border-b dark:border-neutral-600 w-[20%] whitespace-nowrap">{t('tier', 'Tier')}</th>
                      <th className="px-4 py-2 border-b dark:border-neutral-600">{t('cost', 'Cost')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {tierCosts.slice(0, Math.max(0, equipmentMaxTier - 1)).map((cost, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30">
                        <td className="px-4 py-2 font-medium text-neutral-900 dark:text-neutral-200 border-r dark:border-neutral-700">
                          {idx + 1} → {idx + 2}
                        </td>
                        <td className="px-4 py-2">{renderCost(cost, equipItemId, equipItemTypeStr, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-center gap-3">
                <label className="text-sm text-neutral-700 dark:text-neutral-300 font-medium">{t('equipment_target_tier', 'Target Tier')}</label>
                <select
                  value={config.equipmentTargetTier}
                  onChange={(e) => setMinigameJankenConfig({ ...config, equipmentTargetTier: Number(e.target.value) })}
                  className="p-1.5 rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-sm ios-compact-14"
                >
                  {Array.from({ length: equipmentMaxTier }, (_, i) => i + 1).map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">{t('cost', 'Cost')}:</span>
                {renderCost(
                  tierCosts.slice(0, Math.max(0, config.equipmentTargetTier - 1)).reduce((sum, v) => sum + v, 0),
                  equipItemId,
                  equipItemTypeStr,
                  9,
                )}
              </div>
            </div>
          </div>
        )}

        {/* STORY */}
        {activeTab === 'story' && (
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-2 flex justify-end border-b border-neutral-200 dark:border-neutral-700">
              <button
                onClick={toggleAllStoryClear}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                <FaCheckDouble />
                {t('clear_all', 'Clear All')}
              </button>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {storyStages.map((stage) => {
                const isCleared = config.clearStatus[stage.Id] ?? false;
                return (
                  <div key={stage.Id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                    <div className="w-full sm:w-40 sm:shrink-0">
                      <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                        {t('story', 'Story')} {stage.StageNumber}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex items-center gap-1">{renderCost(stage.StageEnterCostAmount)}</div>
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex overflow-x-auto gap-1.5 pb-1">{renderRewardIcons(stage.EventContentStageReward)}</div>
                    </div>
                    <div className="shrink-0 flex justify-end">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isCleared}
                          onChange={() => toggleClear(stage.Id)}
                          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-neutral-600 dark:text-neutral-300">{t('mark_cleared', 'Cleared')}</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* NORMAL (FARMING) */}
        {activeTab === 'normal' && (
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-2 flex justify-end border-b border-neutral-200 dark:border-neutral-700">
              <button
                onClick={toggleAllNormalOneTime}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                <FaCheckDouble />
                {t('include_onetime_all', 'Include One-Time (All)')}
              </button>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {normalStages.map((stage) => {
                const runs = config.normalRunCounts[stage.Id] || 0;
                const isCleared = config.clearStatus[stage.Id] ?? false;
                return (
                  <div key={stage.Id} className="p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="w-full sm:w-48 sm:shrink-0">
                        <h4 className="font-bold text-sm text-blue-600 dark:text-blue-400 truncate">
                          {t('normal', 'Normal')} {stage.StageNumber}
                        </h4>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex items-center gap-1">{renderCost(stage.StageEnterCostAmount)}</div>
                        <label className="flex items-center space-x-2 mt-2 cursor-pointer select-none group">
                          <input
                            type="checkbox"
                            checked={isCleared}
                            onChange={() => toggleClear(stage.Id)}
                            className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-neutral-600 dark:text-neutral-300 group-hover:text-neutral-800 dark:group-hover:text-neutral-200 transition-colors">
                            {t('include_onetime', 'Include One-Time')}
                          </span>
                        </label>
                      </div>

                      <div className="w-full sm:flex-1 min-w-0 overflow-hidden">
                        <div className="flex overflow-x-auto gap-1.5 pb-1">{renderRewardIcons(stage.EventContentStageReward)}</div>
                      </div>

                      <div className="flex flex-col sm:items-end justify-center shrink-0 w-full sm:w-auto gap-1">
                        <div className="flex rounded-md h-8">
                          <CustomNumberInput
                            min={0}
                            max={9999}
                            value={runs}
                            onChange={(val) => updateNormalRunCount(stage.Id, val || 0)}
                            className="w-16 min-w-0 flex-1 rounded-l-md border border-r-0 border-neutral-300 bg-white px-2 text-center text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                          />
                          <button
                            onClick={() => setMaxNormalRuns(stage)}
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
          </div>
        )}

        {/* CHALLENGE */}
        {activeTab === 'challenge' && challengeStage && (
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-700">
            <div className="p-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-full sm:w-48 sm:shrink-0">
                  <h4 className="font-bold text-sm text-blue-600 dark:text-blue-400">{t('section_challenge', 'Challenge')}</h4>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex items-center gap-1">{renderCost(challengeStage.StageEnterCostAmount)}</div>
                  <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.clearStatus[challengeStage.Id] ?? false}
                      onChange={() => toggleClear(challengeStage.Id)}
                      className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-neutral-600 dark:text-neutral-300">{t('mark_cleared', 'Cleared')}</span>
                  </label>
                </div>
                <div className="w-full sm:flex-1 min-w-0 overflow-hidden">
                  <div className="flex overflow-x-auto gap-1.5 pb-1">{renderRewardIcons(challengeStage.EventContentStageReward)}</div>
                </div>
                <div className="flex flex-col sm:items-end justify-center shrink-0 w-full sm:w-auto gap-1">
                  <div className="flex rounded-md h-8">
                    <CustomNumberInput
                      min={0}
                      max={9999}
                      value={config.normalRunCounts[challengeStage.Id] || 0}
                      onChange={(val) => updateNormalRunCount(challengeStage.Id, val || 0)}
                      className="w-16 min-w-0 flex-1 rounded-l-md border border-r-0 border-neutral-300 bg-white px-2 text-center text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                    />
                    <button
                      onClick={() => setMaxNormalRuns(challengeStage)}
                      className="inline-flex items-center rounded-r-md border border-l-0 border-neutral-300 bg-neutral-50 px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-500"
                    >
                      MAX
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 shrink-0">{t('challenge_current_score', 'Current Score')}</label>
                <input
                  type="number"
                  value={config.challengeCurrentScore || ''}
                  onChange={(e) => setMinigameJankenConfig({ ...config, challengeCurrentScore: parseInt(e.target.value) || 0 })}
                  className="w-full p-1 border rounded-md text-sm bg-transparent border-neutral-300 dark:border-neutral-600 dark:text-neutral-200"
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 shrink-0">{t('challenge_target_score', 'Target Score')}</label>
                <input
                  type="number"
                  value={config.challengeTargetScore || ''}
                  onChange={(e) => setMinigameJankenConfig({ ...config, challengeTargetScore: parseInt(e.target.value) || 0 })}
                  className="w-full p-1 border rounded-md text-sm bg-transparent border-neutral-300 dark:border-neutral-600 dark:text-neutral-200"
                  placeholder="0"
                />
                <button
                  onClick={() => {
                    if (challengeLadder.length === 0) return;
                    const maxScore = Math.max(...challengeLadder.map((tier) => tier.requiredScore));
                    setMinigameJankenConfig({ ...config, challengeTargetScore: maxScore });
                  }}
                  className="shrink-0 h-7.5 px-2 text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded dark:bg-blue-900 dark:text-blue-300 transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="divide-y divide-neutral-100 dark:divide-neutral-700 max-h-80 overflow-y-auto">
              {challengeLadder.map((tier) => {
                const isClaimed = tier.requiredScore > config.challengeCurrentScore && tier.requiredScore <= config.challengeTargetScore;
                const item = tier.item;
                return (
                  <div key={tier.id} className={`p-2 flex items-center gap-3 ${isClaimed ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                    <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap w-24 shrink-0">{tier.requiredScore.toLocaleString()}</span>
                    <div className="flex flex-wrap gap-1 justify-end ml-auto">
                      {item?.ParcelUniqueId.map((id, idx) => (
                        <div key={idx} className="shrink-0">
                          <ItemIcon type={item.ParcelTypeStr[idx]} itemId={String(id)} amount={item.Amount[idx]} size={9} eventData={eventData} iconData={iconData} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary + Rewards (shown alongside Story/Normal/Challenge) */}
        {(activeTab === 'story' || activeTab === 'normal' || activeTab === 'challenge') && (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm font-medium pt-2 border-t border-neutral-200 dark:border-neutral-700">
              <span className="dark:text-neutral-200">{t('cost', 'Cost')}:</span>
              <span className={`flex items-center gap-1 ${currentCurrencyAmount < calcResult.totalCost ? 'text-red-500' : 'text-neutral-700 dark:text-neutral-300'}`}>
                <ItemIcon type={entryItemTypeStr} itemId={String(entryItemId)} amount="" size={9} eventData={eventData} iconData={iconData} />
                {calcResult.totalCost.toLocaleString()}
                <span className="text-neutral-400 text-xs"> / {currentCurrencyAmount.toLocaleString()}</span>
              </span>
            </div>

            <div>
              <h4 className="text-sm font-bold mb-3 text-neutral-800 dark:text-neutral-100">{t('total_rewards', 'Total Estimated Rewards')}</h4>
              {Object.keys(calcResult.rewards).length === 0 ? (
                <p className="text-sm text-neutral-400 italic text-center py-4 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg">{t('no_rewards', 'No rewards simulated')}</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {Object.entries(calcResult.rewards)
                    .sort(([key_a], [key_b]) => getItemSortPriority(key_a, eventData) - getItemSortPriority(key_b, eventData))
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
        )}

        {/* MISSION */}
        {activeTab === 'mission' && (
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-2 flex justify-between items-center border-b border-neutral-200 dark:border-neutral-700">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                {Object.keys(missionStatusSafe).length} / {missions.length}
              </span>
              <div className="space-x-2">
                <button onClick={() => toggleAllMissions(true)} className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">
                  {t('select_all', 'Select All')}
                </button>
                <button onClick={() => toggleAllMissions(false)} className="text-xs bg-neutral-400 text-white px-2 py-1 rounded hover:bg-neutral-500">
                  {t('deselect_all', 'Deselect All')}
                </button>
              </div>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-700 max-h-125 overflow-y-auto">
              {missions.map((mission) => {
                const isChecked = missionStatusSafe[mission.Id] ?? false;
                return (
                  <div
                    key={mission.Id}
                    onClick={() => toggleMission(mission.Id)}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors"
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input type="checkbox" checked={isChecked} readOnly className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500" />
                      <span className="font-medium text-sm text-neutral-700 dark:text-neutral-200 leading-snug">{getMissionDesc(mission)}</span>
                    </label>
                    <div className="flex flex-wrap gap-1 ml-4 justify-end">
                      {mission.MissionRewardParcelId.map((rid, idx) => (
                        <div key={idx} className="shrink-0">
                          <ItemIcon type={mission.MissionRewardParcelTypeStr[idx]} itemId={String(rid)} amount={mission.MissionRewardAmount[idx]} size={12} eventData={eventData} iconData={iconData} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
