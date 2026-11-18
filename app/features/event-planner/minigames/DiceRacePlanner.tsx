// app/components/planner/minigame/DiceRacePlanner.tsx
import type { DiceRaceResult } from '~/types/minigame/diceRace';
import type { DiceRaceTab } from '~/types/minigame/diceRace';
import { useState, useCallback, useEffect, useMemo } from 'react';
import HelpTooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { ItemIcon } from '../../../components/item/Icon';
import { SimRunButton } from '../components/SimRunButton';
import { NumberInput } from '../../../components/common/NumberInput';
import { IconSelect } from '../components/IconSelect';
import { DiceRaceTileGrid } from './DiceRaceTileGrid';
import { getItemName } from '../../../utils/locale';
import type { EventData, IconData } from '~/types/plannerData';
import { useEventSettings } from '~/features/event-planner/useSettingsStore';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';

import { useTranslation } from 'react-i18next';
import { type DiceRaceSimConfig, DefaultDiceRaceSimConfig } from '~/types/minigame/diceRace';
import type { WithNonNullable } from '~/utils/WithNonNullable';
import { runAsync } from '~/utils/runAsync';
import type { Locale } from '~/utils/i18n/config';
import { runSimulation } from '~/features/event-planner/logic/diceRaceSim';

export type { DiceRaceSimConfig };
export { DefaultDiceRaceSimConfig };

// --- Type definitions ---

interface DiceRacePlannerProps {
  eventId: number;
  eventData: WithNonNullable<EventData, 'currency' | 'dice_race'>;
  iconData: IconData;
  onCalculate: (result: DiceRaceResult | null) => void;
  // remainingCurrency: Record<number, number>;
}

type SimulationResult = ReturnType<typeof runSimulation>;

// What the recommendation optimizes: fewest rolls, or the most of one reward per ticket spent (the ticket is the AP-bought cost).
export type RecommendCriterion = { type: 'rolls' } | { type: 'perTicket'; rewardKey: string };

export type Strategy = { fixedDicePriority: number[]; allowDoubleFixedDice: boolean };

export type StrategyStats = { avgRolls: number; perTicket: number | null };

export type Recommendation = {
  status: 'improved' | 'noGain';
  strategy: Strategy;
  current: StrategyStats;
  recommended: StrategyStats;
  // Positive = better than the current strategy, in the criterion's own unit (rolls saved, or reward per ticket gained).
  gain: number;
  inputKey: string;
};

const SCREEN_RUNS = 1000;
const VERIFY_RUNS = 10000;
const MAX_RECOMMENDED_TILES = 8;
// Fixed seeds: screening and verification use different luck so the winner's score is not just its screening luck.
const SCREEN_SEED = 0x5eed01;
const VERIFY_SEED = 0x5eed02;

// Everything a recommendation depends on, including the current strategy it is compared against.
export const getSimInputKey = (simConfig: DiceRaceSimConfig): string => JSON.stringify({ ...simConfig, simRuns: 0, allowDoubleFixedDice: simConfig.allowDoubleFixedDice ?? false });
export const getRecommendInputKey = (criterion: RecommendCriterion, simConfig: DiceRaceSimConfig): string => JSON.stringify([criterion, getSimInputKey(simConfig)]);

// Inputs that make a simulation meaningless (used to disable run/recommend and explain why).
export type GoalIssue = 'noTargetItem' | 'targetUnreachable';
export const getDiceRaceGoalIssue = (diceRaceData: NonNullable<EventData['dice_race']>, simConfig: DiceRaceSimConfig): GoalIssue | null => {
  if (simConfig.endConditionType !== 'item' || simConfig.targetItemAmount <= 0) return null;
  if (simConfig.targetItemId <= 0) return 'noTargetItem';
  const obtainableOnTiles = diceRaceData.race_node.some((node) => node.RewardParcelId?.includes(simConfig.targetItemId));
  if (obtainableOnTiles) return null;
  const fromLaps = diceRaceData.total_reward.reduce((sum, r) => sum + r.RewardParcelId.reduce((acc, id, i) => (id === simConfig.targetItemId ? acc + r.RewardParcelAmount[i] : acc), 0), 0);
  return simConfig.targetItemAmount > fromLaps ? 'targetUnreachable' : null;
};

