// src/components/planner/minigame/MinigameDefensePlanner.tsx
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemIcon } from '../common/Icon';
import { CustomNumberInput } from '~/components/CustomInput';
import type { EventData, IconData } from '~/types/plannerData';
import { FaRedoAlt, FaRegStar, FaEyeSlash, FaEye, FaTasks, FaCheckDouble } from 'react-icons/fa';
import type { Locale } from '~/utils/i18n/config';

// --- Type Definitions ---
export type MinigameDefenseResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

interface MinigameMission {
  Id: number;
  DescriptionStr: {
    Kr?: string;
    En?: string;
    Jp?: string;
    Tw?: string;
    [key: string]: string | undefined;
  };
  MissionRewardAmount: number[];
  MissionRewardParcelId: number[];
  MissionRewardParcelTypeStr: string[];
  // Added for formatting logic
  CompleteConditionParameter: number[];
  CompleteConditionCount: number;
}

interface MinigameDefensePlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  remainingCurrency: Record<number, number>;
  onCalculate?: (result: MinigameDefenseResult) => void;
}

export const MinigameDefensePlanner: React.FC<MinigameDefensePlannerProps> = ({ eventId, eventData, iconData, remainingCurrency, onCalculate }) => {
  // const { t, i18n } = useTranslation('planner', { keyPrefix: 'minigame_defense' });
  const { t: t_common, i18n } = useTranslation('planner', { keyPrefix: 'common' });
  const { t: t_c } = useTranslation('common');
  const { t: t_planner } = useTranslation('planner');
  const locale = i18n.language as Locale;

  // --- Local State ---
  const [activeTab, setActiveTab] = useState<'farming' | 'onetime' | 'mission'>('farming');
  const [hideOneTimeRewards, setHideOneTimeRewards] = useState(false);

  const [runConfig, setRunConfig] = useState<Record<number, number>>({});
  const [clearStatus, setClearStatus] = useState<Record<number, boolean>>({});
  const [missionStatus, setMissionStatus] = useState<Record<number, boolean>>({});

  // --- Data Parsing ---
  const defenseData = eventData.minigame_defense;
  const stages = useMemo(() => defenseData?.stage || [], [defenseData]);
  const missions = useMemo(() => (eventData.minigame_mission as MinigameMission[]) || [], [eventData]);
  const gameInfo = defenseData?.info?.[0];

  const entryItemId = gameInfo?.DefenseBattleParcelId || 85330;
  const entryItemTypeStr = gameInfo?.DefenseBattleParcelTypeStr || 'Item';
  const currentCurrencyAmount = remainingCurrency[entryItemId] || 0;

  const { normalStages, oneTimeStages, allStagesMap } = useMemo(() => {
    const sMap = new Map<number, (typeof stages)[0]>();
    const nStages: typeof stages = [];
    const oStages: typeof stages = [];

    stages.forEach((stage) => {
      sMap.set(stage.Id, stage);
      if (stage.StageDifficulty === 2) {
        nStages.push(stage);
      } else {
        oStages.push(stage);
      }
    });

    return {
      allStagesMap: sMap,
      normalStages: nStages.sort((a, b) => a.StageNumber - b.StageNumber),
      oneTimeStages: oStages.sort((a, b) => a.StageDifficulty - b.StageDifficulty || a.StageNumber - b.StageNumber),
    };
  }, [stages]);

  // --- Handlers ---
  const handleRunCountChange = (stageId: number, value: number) => {
    const val = Math.max(0, value);
    setRunConfig((prev) => ({ ...prev, [stageId]: val }));
  };

  const handleClearToggle = (stageId: number) => {
    setClearStatus((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  const handleMissionToggle = (missionId: number) => {
    setMissionStatus((prev) => ({ ...prev, [missionId]: !prev[missionId] }));
  };

  // Bulk Actions
  const toggleAllFarmingOneTime = () => {
    const allChecked = normalStages.every((s) => clearStatus[s.Id]);
    const newStatus = { ...clearStatus };
    normalStages.forEach((s) => {
      newStatus[s.Id] = !allChecked;
    });
    setClearStatus(newStatus);
  };

  const toggleAllOneTimeClears = () => {
    const allChecked = oneTimeStages.every((s) => clearStatus[s.Id]);
    const newStatus = { ...clearStatus };
    oneTimeStages.forEach((s) => {
      newStatus[s.Id] = !allChecked;
    });
    setClearStatus(newStatus);
  };

  const toggleAllMissions = () => {
    const allChecked = missions.every((m) => missionStatus[m.Id]);
    const newStatus = { ...missionStatus };
    missions.forEach((m) => {
      newStatus[m.Id] = !allChecked;
    });
    setMissionStatus(newStatus);
  };

  const handleSetMaxRuns = (stageId: number) => {
    const stage = allStagesMap.get(stageId);
    if (!stage) return;
    const costPerRun = stage.StageEnterCostAmount;
    if (costPerRun <= 0) return;

    let usedByOthers = 0;
    Object.entries(runConfig).forEach(([sIdStr, runs]) => {
      if (Number(sIdStr) === stageId) return;
      const s = allStagesMap.get(Number(sIdStr));
      if (s) usedByOthers += s.StageEnterCostAmount * runs;
    });
    Object.entries(clearStatus).forEach(([sIdStr, isCleared]) => {
      if (!isCleared) return;
      const s = allStagesMap.get(Number(sIdStr));
      if (s) usedByOthers += s.StageEnterCostAmount;
    });

    const remaining = Math.max(0, currentCurrencyAmount - usedByOthers);
    const maxRuns = Math.floor(remaining / costPerRun);
    handleRunCountChange(stageId, maxRuns);
  };

  // --- Calculation Logic ---
  useEffect(() => {
    const cost: Record<string, number> = {};
    const rewards: Record<string, number> = {};
    let totalCostVal = 0;

    // 1. Process Farming Runs
    Object.entries(runConfig).forEach(([stageIdStr, runs]) => {
      const stageId = Number(stageIdStr);
      const stage = allStagesMap.get(stageId);
      if (!stage || runs <= 0) return;

      totalCostVal += stage.StageEnterCostAmount * runs;
      stage.EventContentStageReward.forEach((r) => {
        if (['Default', 'Rare'].includes(r.RewardTagStr)) {
          const key = `${r.RewardParcelTypeStr}_${r.RewardId}`;
          const amount = r.RewardAmount * (r.RewardProb / 10000) * runs;
          rewards[key] = (rewards[key] || 0) + amount;
        }
      });
    });

    // 2. Process First Clears
    Object.entries(clearStatus).forEach(([stageIdStr, isCleared]) => {
      if (!isCleared) return;
      const stageId = Number(stageIdStr);
      const stage = allStagesMap.get(stageId);
      if (!stage) return;

      totalCostVal += stage.StageEnterCostAmount;
      stage.EventContentStageReward.forEach((r) => {
        const key = `${r.RewardParcelTypeStr}_${r.RewardId}`;
        if (['FirstClear', 'ThreeStar'].includes(r.RewardTagStr)) {
          rewards[key] = (rewards[key] || 0) + r.RewardAmount;
        }
        if (['Default', 'Rare'].includes(r.RewardTagStr)) {
          const amount = r.RewardAmount * (r.RewardProb / 10000);
          rewards[key] = (rewards[key] || 0) + amount;
        }
      });
    });

    // 3. Process Missions
    Object.entries(missionStatus).forEach(([missionIdStr, isCompleted]) => {
      if (!isCompleted) return;
      const missionId = Number(missionIdStr);
      const mission = missions.find((m) => m.Id === missionId);
      if (!mission) return;

      mission.MissionRewardParcelId.forEach((itemId, idx) => {
        const type = mission.MissionRewardParcelTypeStr[idx];
        const amount = mission.MissionRewardAmount[idx];
        const key = `${type}_${itemId}`;
        rewards[key] = (rewards[key] || 0) + amount;
      });
    });

    const costKey = `${entryItemTypeStr}_${entryItemId}`;
    cost[costKey] = totalCostVal;

    if (onCalculate) {
      onCalculate({ cost, rewards });
    }
  }, [runConfig, clearStatus, missionStatus, allStagesMap, entryItemId, entryItemTypeStr, missions, onCalculate]);

  // --- Helper Functions ---

  const renderRewards = (stage: (typeof stages)[0]) => {
    return (
      <div className="flex overflow-x-auto gap-1.5 pb-2 scrollbar-hide">
        {stage.EventContentStageReward.map((r, i) => {
          const isOneTimeTag = ['FirstClear', 'ThreeStar'].includes(r.RewardTagStr);
          if (hideOneTimeRewards && isOneTimeTag) return null;

          let label: string | null = null;
          let labelColor = undefined;
          if (r.RewardTagStr === 'FirstClear') {
            label = 'First';
            labelColor = 'bg-yellow-500';
          } else if (r.RewardTagStr === 'ThreeStar') {
            label = '3★';
            labelColor = 'bg-amber-500';
          } else if (r.RewardTagStr === 'Rare') {
            label = 'Rare';
            labelColor = 'bg-[#2f4e73]';
          }
          const prob = r.RewardProb / 10000;
          const displayAmount = r.RewardAmount * prob;

          return (
            <div key={`${stage.Id}-${i}`} className="shrink-0">
              <ItemIcon type={r.RewardParcelTypeStr} itemId={String(r.RewardId)} amount={displayAmount} size={10} eventData={eventData} iconData={iconData} label={label} labelColor={labelColor} />
            </div>
          );
        })}
      </div>
    );
  };

  // --- Mission Description Formatter ---
  const getMissionDesc = (locale: Locale, m: MinigameMission) => {
    const lang = locale;
    let desc = m.DescriptionStr.Kr || m.DescriptionStr.En || '';
    if (lang === 'ko') desc = m.DescriptionStr.Kr || desc;
    else if (lang === 'ja') desc = m.DescriptionStr.Jp || desc;
    else if (lang === 'en') desc = m.DescriptionStr.En || desc;
    else if (lang === 'zh-Hant') desc = m.DescriptionStr.Tw || desc;

    // Check for Scenario A: {0} difficulty, {1} stage number, {2} count
    if (desc.includes('{1}')) {
      const stageId = m.CompleteConditionParameter?.[1]; // 2nd parameter is StageID
      const targetStage = allStagesMap.get(stageId);

      if (targetStage) {
        let difficultyStr = 'Stage';
        switch (targetStage.StageDifficulty) {
          case 1:
            difficultyStr = 'Story';
            break;
          case 2:
            difficultyStr = 'Normal';
            break;
          case 3:
            difficultyStr = 'Challenge';
            break;
          default:
            difficultyStr = 'Stage';
        }

        desc = desc.replace('{0}', difficultyStr);
        desc = desc.replace('{1}', String(targetStage.StageNumber));
        desc = desc.replace('{2}', String(m.CompleteConditionCount));
      }
    } else {
      // Scenario B: Just count (e.g., Clear X times)
      desc = desc.replace('{0}', String(m.CompleteConditionCount));
    }

    return desc;
  };

  if (!defenseData) return null;

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t_planner('minigame.minigame_defense')} (BETA)</h2>

        <button
          onClick={() => setHideOneTimeRewards(!hideOneTimeRewards)}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            hideOneTimeRewards
              ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-600'
          }`}
        >
          {hideOneTimeRewards ? <FaEyeSlash /> : <FaEye />}
          {hideOneTimeRewards ? t_planner('button.hideOneTimeRewards') : t_planner('button.showOneTimeRewards')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-neutral-700 mb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('farming')}
          className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 flex flex-row justify-center items-center whitespace-nowrap ${
            activeTab === 'farming'
              ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-neutral-600'
          }`}
        >
          <FaRedoAlt className="mr-2" /> {t_planner('label.repeatedFarming', 'Repeated Farming')}
        </button>
        <button
          onClick={() => setActiveTab('onetime')}
          className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 flex flex-row justify-center items-center whitespace-nowrap ${
            activeTab === 'onetime'
              ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-neutral-600'
          }`}
        >
          <FaRegStar className="mr-2" /> {t_planner('label.oneTimeClear', 'One-Time Clear')}
        </button>
        <button
          onClick={() => setActiveTab('mission')}
          className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 flex flex-row justify-center items-center whitespace-nowrap ${
            activeTab === 'mission'
              ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-neutral-600'
          }`}
        >
          <FaTasks className="mr-2" /> {t_common('mission')}
        </button>
      </div>

      {/* Content Area */}
      <div className="divide-y divide-gray-100 dark:divide-neutral-700 bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-700">
        {/* --- FARMING TAB --- */}
        {activeTab === 'farming' && (
          <>
            <div className="bg-gray-50 dark:bg-neutral-900/50 p-2 flex justify-end border-b dark:border-neutral-700">
              <button
                onClick={toggleAllFarmingOneTime}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                <FaCheckDouble />
                {t_planner('button.includeOneTimeRewards', 'Include One-Time')} (All)
              </button>
            </div>
            <div className="divide-y dark:divide-neutral-700">
              {normalStages.map((s) => {
                const runs = runConfig[s.Id] || 0;
                const isCleared = !!clearStatus[s.Id];

                return (
                  <div key={s.Id} className="p-3 animate-fadeIn hover:bg-gray-50 dark:hover:bg-neutral-700/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="w-full sm:w-48 sm:shrink-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-sky-600 dark:text-sky-400 truncate">Normal {s.StageNumber}</h4>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-2">
                          <span>
                            <img className="h-4 w-4 inline" src={`data:image/webp;base64,${iconData.Item[`${entryItemId}`]}`} /> &times; {s.StageEnterCostAmount}
                          </span>
                          <span>Lv.{s.RecommandLevel}</span>
                        </div>

                        <label className="flex items-center space-x-2 mt-2 cursor-pointer select-none group">
                          <input
                            type="checkbox"
                            checked={isCleared}
                            onChange={() => handleClearToggle(s.Id)}
                            className="h-3.5 w-3.5 rounded border-gray-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors">
                            {t_planner('button.includeOneTimeRewards', 'Include One-Time')}
                          </span>
                        </label>
                      </div>

                      <div className="w-full sm:flex-1 min-w-0 overflow-hidden">{renderRewards(s)}</div>

                      <div className="flex flex-col sm:items-end justify-center shrink-0 w-full sm:w-auto gap-1">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase hidden sm:block">{t_common('count')}</span>
                        <div className="flex rounded-md shadow-sm h-8">
                          <CustomNumberInput
                            min={0}
                            max={9999}
                            value={runs}
                            onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                            className="w-16 min-w-0 flex-1 rounded-l-md border border-r-0 border-gray-300 bg-white px-2 text-center text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                          />
                          <button
                            onClick={() => handleSetMaxRuns(s.Id)}
                            className="inline-flex items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-100 focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-600 dark:text-gray-200 dark:hover:bg-neutral-500"
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
          </>
        )}

        {/* --- ONE-TIME TAB --- */}
        {activeTab === 'onetime' && (
          <>
            <div className="bg-gray-50 dark:bg-neutral-900/50 p-2 flex justify-end border-b dark:border-neutral-700">
              <button
                onClick={toggleAllOneTimeClears}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                <FaCheckDouble />
                {t_planner('label.clearAll', 'Clear All')}
              </button>
            </div>
            <div className="divide-y dark:divide-neutral-700">
              {oneTimeStages.map((s) => {
                const isCleared = !!clearStatus[s.Id];
                const isStory = s.StageDifficulty === 1;

                return (
                  <div key={s.Id} className="p-3 animate-fadeIn hover:bg-gray-50 dark:hover:bg-neutral-700/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="w-full sm:w-48 sm:shrink-0">
                        <h4 className={`font-bold text-sm truncate ${isStory ? 'text-indigo-600 dark:text-indigo-400' : 'text-purple-600 dark:text-purple-400'}`}>
                          {isStory ? `${t_common('story')} ${s.StageNumber}` : `Challenge ${s.StageNumber}`}
                        </h4>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex gap-2">
                          <span>
                            <img className="h-4 w-4 inline" src={`data:image/webp;base64,${iconData.Item[`${entryItemId}`]}`} /> &times; {s.StageEnterCostAmount}
                          </span>

                          <span>Lv.{s.RecommandLevel}</span>
                        </div>
                      </div>

                      <div className="w-full sm:flex-1 min-w-0 overflow-hidden">{renderRewards(s)}</div>

                      <div className="flex items-center gap-2 shrink-0 justify-end sm:w-auto">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">{t_c('clear')}</label>
                        <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                          <input
                            type="checkbox"
                            checked={isCleared}
                            onChange={() => handleClearToggle(s.Id)}
                            className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 right-5"
                            style={{
                              right: isCleared ? '0' : 'auto',
                              left: isCleared ? 'auto' : '0',
                              backgroundColor: isCleared ? '#3b82f6' : '#fff',
                              borderColor: isCleared ? '#3b82f6' : '#d1d5db',
                            }}
                          />
                          <label
                            onClick={() => handleClearToggle(s.Id)}
                            className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${isCleared ? 'bg-blue-200' : 'bg-gray-300'}`}
                          ></label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* --- MISSION TAB --- */}
        {activeTab === 'mission' && (
          <>
            <div className="bg-gray-50 dark:bg-neutral-900/50 p-2 flex justify-end border-b dark:border-neutral-700">
              <button
                onClick={toggleAllMissions}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                <FaCheckDouble />
                {t_planner('label.selectAll', 'Select All')}
              </button>
            </div>
            <div className="divide-y dark:divide-neutral-700">
              {missions.length === 0 && <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No Missions Available</div>}
              {missions.map((m) => {
                const isCompleted = !!missionStatus[m.Id];

                return (
                  <div key={m.Id} className="p-3 animate-fadeIn hover:bg-gray-50 dark:hover:bg-neutral-700/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Description */}
                      <div className="w-full sm:flex-1">
                        <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">{getMissionDesc(locale, m)}</p>
                      </div>

                      {/* Rewards */}
                      <div className="shrink-0 flex gap-1">
                        {m.MissionRewardParcelId.map((id, idx) => (
                          <div key={`${m.Id}-${idx}`}>
                            <ItemIcon type={m.MissionRewardParcelTypeStr[idx]} itemId={String(id)} amount={m.MissionRewardAmount[idx]} size={9} eventData={eventData} iconData={iconData} />
                          </div>
                        ))}
                      </div>

                      {/* Toggle */}
                      <div className="shrink-0 flex justify-end">
                        <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={() => handleMissionToggle(m.Id)}
                            className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 right-5"
                            style={{
                              right: isCompleted ? '0' : 'auto',
                              left: isCompleted ? 'auto' : '0',
                              backgroundColor: isCompleted ? '#3b82f6' : '#fff',
                              borderColor: isCompleted ? '#3b82f6' : '#d1d5db',
                            }}
                          />
                          <label
                            onClick={() => handleMissionToggle(m.Id)}
                            className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${isCompleted ? 'bg-blue-200' : 'bg-gray-300'}`}
                          ></label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
};
