import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckDouble } from 'react-icons/fa';
import { ItemIcon } from '../common/Icon';

import { CustomNumberInput } from '~/components/CustomInput';
import type { EventData, IconData, FieldQuestItem } from '~/types/plannerData';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { getItemSortPriority } from '~/utils/itemSort';
import { type FieldEventConfig, defaultFieldEventConfig, getStageCost } from '~/types/minigame/fieldEvent';
import type { WithNonNullable } from '~/utils/WithNonNullable';

export type FieldEventTab = 'quest' | 'mastery' | 'stage';

export type FieldEventResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

interface FieldEventPlannerProps {
  eventId: number;
  eventData: WithNonNullable<EventData, 'currency' | 'field'>;
  iconData: IconData;
  onCalculate: (result: FieldEventResult | null) => void;
  remainingCurrency: Record<number, number>;
}

const getLang = (lang: string) => {
  if (lang === 'ko' || lang === 'kr') return 'ko';
  if (lang === 'ja' || lang === 'jp') return 'ja';
  if (lang === 'en') return 'en';
  return 'ja';
};

const getQuestName = (keyData: { Kr: string; Jp: string; NameEn: string; NameTw: string }, lang: string): string => {
  const l = getLang(lang);
  if (l === 'ko') return keyData.Kr;
  if (l === 'en') return keyData.NameEn || keyData.Jp;
  return keyData.Jp;
};

// FieldDateId = SeasonId * 100 + dayIndex
const getDayIndex = (fieldDateId: number) => fieldDateId % 100;