const strategyConfig = (simConfig: DiceRaceSimConfig, strategy: Strategy, simRuns: number): DiceRaceSimConfig => ({ ...simConfig, simRuns, ...strategy });

const sameStrategy = (a: Strategy, b: Strategy) =>
  a.allowDoubleFixedDice === b.allowDoubleFixedDice && a.fixedDicePriority.length === b.fixedDicePriority.length && a.fixedDicePriority.every((tile) => b.fixedDicePriority.includes(tile));

export const recommendFixedDiceRouting = (
  diceRaceData: NonNullable<EventData['dice_race']>,
  simConfig: DiceRaceSimConfig,
  eventData: WithNonNullable<EventData, 'currency' | 'dice_race'>,
  criterion: RecommendCriterion,
): Recommendation => {
  const rewardKey = criterion.type === 'perTicket' ? criterion.rewardKey : undefined;
  const boardSize = diceRaceData.race_node.length;
  const costPerRoll = diceRaceData.info[0].DiceCostGoods.ConsumeParcelAmount[0];
  const current: Strategy = { fixedDicePriority: simConfig.fixedDicePriority, allowDoubleFixedDice: simConfig.allowDoubleFixedDice ?? false };

  const evaluate = (strategy: Strategy, runs: number, seed: number) => runSimulation(diceRaceData, strategyConfig(simConfig, strategy, runs), eventData, { seed, perRunRewardKey: rewardKey ?? '' });
  const stats = (result: SimulationResult): StrategyStats => {
    const cost = result.avgRolls * costPerRoll;
    return { avgRolls: result.avgRolls, perTicket: rewardKey !== undefined && cost > 0 ? (result.perRun ? meanOf(result.perRun.reward) : 0) / cost : null };
  };
  // Higher is better for both criteria.
  const score = (result: SimulationResult) => {
    if (rewardKey === undefined) return -result.avgRolls;
    const cost = result.avgRolls * costPerRoll;
    return cost > 0 && result.perRun ? meanOf(result.perRun.reward) / cost : 0;
  };

  // 1) Screening: greedy tile selection, all candidates simulated with the same seed (paired luck).
  const screen = (strategy: Strategy) => score(evaluate(strategy, SCREEN_RUNS, SCREEN_SEED));
  const chosen: number[] = [];
  let chosenScore = screen({ fixedDicePriority: [], allowDoubleFixedDice: false });
  while (chosen.length < Math.min(MAX_RECOMMENDED_TILES, boardSize)) {
    let bestTile = -1;
    let bestScore = chosenScore;
    for (let tile = 0; tile < boardSize; tile++) {
      if (chosen.includes(tile)) continue;
      const candidateScore = screen({ fixedDicePriority: [...chosen, tile], allowDoubleFixedDice: false });
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestTile = tile;
      }
    }
    // Stop when the best addition no longer moves the score beyond a small relative margin.
    if (bestTile < 0 || bestScore - chosenScore <= Math.abs(chosenScore) * 0.002) break;
    chosen.push(bestTile);
    chosenScore = bestScore;
  }

  // 2) Verification on fresh luck: current strategy vs. the greedy set (double use off/on) vs. every tile (the efficiency tab's default).
  const everyTile = Array.from({ length: boardSize }, (_, i) => i);
  const candidates: Strategy[] = [
    { fixedDicePriority: chosen, allowDoubleFixedDice: false },
    { fixedDicePriority: chosen, allowDoubleFixedDice: true },
    { fixedDicePriority: everyTile, allowDoubleFixedDice: false },
    { fixedDicePriority: everyTile, allowDoubleFixedDice: true },
  ].filter((candidate) => candidate.fixedDicePriority.length > 0);
  const currentResult = evaluate(current, VERIFY_RUNS, VERIFY_SEED);
  let best: { strategy: Strategy; result: SimulationResult } = { strategy: current, result: currentResult };
  for (const candidate of candidates) {
    const result = evaluate(candidate, VERIFY_RUNS, VERIFY_SEED);
    // Strictly better only, so ties keep the current strategy and then the simpler candidate.
    if (score(result) > score(best.result)) best = { strategy: candidate, result };
  }

  const inputKey = getRecommendInputKey(criterion, simConfig);
  const currentStats = stats(currentResult);
  const recommendedStats = stats(best.result);
  if (sameStrategy(best.strategy, current)) {
    return { status: 'noGain', strategy: current, current: currentStats, recommended: currentStats, gain: 0, inputKey };
  }

  // Paired difference per run (same luck for both strategies): improvement must clear two standard errors.
  const gainPerRun = pairedGains(currentResult, best.result, costPerRoll, rewardKey !== undefined);
  const improved = gainPerRun.mean > 2 * gainPerRun.standardError && gainPerRun.mean > 0;
  return improved
    ? {
        status: 'improved',
        strategy: best.strategy,
        current: currentStats,
        recommended: recommendedStats,
        gain: rewardKey !== undefined ? (recommendedStats.perTicket ?? 0) - (currentStats.perTicket ?? 0) : currentStats.avgRolls - recommendedStats.avgRolls,
        inputKey,
      }
    : { status: 'noGain', strategy: current, current: currentStats, recommended: currentStats, gain: 0, inputKey };
};