export const FieldEventPlanner = ({ eventId, eventData, iconData, onCalculate, remainingCurrency }: FieldEventPlannerProps) => {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'field_event' });
  const { t: t_p } = useTranslation('planner');
  const [fromDayValue, setFromDayValue] = useState('');

  const { fieldEventActiveTab: activeTab, setFieldEventActiveTab: setActiveTab, fieldEventDisplayResult: displayResult, setFieldEventDisplayResult: setDisplayResult } = useEventSettings(eventId);

  const { fieldEventConfig, setFieldEventConfig } = usePlanForEvent(eventId);
  const config: FieldEventConfig = fieldEventConfig ?? defaultFieldEventConfig;

  const fieldData = eventData.field;
  // if (!fieldData) return null;

  const { FieldQuest: quests, FieldMasteryLevel: levels, FieldMasteryManage: masteryManage, FieldContentStageReward: stageRewards } = fieldData;

  const maxLevel = useMemo(() => {
    const levelsWithReward = levels.filter((l) => l.Reward && l.Reward.length > 0);
    return levelsWithReward.length > 0 ? Math.max(...levelsWithReward.map((l) => l.Level)) : levels.length;
  }, [levels]);

  const masteryName = useMemo(() => {
    const manage = masteryManage[0];
    if (!manage) return '';
    const l = getLang(i18n.language);
    if (l === 'ko') return manage.LocalizeEtcData.NameKr;
    if (l === 'en') return manage.LocalizeEtcData.NameEn || manage.LocalizeEtcData.NameJp;
    return manage.LocalizeEtcData.NameJp;
  }, [masteryManage, i18n.language]);

  const stageEntries = useMemo(() => Object.entries(stageRewards), [stageRewards]);

  const eventCurrencyIds = useMemo(() => new Set(eventData.currency.map((c) => c.ItemUniqueId)), [eventData.currency]);
  // Entry currency for MAX button calculation
  const entryCurrencyId = eventData.currency[0]?.ItemUniqueId;

  // Group quests by day index (FieldDateId % 100)
  const questsByDay = useMemo(() => {
    const map = new Map<number, FieldQuestItem[]>();
    for (const q of quests) {
      const day = getDayIndex(q.FieldDateId);
      if (!map.has(day)) map.set(day, []);
      map.get(day)?.push(q);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [quests]);

  const calculate = useCallback(
    (cfg: FieldEventConfig) => {
      const cost: Record<string, number> = {};
      const rewards: Record<string, number> = {};

      const addReward = (type: string, id: number, amount: number) => {
        const key = `${type}_${id}`;
        rewards[key] = (rewards[key] || 0) + amount;
      };

      const addCost = (type: string, id: number, amount: number) => {
        const key = `${type}_${id}`;
        cost[key] = (cost[key] || 0) + amount;
      };

      // Quest rewards: completions to be done
      for (const quest of quests) {
        const key = String(quest.FieldSeasonId);
        const toBeDone = cfg.questCompletions[key] ?? 0;
        if (toBeDone <= 0) continue;
        for (const r of quest.Reward) {
          addReward(r.RewardParcelType, r.RewardId, r.RewardAmount * toBeDone);
        }
      }

      // Mastery level rewards
      const start = Math.max(1, cfg.masteryStartLevel);
      const end = Math.min(maxLevel, cfg.masteryEndLevel);
      for (const level of levels) {
        if (level.Level < start || level.Level > end) continue;
        if (!level.Reward) continue;
        for (const r of level.Reward) {
          addReward(r.RewardParcelType, r.RewardId, r.RewardAmount);
        }
      }

      // Stage farming rewards and cost
      if (entryCurrencyId) {
        for (const [stageId, rewardItems] of stageEntries) {
          const runs = cfg.stageRunCounts[stageId] ?? 0;
          const includeFirstClear = cfg.stageFirstClears[stageId] ?? false;

          if (runs > 0) {
            const stageCost = getStageCost(eventId, stageId) * runs;
            addCost('Item', entryCurrencyId, stageCost);
          }

          for (const r of rewardItems) {
            if (r.RewardProb === 0) continue;
            const isSpecial = r.RewardTag === 'FirstClear' || r.RewardTag === 'ThreeStar';

            if (isSpecial) {
              if (includeFirstClear) {
                addReward(r.RewardParcelType, r.RewardId, r.RewardAmount);
              }
            } else {
              if (runs <= 0) continue;
              const amount = (r.RewardAmount * r.RewardProb) / 10000;
              addReward(r.RewardParcelType, r.RewardId, amount * runs);
            }
          }
        }
      }

      const result: FieldEventResult = { cost, rewards };
      setDisplayResult(result);
      onCalculate(result);
    },
    [quests, levels, stageEntries, maxLevel, entryCurrencyId, eventId, setDisplayResult, onCalculate],
  );

  useEffect(() => {
    if (!displayResult) {
      calculate(config);
    }
  }, []);

  const updateConfig = useCallback(
    (patch: Partial<FieldEventConfig>) => {
      const next = { ...config, ...patch };
      setFieldEventConfig(next);
      calculate(next);
    },
    [config, setFieldEventConfig, calculate],
  );

  const setQuestCompletion = (fieldSeasonId: number, count: number) => {
    updateConfig({
      questCompletions: { ...config.questCompletions, [String(fieldSeasonId)]: count },
    });
  };

  const setDayCompletion = useCallback(
    (dayIndex: number, done: boolean) => {
      const patch: Record<string, number> = { ...config.questCompletions };
      const group = questsByDay.find(([d]) => d === dayIndex)?.[1] ?? [];
      for (const q of group) {
        patch[String(q.FieldSeasonId)] = done ? (q.IsDaily ? 2 : 1) : 0;
      }
      updateConfig({ questCompletions: patch });
    },
    [config.questCompletions, questsByDay, updateConfig],
  );

  const setFromDayCompletion = useCallback(
    (fromDay: number, done: boolean) => {
      const patch: Record<string, number> = { ...config.questCompletions };
      for (const [day, group] of questsByDay) {
        if (day < fromDay) continue;
        for (const q of group) {
          patch[String(q.FieldSeasonId)] = done ? (q.IsDaily ? 2 : 1) : 0;
        }
      }
      updateConfig({ questCompletions: patch });
    },
    [config.questCompletions, questsByDay, updateConfig],
  );

  const setAllCompletion = useCallback(
    (done: boolean) => {
      const patch: Record<string, number> = {};
      for (const q of quests) {
        patch[String(q.FieldSeasonId)] = done ? (q.IsDaily ? 2 : 1) : 0;
      }
      updateConfig({ questCompletions: patch });
    },
    [quests, updateConfig],
  );

  const allDone = useMemo(() => quests.every((q) => (config.questCompletions[String(q.FieldSeasonId)] ?? 0) >= (q.IsDaily ? 2 : 1)), [quests, config.questCompletions]);

  const setMasteryLevel = (field: 'masteryStartLevel' | 'masteryEndLevel', raw: number) => {
    const value = Math.max(1, Math.min(maxLevel, raw || 1));
    const next =
      field === 'masteryStartLevel'
        ? { masteryStartLevel: value, masteryEndLevel: Math.max(value, config.masteryEndLevel) }
        : { masteryStartLevel: Math.min(config.masteryStartLevel, value), masteryEndLevel: value };
    updateConfig(next);
  };

  const setStageRuns = (stageId: string, runs: number) => {
    updateConfig({ stageRunCounts: { ...config.stageRunCounts, [stageId]: Math.max(0, runs) } });
  };

  const toggleStageFirstClear = (stageId: string) => {
    const current = config.stageFirstClears[stageId] ?? false;
    updateConfig({ stageFirstClears: { ...config.stageFirstClears, [stageId]: !current } });
  };

  const allFirstClearsEnabled = useMemo(() => stageEntries.length > 0 && stageEntries.every(([id]) => config.stageFirstClears[id] ?? false), [stageEntries, config.stageFirstClears]);

  const toggleAllFirstClears = useCallback(() => {
    const next = !allFirstClearsEnabled;
    const patch: Record<string, boolean> = {};
    for (const [id] of stageEntries) patch[id] = next;
    updateConfig({ stageFirstClears: patch });
  }, [allFirstClearsEnabled, stageEntries, updateConfig]);

  const handleSetMaxRuns = useCallback(
    (stageId: string) => {
      if (!entryCurrencyId) return;
      const available = remainingCurrency[entryCurrencyId] ?? 0;
      let usedByOthers = 0;
      for (const [otherId] of stageEntries) {
        if (otherId === stageId) continue;
        usedByOthers += (config.stageRunCounts[otherId] ?? 0) * getStageCost(eventId, otherId);
      }
      const remaining = Math.max(0, available - usedByOthers);
      const maxRuns = Math.floor(remaining / getStageCost(eventId, stageId));
      updateConfig({ stageRunCounts: { ...config.stageRunCounts, [stageId]: maxRuns } });
    },
    [entryCurrencyId, remainingCurrency, stageEntries, config.stageRunCounts, eventId, updateConfig],
  );

  const totalStageCost = useMemo(() => {
    return stageEntries.reduce((sum, [stageId]) => {
      return sum + (config.stageRunCounts[stageId] ?? 0) * getStageCost(eventId, stageId);
    }, 0);
  }, [stageEntries, config.stageRunCounts, eventId]);

  const tabs: { id: FieldEventTab; name: string }[] = [
    { id: 'quest', name: t('tabQuest') },
    { id: 'mastery', name: t('tabMastery') },
    { id: 'stage', name: t('tabStage') },
  ];

  const tabBtnCls = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${
      active
        ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'
    }`;

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>

      <div className="mt-4 space-y-4">
        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={tabBtnCls(activeTab === tab.id)}>
              {tab.name}
            </button>
          ))}
        </div>

        {/* ── QUEST TAB ── */}
        {activeTab === 'quest' && (
          <div className="space-y-3">
            {/* Global bulk controls */}
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => setAllCompletion(!allDone)}
                className={`text-xs font-bold px-3 py-1.5 rounded border transition-colors ${
                  allDone
                    ? 'bg-neutral-100 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400'
                    : 'bg-blue-500 border-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {allDone ? t('questDeselectAll') : t('questSelectAll')}
              </button>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('questFromDay')}</span>
              <select
                value={fromDayValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setFromDayValue(val);
                  if (val !== '') setFromDayCompletion(Number(val), true);
                }}
                className="text-xs border rounded px-2 py-1 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 focus:outline-none focus:border-blue-400"
              >
                <option value="" disabled>
                  —
                </option>
                {questsByDay.map(([day]) => (
                  <option key={day} value={day}>
                    {t('questDay', { day: day + 1 })}~
                  </option>
                ))}
              </select>
            </div>

            {/* Quests grouped by day */}
            {questsByDay.map(([day, group]) => {
              const groupAllDone = group.every((q) => (config.questCompletions[String(q.FieldSeasonId)] ?? 0) >= (q.IsDaily ? 2 : 1));
              return (
                <div key={day}>
                  {/* Day header */}
                  <div className="flex items-center gap-2 py-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">{t('questDay', { day: day + 1 })}</span>
                    <button
                      onClick={() => setDayCompletion(day, !groupAllDone)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded border transition-colors ${
                        groupAllDone
                          ? 'border-neutral-300 dark:border-neutral-600 text-neutral-400 dark:text-neutral-500 bg-transparent'
                          : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100'
                      }`}
                    >
                      {groupAllDone ? t('questDeselectAll') : t('questSelectAll')}
                    </button>
                  </div>

                  {/* Quest rows in this day */}
                  <div className="divide-y dark:divide-neutral-700">
                    {group.map((quest) => {
                      const key = String(quest.FieldSeasonId);
                      const done = config.questCompletions[key] ?? 0;
                      // const maxDone = quest.IsDaily ? 2 : 1;
                      const name = getQuestName(quest.QuestNamKeyData, i18n.language);

                      return (
                        <div key={quest.FieldSeasonId} className="flex flex-wrap items-center gap-3 py-2">
                          {/* Name */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {quest.IsDaily && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">{t('questDaily')}</span>
                            )}
                            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">{name}</span>
                          </div>

                          {/* Rewards */}
                          <div className="flex flex-wrap gap-1 shrink-0">
                            {quest.Reward.map((r, ri) => (
                              <ItemIcon key={ri} type={r.RewardParcelType} itemId={String(r.RewardId)} amount={r.RewardAmount} size={9} eventData={eventData} iconData={iconData} />
                            ))}
                          </div>

                          {/* Completion control */}
                          {quest.IsDaily ? (
                            <div className="flex items-center gap-1 shrink-0">
                              {[0, 1, 2].map((n) => (
                                <button
                                  key={n}
                                  onClick={() => setQuestCompletion(quest.FieldSeasonId, n)}
                                  className={`w-7 h-7 rounded text-xs font-bold transition-colors border ${
                                    done === n
                                      ? 'bg-blue-500 border-blue-500 text-white'
                                      : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-blue-400'
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => setQuestCompletion(quest.FieldSeasonId, done >= 1 ? 0 : 1)}
                              className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                done >= 1 ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600'
                              }`}
                              aria-label="toggle completed"
                            >
                              {done >= 1 && <span className="text-xs">✓</span>}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MASTERY TAB ── */}
        {activeTab === 'mastery' && (
          <div className="space-y-3 text-sm">
            {masteryName && <div className="font-bold text-neutral-800 dark:text-neutral-200">{masteryName}</div>}

            {/* Range controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{t('masteryRange')}</span>
              <div className="flex items-center gap-1">
                <CustomNumberInput
                  min={1}
                  max={maxLevel}
                  value={config.masteryStartLevel}
                  onChange={(v) => setMasteryLevel('masteryStartLevel', Number(v))}
                  className="w-16 p-1 border rounded text-center dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-100"
                />
                <span className="text-neutral-400 dark:text-neutral-500">~</span>
                <CustomNumberInput
                  min={config.masteryStartLevel}
                  max={maxLevel}
                  value={config.masteryEndLevel}
                  onChange={(v) => setMasteryLevel('masteryEndLevel', Number(v))}
                  className="w-16 p-1 border rounded text-center dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-100"
                />
              </div>
              <button
                onClick={() => updateConfig({ masteryStartLevel: 1, masteryEndLevel: maxLevel })}
                className="text-xs font-bold px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {t('masteryAll', { max: maxLevel })}
              </button>
            </div>

            {/* Level list */}
            <div className="divide-y dark:divide-neutral-700">
              {levels
                .filter((l) => l.Level >= config.masteryStartLevel && l.Level <= config.masteryEndLevel && l.Reward && l.Reward.length > 0)
                .map((level) => (
                  <div key={level.Level} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 w-12 shrink-0">Lv.{level.Level}</span>
                    <div className="flex flex-wrap gap-1">
                      {level.Reward?.map((r, ri) => (
                        <ItemIcon key={ri} type={r.RewardParcelType} itemId={String(r.RewardId)} amount={r.RewardAmount} size={9} eventData={eventData} iconData={iconData} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── STAGE TAB ── */}
        {activeTab === 'stage' && (
          <div className="text-sm">
            {/* Header bar: global first-clear toggle */}
            <div className="bg-neutral-50 dark:bg-neutral-900/50 px-3 py-2 flex justify-end border-b dark:border-neutral-700 rounded-t-lg">
              <button
                onClick={toggleAllFirstClears}
                className={`flex items-center gap-1 text-xs font-semibold transition-colors ${
                  allFirstClearsEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <FaCheckDouble />
                {t('stageFirstClear')} (All)
              </button>
            </div>

            {/* Stage rows */}
            <div className="divide-y dark:divide-neutral-700 border border-t-0 border-neutral-200 dark:border-neutral-700 rounded-b-lg">
              {stageEntries.map(([stageId, rewardItems], idx) => {
                const runs = config.stageRunCounts[stageId] ?? 0;
                const includeFirstClear = config.stageFirstClears[stageId] ?? false;

                const specialRewards = rewardItems.filter((r) => (r.RewardTag === 'FirstClear' || r.RewardTag === 'ThreeStar') && r.RewardProb > 0);
                const farmItems = rewardItems.filter((r) => r.RewardTag !== 'FirstClear' && r.RewardTag !== 'ThreeStar' && r.RewardProb > 0);
                const eventCurrencyRewards = farmItems.filter((r) => eventCurrencyIds.has(r.RewardId));
                const opartsRewards = farmItems.filter((r) => !eventCurrencyIds.has(r.RewardId) && r.RewardParcelType !== 'GachaGroup').sort((a, b) => a.RewardProb - b.RewardProb);
                const gachaRewards = farmItems.filter((r) => r.RewardParcelType === 'GachaGroup');
                const sortedFarmRewards = [...eventCurrencyRewards, ...opartsRewards, ...gachaRewards];

                return (
                  <div key={stageId} className="p-3 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Left: label + cost + first-clear checkbox */}
                      <div className="sm:w-36 shrink-0">
                        <h4 className="font-bold text-sm text-sky-600 dark:text-sky-400">{t('stageLabel', { n: idx + 1 })}</h4>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center gap-1">
                          {entryCurrencyId && iconData.Item?.[String(entryCurrencyId)] && <img className="h-4 w-4 inline" src={`data:image/webp;base64,${iconData.Item[String(entryCurrencyId)]}`} />}
                          <span>× {getStageCost(eventId, stageId).toLocaleString()}</span>
                        </div>
                        <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none group">
                          <input
                            type="checkbox"
                            checked={includeFirstClear}
                            onChange={() => toggleStageFirstClear(stageId)}
                            className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-neutral-600 dark:text-neutral-300 group-hover:text-neutral-800 dark:group-hover:text-neutral-100 transition-colors">
                            {t('stageFirstClear')}
                          </span>
                        </label>
                      </div>

                      {/* Middle: rewards */}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex overflow-x-auto gap-1.5 pb-1 scrollbar-hide">
                          {specialRewards.map((r, ri) => (
                            <div key={`sp-${ri}`} className="shrink-0">
                              <ItemIcon
                                type={r.RewardParcelType}
                                itemId={String(r.RewardId)}
                                amount={(r.RewardAmount * r.RewardProb) / 10000}
                                size={10}
                                eventData={eventData}
                                iconData={iconData}
                                label={r.RewardTag === 'FirstClear' ? 'First' : '３★'}
                                labelColor={r.RewardTag === 'FirstClear' ? 'bg-yellow-500' : 'bg-amber-400'}
                              />
                            </div>
                          ))}
                          {sortedFarmRewards.map((r, ri) => (
                            <div key={`r-${ri}`} className="shrink-0">
                              <ItemIcon type={r.RewardParcelType} itemId={String(r.RewardId)} amount={(r.RewardAmount * r.RewardProb) / 10000} size={10} eventData={eventData} iconData={iconData} />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: run count input + MAX */}
                      <div className="shrink-0">
                        <div className="flex rounded-md shadow-sm h-8">
                          <CustomNumberInput
                            min={0}
                            max={9999}
                            value={runs}
                            onChange={(v) => setStageRuns(stageId, Number(v) || 0)}
                            className="w-16 min-w-0 flex-1 rounded-l-md border border-r-0 border-neutral-300 bg-white px-2 text-center text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                          />
                          <button
                            onClick={() => handleSetMaxRuns(stageId)}
                            className="inline-flex items-center rounded-r-md border border-l-0 border-neutral-300 bg-neutral-50 px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-500"
                          >
                            MAX
                          </button>
                        </div>
                        {runs > 0 && <div className="text-[11px] text-neutral-400 dark:text-neutral-500 text-right mt-0.5">{(runs * getStageCost(eventId, stageId)).toLocaleString()} pt</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalStageCost > 0 && <div className="pt-2 text-xs text-neutral-600 dark:text-neutral-400 font-bold">{t('totalEventPts', { total: totalStageCost.toLocaleString() })}</div>}
          </div>
        )}

        {/* ── RESULT SUMMARY ── */}
        {displayResult && (Object.keys(displayResult.cost ?? {}).length > 0 || Object.keys(displayResult.rewards).length > 0) && (
          <div className="pt-4 border-t dark:border-neutral-700 space-y-3">
            <h3 className="font-bold text-base dark:text-neutral-200">{t('resultTitle')}</h3>
            {displayResult.cost && Object.keys(displayResult.cost).length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/30 p-3 rounded-lg">
                <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2 text-sm">{t_p('clue_search.cost')}</h4>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {Object.entries(displayResult.cost)
                    .filter(([, amount]) => amount > 0)
                    .sort(([ka], [kb]) => getItemSortPriority(ka, eventData) - getItemSortPriority(kb, eventData))
                    .map(([key, amount]) => (
                      <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={11} eventData={eventData} iconData={iconData} />
                    ))}
                </div>
              </div>
            )}
            {Object.keys(displayResult.rewards).length > 0 && (
              <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg">
                <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2 text-sm">{t('rewards')}</h4>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {Object.entries(displayResult.rewards)
                    .filter(([, amount]) => amount > 0)
                    .sort(([ka], [kb]) => getItemSortPriority(ka, eventData) - getItemSortPriority(kb, eventData))
                    .map(([key, amount]) => (
                      <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={11} eventData={eventData} iconData={iconData} />
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