const meanOf = (values: Float64Array): number => {
  let sum = 0;
  for (const value of values) sum += value;
  return values.length === 0 ? 0 : sum / values.length;
};

// Mean and standard error of (recommended - current) per run, in "rolls saved" or "reward per ticket" units.
const pairedGains = (current: SimulationResult, recommended: SimulationResult, costPerRoll: number, perTicket: boolean): { mean: number; standardError: number } => {
  const a = current.perRun;
  const b = recommended.perRun;
  if (!a || !b || a.rolls.length === 0) return { mean: 0, standardError: Infinity };
  const n = a.rolls.length;
  const diffs = new Float64Array(n);
  if (perTicket) {
    // Ratio-of-means estimator linearized per run so a paired standard error exists.
    const ratio = (r: { rolls: Float64Array; reward: Float64Array }) => meanOf(r.reward) / (meanOf(r.rolls) * costPerRoll);
    const ratioA = ratio(a);
    const ratioB = ratio(b);
    const meanCostA = meanOf(a.rolls) * costPerRoll;
    const meanCostB = meanOf(b.rolls) * costPerRoll;
    for (let i = 0; i < n; i++) {
      diffs[i] = (b.reward[i] - ratioB * b.rolls[i] * costPerRoll) / meanCostB - (a.reward[i] - ratioA * a.rolls[i] * costPerRoll) / meanCostA;
    }
    const mean = ratioB - ratioA;
    return { mean, standardError: standardErrorOf(diffs) };
  }
  for (let i = 0; i < n; i++) diffs[i] = a.rolls[i] - b.rolls[i];
  return { mean: meanOf(diffs), standardError: standardErrorOf(diffs) };
};

const standardErrorOf = (values: Float64Array): number => {
  const n = values.length;
  if (n < 2) return Infinity;
  const mean = meanOf(values);
  let sumSq = 0;
  for (const value of values) sumSq += (value - mean) ** 2;
  return Math.sqrt(sumSq / (n - 1) / n);
};

type RaceNode = NonNullable<EventData['dice_race']>['race_node'][number];

// Tile frame by node type: 0 start/finish, 2 forward move, 3 special, otherwise a plain reward tile.
const nodeFrameCls = (node: RaceNode): string => {
  switch (node.EventContentDiceRaceNodeType) {
    case 0:
      return 'bg-white dark:bg-neutral-800 border-green-500 dark:border-green-600';
    case 2:
      return 'bg-neutral-100 dark:bg-neutral-900 border-dashed border-neutral-400 dark:border-neutral-600';
    case 3:
      return 'bg-white dark:bg-neutral-800 border-amber-500 dark:border-amber-600';
    default:
      return 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700';
  }
};
const nodeNumberCls = (node: RaceNode): string => {
  if (node.EventContentDiceRaceNodeType === 0) return 'text-green-600 dark:text-green-400';
  if (node.EventContentDiceRaceNodeType === 3) return 'text-amber-600 dark:text-amber-400';
  return 'text-neutral-400 dark:text-neutral-500';
};

// Eligma (gacha currency), listed first among the recommendation bases
const ELIGMA_KEY = 'Item_23';

const inputLabelCls = 'text-xs text-neutral-600 dark:text-neutral-400';
const segmentCls = (active: boolean) =>
  `px-3 h-8 text-sm font-semibold ${active ? 'bg-ba-btn-blue text-neutral-900' : 'bg-white dark:bg-neutral-700/50 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600'}`;

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
    <p className="text-base font-bold text-neutral-900 dark:text-neutral-100">{value}</p>
  </div>
);

export const DiceRacePlanner = ({ eventId, eventData, iconData, onCalculate /*remainingCurrency*/ }: DiceRacePlannerProps) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  // 'rolls' or the reward key whose amount per ticket is maximized
  const [criterionValue, setCriterionValue] = useState('rolls');
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const { setDiceRaceSimConfig: setSimConfig, diceRaceSimConfig: simConfig } = usePlanForEvent(eventId);

  const { diceRaceActiveTab: activeTab, setDiceRaceActiveTab: setActiveTab, diceRaceSimResult: simResult, setDiceRaceSimResult: setSimResult } = useEventSettings(eventId);

  const { t, i18n } = useTranslation('planner', { keyPrefix: 'dice_race' });
  const { t: t_ui } = useTranslation('ui');
  const { t: t_planner } = useTranslation('planner');
  const locale = i18n.language as Locale;

  const diceRaceData = eventData.dice_race;

  // Reward items obtainable in this event, excluding fixed dice, which are never accumulated.
  // `fromTiles` marks items that tiles can give; lap-completion rewards do not depend on where fixed dice are spent.
  const rewardOptions = useMemo(() => {
    const fixedDiceIds = new Set(eventData.currency.map((c) => c.ItemUniqueId));
    const tileKeys = new Set<string>();
    for (const node of diceRaceData.race_node) {
      node.RewardParcelId?.forEach((id, i) => tileKeys.add(`${node.RewardParcelTypeStr?.[i] ?? ''}_${id}`));
    }
    const keys = new Set<string>(tileKeys);
    for (const reward of diceRaceData.total_reward) {
      reward.RewardParcelId.forEach((id, i) => keys.add(`${reward.RewardParcelTypeStr[i]}_${id}`));
    }
    return [...keys]
      .filter((key) => !fixedDiceIds.has(Number(key.slice(key.lastIndexOf('_') + 1))))
      .map((key) => ({ key, type: key.slice(0, key.lastIndexOf('_')), id: key.slice(key.lastIndexOf('_') + 1), name: getItemName(key, eventData.icons, locale), fromTiles: tileKeys.has(key) }));
  }, [diceRaceData, eventData.currency, eventData.icons, locale]);
  // Options for the recommendation basis: tile rewards only, Eligma first.
  const tileRewardOptions = useMemo(() => rewardOptions.filter((o) => o.fromTiles).sort((a, b) => Number(b.key === ELIGMA_KEY) - Number(a.key === ELIGMA_KEY)), [rewardOptions]);

  const handleRunSimulation = useCallback(() => {
    setIsRunning(true);
    void runAsync(() => {
      const result = runSimulation(diceRaceData, simConfig, eventData);
      setSimResult({ avgCost: result.avgCost, avgRewards: result.avgRewards, avgRolls: result.avgRolls, inputKey: getSimInputKey(simConfig) });
    }).finally(() => setIsRunning(false));
  }, [simConfig, diceRaceData, eventData, setSimResult]);

  useEffect(() => {
    if (simResult) {
      onCalculate({
        cost: simResult.avgCost,
        rewards: simResult.avgRewards,
      });
    } else {
      onCalculate(null);
    }
  }, [simResult, onCalculate]);

  const criterion: RecommendCriterion = criterionValue === 'rolls' ? { type: 'rolls' } : { type: 'perTicket', rewardKey: criterionValue };
  const goalIssue = getDiceRaceGoalIssue(diceRaceData, simConfig);

  const handleRecommend = () => {
    setIsRecommending(true);
    void runAsync(() => recommendFixedDiceRouting(diceRaceData, simConfig, eventData, criterion))
      .then(setRecommendation)
      .catch((err: unknown) => console.error('Recommendation error:', err))
      .finally(() => setIsRecommending(false));
  };

  const handlePriorityToggle = (nodeId: number) => {
    setSimConfig((prev) => {
      const newPrio = new Set(prev.fixedDicePriority);
      if (newPrio.has(nodeId)) {
        newPrio.delete(nodeId);
      } else {
        newPrio.add(nodeId);
      }
      return { ...prev, fixedDicePriority: [...newPrio] };
    });
  };

  const tabs: { id: DiceRaceTab; name: string }[] = [
    { id: 'overview', name: t_ui('overview') },
    { id: 'calculator', name: t_ui('calculator') },
  ];

  const boardSize = diceRaceData.race_node.length;
  const allowDouble = simConfig.allowDoubleFixedDice ?? false;
  // A recommendation is only meaningful for the inputs it was computed with.
  const visibleRecommendation = recommendation && recommendation.inputKey === getRecommendInputKey(criterion, simConfig) ? recommendation : null;
  const isResultStale = simResult !== null && simResult.inputKey !== getSimInputKey(simConfig);
  const criterionItemName = criterion.type === 'perTicket' ? getItemName(criterion.rewardKey, eventData.icons, locale) : '';
  const itemTargetOptions = rewardOptions.filter((o) => o.type === 'Item');
  const renderItemIcon = (type: string, id: string) => {
    const data = iconData[type]?.[id];
    return data ? <img src={`data:image/webp;base64,${data}`} className="w-6 h-6 shrink-0 object-cover" alt="" /> : <span className="w-6 h-6 shrink-0" />;
  };

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>
      <div className="mt-4 space-y-4">
        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab.id ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* 'Overview' Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3">
              <h3 className="font-bold dark:text-neutral-200">{t('rewardsPerNode')}</h3>
              <DiceRaceTileGrid
                items={diceRaceData.race_node}
                renderTile={(node, index) => (
                  <div
                    className={`relative h-full flex flex-col items-center justify-center pt-3 border ${nodeFrameCls(node)}`}
                    title={node.EventContentDiceRaceNodeType === 0 ? t('startFinishNode') : undefined}
                  >
                    <span className={`absolute left-1 top-0.5 text-[10px] leading-none font-semibold ${nodeNumberCls(node)}`}>{index}</span>
                    {node.EventContentDiceRaceNodeType === 2 ? (
                      <span className="text-lg font-bold text-neutral-700 dark:text-neutral-300">+{node.MoveForwardTypeArg}</span>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-0.5">
                        {node.RewardParcelId?.map((id, i) => (
                          <ItemIcon key={i} type={node.RewardParcelTypeStr?.[i] ?? ''} itemId={String(id)} amount={node.RewardAmount?.[i] ?? 0} size={8} eventData={eventData} iconData={iconData} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              />
            </div>
            <div>
              <h3 className="font-bold mb-2 dark:text-neutral-200">{t('lapRewards')}</h3>
              <div
                className="grid grid-cols-1 md:grid-cols-2 md:grid-flow-col md:grid-rows-[repeat(var(--lap-rows),auto)] md:gap-x-8"
                style={{ '--lap-rows': Math.ceil(diceRaceData.total_reward.length / 2) } as React.CSSProperties}
              >
                {diceRaceData.total_reward.map((reward) => (
                  <div key={reward.RequiredLapFinishCount} className="py-2 flex items-center gap-3 border-b border-neutral-200 dark:border-neutral-700">
                    <p className="w-16 shrink-0 font-bold text-sm text-neutral-800 dark:text-neutral-200">
                      {t('lapFinishCount', {
                        count: reward.RequiredLapFinishCount,
                      })}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {reward.RewardParcelId.map((id, index) => (
                        <ItemIcon
                          key={index}
                          type={reward.RewardParcelTypeStr[index]}
                          itemId={String(id)}
                          amount={reward.RewardParcelAmount[index]}
                          size={10}
                          eventData={eventData}
                          iconData={iconData}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 'Calculator' Tab Content */}
        {activeTab === 'calculator' && (
          <div className="flex flex-col gap-6 text-sm">
            {/* Current state */}
            <section className="flex flex-col gap-3">
              <h3 className="font-bold text-base dark:text-neutral-200">{t('stateTitle')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1">
                  <span className={inputLabelCls}>{t('startLap')}</span>
                  <NumberInput value={simConfig.startLap} onChange={(v) => setSimConfig((p) => ({ ...p, startLap: v }))} min={1} max={Infinity} narrowButtonType="plus_only" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={inputLabelCls}>{t('startPos')}</span>
                  <NumberInput value={simConfig.startPos} onChange={(v) => setSimConfig((p) => ({ ...p, startPos: v }))} min={0} max={boardSize - 1} narrowButtonType="plus_only" />
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <span className={inputLabelCls}>{t('ownedFixedDice')}</span>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {Object.keys(simConfig.ownedFixedDice).map((die) => (
                    <label key={die} className="flex items-center gap-2">
                      <span className="w-3 text-center font-bold text-neutral-700 dark:text-neutral-300">{die}</span>
                      <NumberInput
                        value={simConfig.ownedFixedDice[die]}
                        onChange={(v) => setSimConfig((p) => ({ ...p, ownedFixedDice: { ...p.ownedFixedDice, [die]: v } }))}
                        min={0}
                        max={Infinity}
                        narrowButtonType="plus_only"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <details>
                <summary className={`${inputLabelCls} cursor-pointer w-fit`}>{t_ui('simRuns')}</summary>
                <div className="mt-2 w-40">
                  <NumberInput value={simConfig.simRuns} onChange={(v) => setSimConfig((p) => ({ ...p, simRuns: v }))} min={1} max={Infinity} narrowButtonType="plus_only" />
                </div>
              </details>
            </section>

            {/* Goal */}
            <section className="flex flex-col gap-3 border-t border-neutral-200 dark:border-neutral-700 pt-4">
              <h3 className="font-bold text-base dark:text-neutral-200">{t('goalTitle')}</h3>
              <div className="flex w-fit divide-x divide-neutral-400 dark:divide-neutral-600 border border-neutral-400 dark:border-neutral-600">
                <button className={segmentCls(simConfig.endConditionType === 'lap_pos')} onClick={() => setSimConfig((p) => ({ ...p, endConditionType: 'lap_pos' }))}>
                  {t('endConditionByLap')}
                </button>
                <button className={segmentCls(simConfig.endConditionType === 'item')} onClick={() => setSimConfig((p) => ({ ...p, endConditionType: 'item' }))}>
                  {t('endConditionByItem')}
                </button>
              </div>
              {simConfig.endConditionType === 'lap_pos' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className={inputLabelCls}>{t('targetLap')}</span>
                    <NumberInput value={simConfig.targetLap} onChange={(v) => setSimConfig((p) => ({ ...p, targetLap: v }))} min={1} max={Infinity} narrowButtonType="plus_only" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={inputLabelCls}>{t('targetPos')}</span>
                    <NumberInput value={simConfig.targetPos} onChange={(v) => setSimConfig((p) => ({ ...p, targetPos: v }))} min={0} max={boardSize - 1} narrowButtonType="plus_only" />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1 col-span-2">
                    <span className={inputLabelCls}>{t('targetItem')}</span>
                    <IconSelect
                      value={String(simConfig.targetItemId)}
                      onChange={(v) => setSimConfig((p) => ({ ...p, targetItemId: Number(v) }))}
                      groups={[{ options: [{ value: '0', label: t('selectItem') }, ...itemTargetOptions.map((o) => ({ value: o.id, label: o.name, icon: renderItemIcon(o.type, o.id) }))] }]}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={inputLabelCls}>{t('targetAmount')}</span>
                    <NumberInput value={simConfig.targetItemAmount} onChange={(v) => setSimConfig((p) => ({ ...p, targetItemAmount: v }))} min={0} max={Infinity} narrowButtonType="plus_only" />
                  </label>
                </div>
              )}
              {goalIssue && <p className="text-xs text-red-600 dark:text-red-400">{goalIssue === 'noTargetItem' ? t('goalNoTargetItem') : t('goalTargetUnreachable')}</p>}
            </section>

            {/* Fixed dice strategy */}
            <section className="flex flex-col gap-3 border-t border-neutral-200 dark:border-neutral-700 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-base dark:text-neutral-200">{t('strategyTitle')}</h3>
                <button
                  onClick={() => setRecommendOpen((open) => !open)}
                  aria-expanded={recommendOpen}
                  className="h-8 px-3 border border-neutral-400 dark:border-neutral-600 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                >
                  {t('recommend')}
                </button>
              </div>
              {recommendOpen && (
                <div className="flex flex-col gap-3 border-y border-neutral-200 dark:border-neutral-700 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <HelpTooltip placement="top" overlay={<span className="text-xs">{t('recommendBasisHelp')}</span>} mouseEnterDelay={0.05}>
                      <span className={`${inputLabelCls} cursor-help`}>{t('recommendBasis')}</span>
                    </HelpTooltip>
                    <IconSelect
                      value={criterionValue}
                      onChange={setCriterionValue}
                      className="min-w-0 grow sm:grow-0 sm:w-64"
                      groups={[
                        { options: [{ value: 'rolls', label: t('criterionRolls') }] },
                        { label: t('criterionPerTicket'), options: tileRewardOptions.map((o) => ({ value: o.key, label: o.name, icon: renderItemIcon(o.type, o.id) })) },
                      ]}
                    />
                    <button
                      onClick={handleRecommend}
                      disabled={isRecommending || goalIssue !== null}
                      className="h-8 px-3 bg-ba-btn-yellow hover:brightness-95 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed disabled:hover:brightness-100 text-neutral-900 text-sm rounded font-semibold whitespace-nowrap"
                    >
                      {isRecommending ? t('findingOptimal') : t('recommendRun')}
                    </button>
                  </div>
                  {visibleRecommendation &&
                    (visibleRecommendation.status === 'noGain' ? (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('noGain')}</p>
                    ) : (
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="grid grid-cols-[auto_1fr_1fr] gap-x-6 gap-y-1 items-baseline text-sm dark:text-neutral-200">
                          <span />
                          <span className={inputLabelCls}>{t('myStrategy')}</span>
                          <span className={inputLabelCls}>{t('recommendedShort')}</span>
                          <span className={inputLabelCls}>{t('tilesLabel')}</span>
                          <span>{simConfig.fixedDicePriority.length === 0 ? '-' : [...simConfig.fixedDicePriority].sort((a, b) => a - b).join(', ')}</span>
                          <span className="font-bold">{[...visibleRecommendation.strategy.fixedDicePriority].sort((a, b) => a - b).join(', ')}</span>
                          <span className={inputLabelCls}>{t('doubleDiceShort')}</span>
                          <span>{allowDouble ? 'ON' : 'OFF'}</span>
                          <span className="font-bold">{visibleRecommendation.strategy.allowDoubleFixedDice ? 'ON' : 'OFF'}</span>
                          {criterion.type === 'rolls' ? (
                            <>
                              <span className={inputLabelCls}>{t('avgRolls')}</span>
                              <span>{visibleRecommendation.current.avgRolls.toFixed(1)}</span>
                              <span className="font-bold">
                                {visibleRecommendation.recommended.avgRolls.toFixed(1)} <span className="text-green-600 dark:text-green-400">({(-visibleRecommendation.gain).toFixed(1)})</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={inputLabelCls}>{t('perTicketMetric', { item: criterionItemName })}</span>
                              <span>{((visibleRecommendation.current.perTicket ?? 0) * 1000).toFixed(2)}</span>
                              <span className="font-bold">
                                {((visibleRecommendation.recommended.perTicket ?? 0) * 1000).toFixed(2)}{' '}
                                <span className="text-green-600 dark:text-green-400">(+{(visibleRecommendation.gain * 1000).toFixed(2)})</span>
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setSimConfig((p) => ({
                              ...p,
                              fixedDicePriority: visibleRecommendation.strategy.fixedDicePriority,
                              allowDoubleFixedDice: visibleRecommendation.strategy.allowDoubleFixedDice,
                            }));
                            setRecommendation(null);
                            setRecommendOpen(false);
                          }}
                          className="h-8 px-3 bg-ba-btn-yellow hover:brightness-95 text-neutral-900 text-sm rounded font-semibold whitespace-nowrap"
                        >
                          {t_ui('apply')}
                        </button>
                      </div>
                    ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex items-center gap-3 text-neutral-600 dark:text-neutral-400">
                  <span>{t('selectedTiles', { count: simConfig.fixedDicePriority.length, total: boardSize })}</span>
                  <button
                    onClick={() => setSimConfig((p) => ({ ...p, fixedDicePriority: [] }))}
                    disabled={simConfig.fixedDicePriority.length === 0}
                    className="text-blue-600 dark:text-blue-400 hover:underline disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:no-underline"
                  >
                    {t_ui('deselectAll')}
                  </button>
                </div>
                <HelpTooltip placement="top" overlay={<span className="text-xs">{t('allowDoubleFixedDiceHelp')}</span>} mouseEnterDelay={0.05}>
                  <label className="flex items-center gap-2 cursor-pointer dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={allowDouble}
                      onChange={(e) => setSimConfig((p) => ({ ...p, allowDoubleFixedDice: e.target.checked }))}
                      className="w-4 h-4 accent-ba-btn-blue-dark"
                    />
                    {t('allowDoubleFixedDice')}
                  </label>
                </HelpTooltip>
              </div>

              <DiceRaceTileGrid
                items={diceRaceData.race_node}
                renderTile={(node, index) => {
                  const isPriority = simConfig.fixedDicePriority.includes(index);
                  const isRecommended = visibleRecommendation?.status === 'improved' && visibleRecommendation.strategy.fixedDicePriority.includes(index);
                  let content: React.ReactNode = null;
                  if (node.EventContentDiceRaceNodeType === 2) {
                    content = <span className="text-base leading-none font-bold text-neutral-700 dark:text-neutral-300">+{node.MoveForwardTypeArg}</span>;
                  } else if (node.RewardParcelId && node.RewardParcelId.length > 0) {
                    const type = node.RewardParcelTypeStr?.[0] ?? '';
                    const id = node.RewardParcelId[0];
                    content = <img src={`data:image/webp;base64,${iconData[type]?.[String(id)]}`} className="w-7 h-7 object-cover" />;
                  }
                  return (
                    <button
                      onClick={() => handlePriorityToggle(index)}
                      aria-pressed={isPriority}
                      className={`relative h-full w-full flex items-center justify-center pt-3 border ${isRecommended ? 'outline-2 outline-dashed outline-ba-btn-yellow -outline-offset-2' : ''} ${isPriority ? 'bg-ba-btn-blue/15 dark:bg-ba-btn-blue/30 ring-2 ring-inset ring-ba-btn-blue border-transparent' : `${nodeFrameCls(node)} hover:brightness-95`}`}
                    >
                      <span className={`absolute left-1 top-0.5 text-[10px] leading-none font-semibold ${isPriority ? 'text-neutral-900 dark:text-neutral-100' : nodeNumberCls(node)}`}>{index}</span>
                      {content}
                    </button>
                  );
                }}
              />
            </section>

            <SimRunButton
              isRunning={isRunning}
              onClick={handleRunSimulation}
              disabled={goalIssue !== null}
              className="w-full bg-ba-btn-blue hover:bg-ba-btn-blue-dark text-neutral-900 font-bold py-2 rounded-lg text-base"
            >
              {t_planner('button.runSimulation')}
            </SimRunButton>

            {simResult && (
              <section className={`flex flex-col gap-3 border-t border-neutral-200 dark:border-neutral-700 pt-4 ${isResultStale ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base dark:text-neutral-200">{t('simResultTitle')}</h3>
                  {isResultStale && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t('simInputsChanged')}</span>}
                </div>
                <Stat label={t('avgRolls')} value={`${simResult.avgRolls.toFixed(2)} ${t('rollsUnit')}`} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-neutral-200 dark:border-neutral-700 pt-3">
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs text-neutral-500 dark:text-neutral-400">{t_ui('avgCost')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(simResult.avgCost).map(([key, amount]) => (
                        <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={12} eventData={eventData} iconData={iconData} />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs text-neutral-500 dark:text-neutral-400">{t('avgRewards')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(simResult.avgRewards)
                        .sort(([, a], [, b]) => b - a)
                        .map(([key, amount]) => (
                          <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={12} eventData={eventData} iconData={iconData} />
                        ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
};
