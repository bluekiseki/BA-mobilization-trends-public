// app/components/planner/minigame/InteractiveWorldRaidPlanner.tsx
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiEye, FiEyeOff } from 'react-icons/fi';
import { ItemIcon } from '../common/Icon';
import { getLocalizeEtcName } from '../common/locale';
import { getItemSortPriority } from '~/utils/itemSort';
import type { Locale } from '~/utils/i18n/config';
import bossData from '~/data/bossdata.json';
import { CustomNumberInput } from '~/components/CustomInput';
import type { EventData, IconData, InteractiveWorldRaidBossGroup, InteractiveWorldRaidStage, WorldRaidStageReward, Stage, StageReward } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { defaultInteractiveWorldRaidConfig, type InteractiveWorldRaidConfig, type WorldRaidBossConfig } from '~/types/minigame/interactiveWorldRaid';

export type InteractiveWorldRaidResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

interface Props {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  remainingCurrency: Record<number, number>;
  onCalculate?: (result: InteractiveWorldRaidResult) => void;
}

const DIFF_LABELS: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };
const DIFFS = [1, 2, 3, 4] as const;
const SPOILER_BOSS_GROUP_IDS = new Set([8540900, 8541000, 8541100]);
const PHASE_BOSS_IDS: number[][] = [
  [8540000], // Binah
  [], // JEHOVAH ELOHIM
  [8540100, 8540200, 8540300, 8540400, 8540500, 8540600], // Hesed ~ Hokma
  [8540700], // Yesod
  [], // Da'at
  [8540800], // Malkuth
  [8540900], // Malkuth Phase 2
  [8541000], // Deca
  [8541100], // Deca Ending
];
const PHASE_TO_SHOP_IDX = [0, 0, 1, 1, 2, 2, 2, 2, 2];
const INITIAL_ACTIVE_PHASE = 0; // phase tab selected on first render (0-indexed)
const INITIAL_REVEALED_PHASE = 5; // phases beyond this index are hidden as spoilers until user reveals them
const DAATH_NAME: Record<string, string> = { en: 'Daath', ko: '다아트', ja: 'ダアト', zh_Hant: '達阿特' };

type BattleItem = { type: 'battle'; bg: InteractiveWorldRaidBossGroup; sortId: number };
type StoryItem = { type: 'story'; bg: InteractiveWorldRaidBossGroup; storyStage: InteractiveWorldRaidStage; sortId: number };
type EventStoryItem = { type: 'event_story'; stageIndex: 0 | 1; stage: Stage; sortId: number };
type RenderItem = BattleItem | StoryItem | EventStoryItem;

function calcPyroCost(count: number, prices: number[]): number {
  let cost = 0,
    rem = count;
  for (const p of prices) {
    const n = Math.min(rem, 10);
    cost += n * p;
    rem -= n;
    if (rem <= 0) break;
  }
  return cost;
}

type BossDataMap = Record<string, { name: Record<string, string | null> }>;
function getBossName(portraitPath: string, locale: string): string {
  const filename = portraitPath.split('/').pop() ?? '';
  const key = filename.match(/_Portrait_(.+?)_Main/)?.[1] ?? filename;
  const entry = (bossData as BossDataMap)[key];
  return entry?.name[locale] || entry?.name['en'] || key;
}

function sumRewards(rewardMap: Record<string, WorldRaidStageReward[]>, groupId: number, multiplier: number, acc: Record<string, number>) {
  if (!groupId) return;
  const list = rewardMap[String(groupId)];
  if (!list) return;
  for (const r of list) {
    if (r.ClearStageRewardProb <= 0) continue;
    const key = `${r.ClearStageRewardParcelTypeStr}_${r.ClearStageRewardParcelUniqueId}`;
    acc[key] = (acc[key] ?? 0) + (r.ClearStageRewardProb / 10000) * r.ClearStageRewardAmount * multiplier;
  }
}

function sumEventStageRewards(rewards: StageReward[], acc: Record<string, number>) {
  for (const r of rewards) {
    if (r.RewardProb <= 0) continue;
    const key = `${r.RewardParcelTypeStr}_${r.RewardId}`;
    acc[key] = (acc[key] ?? 0) + (r.RewardProb / 10000) * r.RewardAmount;
  }
}

function RewardIcons({ rewards, eventData, iconData }: { rewards: Record<string, number>; eventData: EventData; iconData: IconData }) {
  const entries = Object.entries(rewards).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([key, amount]) => {
        const us = key.indexOf('_');
        return <ItemIcon key={key} type={key.slice(0, us)} itemId={key.slice(us + 1)} amount={Math.round(amount)} size={9} eventData={eventData} iconData={iconData} />;
      })}
    </div>
  );
}

export const InteractiveWorldRaidPlanner: React.FC<Props> = ({ eventId, eventData, iconData, remainingCurrency, onCalculate }) => {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'interactive_world_raid' });

  const { t: t_g } = useTranslation('game');

  const [activeTab, setActiveTab] = useState<'calc' | 'ticket'>('calc');
  const [activePhase, setActivePhase] = useState(INITIAL_ACTIVE_PHASE);
  const [maxRevealedPhase, setMaxRevealedPhase] = useState(INITIAL_REVEALED_PHASE);
  const [activeDiffByBoss, setActiveDiffByBoss] = useState<Record<number, number>>({});

  const iwrData = eventData.interactive_world_raid;
  const shopPhases = useMemo(() => eventData.shop?.['13'] ?? [], [eventData.shop]);

  const { interactiveWorldRaidConfig, setInteractiveWorldRaidConfig } = usePlanForEvent(eventId);
  const config: InteractiveWorldRaidConfig = interactiveWorldRaidConfig ?? defaultInteractiveWorldRaidConfig;

  const bossGroups = useMemo<InteractiveWorldRaidBossGroup[]>(() => {
    if (!iwrData) return [];
    return Object.values(iwrData.interactive_world_raid_boss_group).sort((a, b) => a.WorldRaidBossGroupId - b.WorldRaidBossGroupId);
  }, [iwrData]);

  const stagesByBossAndDiff = useMemo<Record<number, Record<number, InteractiveWorldRaidStage>>>(() => {
    if (!iwrData) return {};
    const r: Record<number, Record<number, InteractiveWorldRaidStage>> = {};
    for (const s of Object.values(iwrData.interactive_world_raid_stage)) {
      if (!r[s.WorldRaidBossGroupId]) r[s.WorldRaidBossGroupId] = {};
      r[s.WorldRaidBossGroupId][s.WorldRaidDifficulty] = s;
    }
    return r;
  }, [iwrData]);

  // Render items per phase sorted by stage.Id
  const phaseRenderItems = useMemo<RenderItem[][]>(() => {
    const bossById = Object.fromEntries(bossGroups.map((bg) => [bg.WorldRaidBossGroupId, bg]));
    return PHASE_BOSS_IDS.map((bossIds, phaseIdx) => {
      const items: RenderItem[] = [];
      for (const bossId of bossIds) {
        const bg = bossById[bossId];
        if (!bg) continue;
        const diffs = stagesByBossAndDiff[bossId] ?? {};
        const story = diffs[0];
        if (!bg.IsSeasonFinalBoss) {
          const ids = DIFFS.map((d) => diffs[d]?.Id).filter((id): id is number => id !== undefined);
          if (ids.length) items.push({ type: 'battle', bg, sortId: Math.min(...ids) });
        }
        if (story) items.push({ type: 'story', bg, storyStage: story, sortId: story.Id });
      }
      // Event story added
      if (phaseIdx === 1 && eventData.stage?.story?.[0]) {
        items.push({ type: 'event_story', stageIndex: 0, stage: eventData.stage.story[0], sortId: eventData.stage.story[0].Id });
      }
      if (phaseIdx === 4 && eventData.stage?.story?.[1]) {
        items.push({ type: 'event_story', stageIndex: 1, stage: eventData.stage.story[1], sortId: eventData.stage.story[1].Id });
      }
      return items.sort((a, b) => a.sortId - b.sortId);
    });
  }, [bossGroups, stagesByBossAndDiff, eventData.stage?.story]);

  useEffect(() => {
    if (bossGroups.length === 0 || config.bossConfigs.length > 0) return;
    setInteractiveWorldRaidConfig({
      ...defaultInteractiveWorldRaidConfig,
      bossConfigs: bossGroups.map((bg) => ({ bossGroupId: bg.WorldRaidBossGroupId, storyCleared: false, diffRunCounts: {}, diffExtraParties: {} })),
    });
  }, [bossGroups]);

  const getBossConfig = (id: number) => config.bossConfigs.find((c) => c.bossGroupId === id);

  const updateBossConfig = (bossGroupId: number, patch: Partial<WorldRaidBossConfig>) =>
    setInteractiveWorldRaidConfig({
      ...config,
      bossConfigs: config.bossConfigs.map((c) => (c.bossGroupId === bossGroupId ? { ...c, ...patch } : c)),
    });

  const eventStoryCleared = config.eventStoryCleared ?? [false, false];
  const updateEventStory = (i: 0 | 1, val: boolean) => {
    const next = [...eventStoryCleared] as [boolean, boolean];
    next[i] = val;
    setInteractiveWorldRaidConfig({ ...config, eventStoryCleared: next });
  };

  const updateDiffField = (bossGroupId: number, field: 'diffRunCounts' | 'diffExtraParties', diff: number, value: number) =>
    setInteractiveWorldRaidConfig({
      ...config,
      bossConfigs: config.bossConfigs.map((c) => (c.bossGroupId === bossGroupId ? { ...c, [field]: { ...c[field], [String(diff)]: Math.max(0, value) } } : c)),
    });

  const FREE_TICKETS_PER_DAY = 40; // Daily maximum based on 1 ticket per 30 mins, up to 40 for natural recharge

  const updatePeriodDays = (i: number, value: number) => {
    const days = [...(config.ticketPeriodDays ?? [0, 0, 0])] as [number, number, number];
    days[i] = Math.max(0, value);
    setInteractiveWorldRaidConfig({ ...config, ticketPeriodDays: days });
  };

  const updateDailyPurchase = (i: number, value: number) => {
    const purchase = [...(config.ticketDailyPurchase ?? [0, 0, 0])] as [number, number, number];
    purchase[i] = Math.max(0, Math.min(60, value));
    setInteractiveWorldRaidConfig({ ...config, ticketDailyPurchase: purchase });
  };

  // Current active difficulty (default D)
  const getActiveDiff = (bossGroupId: number): number => {
    const stored = activeDiffByBoss[bossGroupId];
    if (stored !== undefined) return stored;
    const diffs = stagesByBossAndDiff[bossGroupId] ?? {};
    for (const d of [4, 3, 2, 1] as const) if (diffs[d]) return d;
    return 4;
  };
  const setActiveDiff = (bossGroupId: number, diff: number) => setActiveDiffByBoss((prev) => ({ ...prev, [bossGroupId]: diff }));

  // Ticket consumption: First entry + Additional party x Re-entry cost
  const ticketsNeededByShopIdx = useMemo(() => {
    const byShop = [0, 0, 0];
    for (const bc of config.bossConfigs) {
      const phaseIdx = PHASE_BOSS_IDS.findIndex((ids) => ids.includes(bc.bossGroupId));
      if (phaseIdx < 0) continue;
      const shopIdx = PHASE_TO_SHOP_IDX[phaseIdx];
      for (const diff of DIFFS) {
        const count = bc.diffRunCounts?.[String(diff)] ?? 0;
        if (count <= 0) continue;
        const extra = bc.diffExtraParties?.[String(diff)] ?? 0;
        const stage = stagesByBossAndDiff[bc.bossGroupId]?.[diff];
        if (stage) byShop[shopIdx] += (stage.RaidEnterAmount + extra * stage.ReEnterAmount) * count;
      }
    }
    return byShop;
  }, [config.bossConfigs, stagesByBossAndDiff]);

  // Available tickets per period: Days x (Auto-recharge 40 + Daily purchase)
  const periodDays = useMemo(() => config.ticketPeriodDays ?? [0, 0, 0], [config.ticketPeriodDays]);
  const dailyPurchase = useMemo(() => config.ticketDailyPurchase ?? [0, 0, 0], [config.ticketDailyPurchase]);

  const freeTicketsByShopIdx = useMemo(() => periodDays.map((d) => d * FREE_TICKETS_PER_DAY), [periodDays]);
  const boughtTicketsByShopIdx = useMemo(() => periodDays.map((d, i) => d * dailyPurchase[i]), [periodDays, dailyPurchase]);
  const totalAvailableByShopIdx = useMemo(() => periodDays.map((d, i) => d * (FREE_TICKETS_PER_DAY + dailyPurchase[i])), [periodDays, dailyPurchase]);

  const pyroPerPhase = useMemo(
    () => periodDays.map((d, i) => d * calcPyroCost(dailyPurchase[i], shopPhases[i]?.Goods?.[0]?.ConsumeExtraAmount ?? [5, 10, 15, 25, 35, 45])),
    [periodDays, dailyPurchase, shopPhases],
  );
  const totalPyros = pyroPerPhase.reduce((s, n) => s + n, 0);
  const ownedPyros = remainingCurrency[4] ?? 0;

  // Total reward: Participation reward is (1 + additional party)x, Kill reward is 1x + Ticket purchase reward
  const totalRewards = useMemo(() => {
    if (!iwrData) return {};
    const acc: Record<string, number> = {};
    const eventStoryCleared = config.eventStoryCleared ?? [false, false];

    for (const bc of config.bossConfigs) {
      for (const diff of DIFFS) {
        const count = bc.diffRunCounts?.[String(diff)] ?? 0;
        if (count <= 0) continue;
        const extra = bc.diffExtraParties?.[String(diff)] ?? 0;
        const stage = stagesByBossAndDiff[bc.bossGroupId]?.[diff];
        if (stage) {
          sumRewards(iwrData.world_raid_stage_reward, stage.RaidBattleEndRewardGroupId, count * (1 + extra), acc);
          sumRewards(iwrData.world_raid_stage_reward, stage.RaidRewardGroupId, count, acc);
        }
      }
      if (bc.storyCleared) {
        const s = stagesByBossAndDiff[bc.bossGroupId]?.[0];
        if (s) sumRewards(iwrData.world_raid_stage_reward, s.RaidRewardGroupId, 1, acc);
      }
    }

    // Event story rewards
    (eventData.stage?.story ?? []).forEach((s, i) => {
      if (eventStoryCleared[i]) sumEventStageRewards(s.EventContentStageReward, acc);
    });

    // Total available tickets acquired (Auto-recharge + Purchase)
    for (let i = 0; i < 3; i++) {
      const totalAvailable = totalAvailableByShopIdx[i] ?? 0;
      if (totalAvailable > 0) {
        const goods = shopPhases[i]?.Goods?.[0];
        const tId = String(goods?.ParcelId?.[0] ?? 19 + i);
        const tType = goods?.ParcelTypeStr?.[0] ?? 'Currency';
        const key = `${tType}_${tId}`;
        acc[key] = (acc[key] ?? 0) + totalAvailable;
      }
    }
    return acc;
  }, [config.bossConfigs, config.eventStoryCleared, stagesByBossAndDiff, eventData.stage?.story, iwrData, totalAvailableByShopIdx, shopPhases]);

  useEffect(() => {
    if (!onCalculate) return;
    const cost: Record<string, number> = {};
    const rewards = { ...totalRewards };

    // Ticket consumption from runs
    for (let i = 0; i < 3; i++) {
      const needed = ticketsNeededByShopIdx[i] ?? 0;
      if (needed > 0) {
        const goods = shopPhases[i]?.Goods?.[0];
        const tId = String(goods?.ParcelId?.[0] ?? 19 + i);
        const tType = goods?.ParcelTypeStr?.[0] ?? 'Currency';
        const key = `${tType}_${tId}`;
        cost[key] = (cost[key] ?? 0) + needed;
      }
    }

    // Pyroxene consumption
    if (totalPyros > 0) {
      cost['Currency_4'] = (cost['Currency_4'] ?? 0) + totalPyros;
    }

    onCalculate({
      cost: Object.keys(cost).length > 0 ? cost : {},
      rewards,
    });
  }, [totalRewards, totalPyros, ticketsNeededByShopIdx, shopPhases]);

  if (!iwrData) return null;

  const rewardMap = iwrData.world_raid_stage_reward;
  const hasSpoilers = bossGroups.some((bg) => SPOILER_BOSS_GROUP_IDS.has(bg.WorldRaidBossGroupId)) || (eventData.stage?.story?.length ?? 0) >= 2;
  const totalPhasesWithData = phaseRenderItems.filter((items) => items.length > 0).length;
  const canRevealMore = hasSpoilers && maxRevealedPhase < totalPhasesWithData - 1;
  const hasTotalRewards = Object.values(totalRewards).some((v) => v > 0);

  const bossesWithStory = bossGroups.filter((bg) => stagesByBossAndDiff[bg.WorldRaidBossGroupId]?.[0]);
  const allStoriesCleared =
    bossesWithStory.length > 0 &&
    bossesWithStory.every((bg) => config.bossConfigs.find((c) => c.bossGroupId === bg.WorldRaidBossGroupId)?.storyCleared ?? false) &&
    (eventData.stage?.story ?? []).every((_, i) => config.eventStoryCleared?.[i as 0 | 1] ?? false);
  const toggleAllStories = () => {
    const newCleared = !allStoriesCleared;
    setInteractiveWorldRaidConfig({
      ...config,
      bossConfigs: config.bossConfigs.map((c) => ({ ...c, storyCleared: newCleared })),
      eventStoryCleared: [newCleared, newCleared] as [boolean, boolean],
    });
  };

  const resetAllCounts = () =>
    setInteractiveWorldRaidConfig({
      ...config,
      bossConfigs: config.bossConfigs.map((c) => ({ ...c, diffRunCounts: {}, diffExtraParties: {}, storyCleared: false })),
    });

  const visiblePhaseIndices = phaseRenderItems.map((_, idx) => idx).filter((idx) => phaseRenderItems[idx].length > 0 && idx <= maxRevealedPhase);

  // ──────────── Render Functions ────────────

  const renderBattleItem = (item: BattleItem) => {
    const { bg } = item;
    const bc = getBossConfig(bg.WorldRaidBossGroupId);
    const diffStages = stagesByBossAndDiff[bg.WorldRaidBossGroupId] ?? {};
    const bossName = getBossName(bg.WorldBossPopupPortrait, i18n.language);
    const activeDiff = getActiveDiff(bg.WorldRaidBossGroupId);
    const stage = diffStages[activeDiff];
    const count = bc?.diffRunCounts?.[String(activeDiff)] ?? 0;
    const extra = bc?.diffExtraParties?.[String(activeDiff)] ?? 0;
    const totalParties = 1 + extra;
    const ticketsPerRun = stage ? stage.RaidEnterAmount + extra * stage.ReEnterAmount : 0;

    const entryRewards: Record<string, number> = {};
    if (stage) sumRewards(rewardMap, stage.RaidBattleEndRewardGroupId, totalParties, entryRewards);
    const killRewards: Record<string, number> = {};
    if (stage) sumRewards(rewardMap, stage.RaidRewardGroupId, 1, killRewards);

    const bossPhaseIdx = PHASE_BOSS_IDS.findIndex((ids) => ids.includes(bg.WorldRaidBossGroupId));
    const bossShopIdx = PHASE_TO_SHOP_IDX[bossPhaseIdx] ?? 0;
    const bossTicketGoods = shopPhases[bossShopIdx]?.Goods?.[0];
    const bossTicketId = String(bossTicketGoods?.ParcelId?.[0] ?? 19 + bossShopIdx);
    const bossTicketType = bossTicketGoods?.ParcelTypeStr?.[0] ?? 'Currency';

    const hasEntry = Object.values(entryRewards).some((v) => v > 0);
    const hasKill = Object.values(killRewards).some((v) => v > 0);

    return (
      <div key={`battle-${bg.WorldRaidBossGroupId}`} className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-500 rounded-md p-3 space-y-2 shadow-sm">
        {/* Boss name + Difficulty tab */}
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{bossName}</p>
          <div className="flex border-b border-neutral-200 dark:border-neutral-600 flex-1">
            {DIFFS.map((diff) => {
              if (!diffStages[diff]) return null;
              const diffCount = bc?.diffRunCounts?.[String(diff)] ?? 0;
              const isActive = activeDiff === diff;
              return (
                <button
                  key={diff}
                  onClick={() => setActiveDiff(bg.WorldRaidBossGroupId, diff)}
                  className={`px-3 py-0.5 text-xs font-semibold -mb-px border-b-2 transition-colors ${
                    isActive ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                  }`}
                >
                  {DIFF_LABELS[diff]}
                  {diffCount > 0 ? `(${diffCount})` : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Input runs x number of parties */}
        {stage && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CustomNumberInput
                value={count}
                onChange={(val) => updateDiffField(bg.WorldRaidBossGroupId, 'diffRunCounts', activeDiff, val ?? 0)}
                min={0}
                max={9999}
                className="w-16 text-center text-sm py-1 rounded border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800"
              />
              <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('runs_unit')} ×</span>
              <CustomNumberInput
                value={totalParties}
                onChange={(val) => updateDiffField(bg.WorldRaidBossGroupId, 'diffExtraParties', activeDiff, Math.max(0, (val ?? 1) - 1))}
                min={1}
                max={21}
                className="w-12 text-center text-sm py-1 rounded border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800"
              />
              <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{t('total_parties')}</span>
              <span className="flex items-center gap-1 ml-auto tabular-nums shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                <ItemIcon type={bossTicketType} itemId={bossTicketId} amount={0} size={7} eventData={eventData} iconData={iconData} />×{ticketsPerRun}/{t('runs_unit')}
              </span>
            </div>

            {hasEntry && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                  {t('entry_reward')}
                  {totalParties > 1 ? ` ×${totalParties}` : ''}
                </p>
                <RewardIcons rewards={entryRewards} eventData={eventData} iconData={iconData} />
              </div>
            )}
            {hasKill && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500">{t('kill_reward')}</p>
                <RewardIcons rewards={killRewards} eventData={eventData} iconData={iconData} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderStoryItem = (item: StoryItem) => {
    const { bg, storyStage } = item;
    const bc = getBossConfig(bg.WorldRaidBossGroupId);
    const bossName = getBossName(bg.WorldBossPopupPortrait, i18n.language);
    const storyRewards: Record<string, number> = {};
    sumRewards(rewardMap, storyStage.RaidRewardGroupId, 1, storyRewards);
    const hasRewards = Object.values(storyRewards).some((v) => v > 0);
    return (
      <div key={`story-${bg.WorldRaidBossGroupId}`} className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-500 rounded-md p-3 space-y-2 shadow-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={bc?.storyCleared ?? false}
            onChange={(e) => updateBossConfig(bg.WorldRaidBossGroupId, { storyCleared: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 accent-blue-500"
          />
          <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200">{bossName}</span>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t_g('story')}</span>
        </label>
        {hasRewards && <RewardIcons rewards={storyRewards} eventData={eventData} iconData={iconData} />}
      </div>
    );
  };

  const renderEventStoryItem = (item: EventStoryItem) => {
    const name = item.stageIndex === 0 ? 'JEHOVAH ELOHIM' : (DAATH_NAME[i18n.language] ?? 'Daath');
    const rewards: Record<string, number> = {};
    sumEventStageRewards(item.stage.EventContentStageReward, rewards);
    const hasRewards = Object.values(rewards).some((v) => v > 0);
    return (
      <div key={`event_story-${item.stageIndex}`} className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-500 rounded-md p-3 space-y-2 shadow-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={eventStoryCleared[item.stageIndex]}
            onChange={(e) => updateEventStory(item.stageIndex, e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 accent-blue-500"
          />
          <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200">{name}</span>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t_g('story')}</span>
        </label>
        {hasRewards && <RewardIcons rewards={rewards} eventData={eventData} iconData={iconData} />}
      </div>
    );
  };

  // ──────────── Current Phase Information ────────────
  const shopIdx = PHASE_TO_SHOP_IDX[activePhase];
  const shopPhase = shopPhases[shopIdx];
  const ticketGoods = shopPhase?.Goods?.[0];
  const ticketId = String(ticketGoods?.ParcelId?.[0] ?? 19 + shopIdx);
  const ticketTypeStr = ticketGoods?.ParcelTypeStr?.[0] ?? 'Currency';
  const phaseNeeded = ticketsNeededByShopIdx[shopIdx];
  const phaseAvailable = totalAvailableByShopIdx[shopIdx] ?? 0;
  const phaseDays = periodDays[shopIdx] ?? 0;
  const phaseShort = phaseDays > 0 && phaseNeeded > phaseAvailable;

  const tabs = [
    { id: 'calc' as const, label: t('tab_calculator') },
    { id: 'ticket' as const, label: t('tab_ticket') },
  ];

  return (
    <div className="">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')} (BETA)</h2>
      </div>

      <div className="space-y-4">
        {/* Main tab */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${
                activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-neutral-500 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Run Settings Tab ── */}
        {activeTab === 'calc' && (
          <div className="space-y-3 animate-fadeIn">
            {/* Phase tab + Controls */}
            <div className="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-700 flex-wrap">
              {/* Phase tab (visible phases only) */}
              {visiblePhaseIndices.map((phaseIdx) => {
                const pShopIdx = PHASE_TO_SHOP_IDX[phaseIdx];
                const pNeeded = ticketsNeededByShopIdx[pShopIdx];
                const pAvailable = totalAvailableByShopIdx[pShopIdx] ?? 0;
                const pDays = periodDays[pShopIdx] ?? 0;
                return (
                  <button
                    key={phaseIdx}
                    onClick={() => setActivePhase(phaseIdx)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold -mb-px border-b-2 transition-colors ${
                      activePhase === phaseIdx
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
                  >
                    {t('phase', { n: phaseIdx + 1 })}
                    {pDays > 0 && pNeeded > pAvailable && <FiAlertTriangle size={10} className="text-red-400" />}
                  </button>
                );
              })}

              {/* Spoiler button: Inline on the left of the tab row */}
              {canRevealMore && (
                <button
                  onClick={() => {
                    const next = maxRevealedPhase + 1;
                    setMaxRevealedPhase(next);
                    setActivePhase(next);
                  }}
                  title={t('show_spoiler')}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs -mb-px border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                >
                  <FiEye size={13} />
                </button>
              )}
              {maxRevealedPhase > INITIAL_REVEALED_PHASE && (
                <button
                  onClick={() => {
                    setMaxRevealedPhase(INITIAL_REVEALED_PHASE);
                    setActivePhase(INITIAL_ACTIVE_PHASE);
                  }}
                  title={t('hide_spoiler')}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs -mb-px border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                >
                  <FiEyeOff size={13} />
                </button>
              )}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1.5 pb-1">
              <button onClick={toggleAllStories} className="text-xs px-2 py-1 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 dark:text-neutral-400 font-semibold">
                {allStoriesCleared ? t('deselect_all_stories') : t('select_all_stories')}
              </button>
              <button onClick={resetAllCounts} className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 dark:text-red-400 font-semibold">
                {t('reset_all')}
              </button>
            </div>

            {/* Current phase ticket summary */}
            {phaseNeeded > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <ItemIcon type={ticketTypeStr} itemId={ticketId} amount={0} size={7} eventData={eventData} iconData={iconData} />
                <span className={`tabular-nums flex items-center gap-1 font-semibold ${phaseShort ? 'text-red-500' : 'text-neutral-500 dark:text-neutral-400'}`}>
                  {phaseShort && <FiAlertTriangle size={11} />}
                  {t('total_tickets_needed')}: {phaseNeeded}
                </span>
                {phaseDays > 0 && (
                  <span className="text-neutral-400 dark:text-neutral-500 flex items-center gap-1">
                    / {t('available')}:
                    <ItemIcon type={ticketTypeStr} itemId={ticketId} amount={0} size={7} eventData={eventData} iconData={iconData} />×{phaseAvailable}
                  </span>
                )}
              </div>
            )}

            {/* Boss list */}
            <div className="space-y-3">
              {(phaseRenderItems[activePhase] ?? []).map((item) => {
                if (item.type === 'event_story') {
                  return <div key={`event_story-${item.stageIndex}`}>{renderEventStoryItem(item)}</div>;
                }
                const bgId = item.bg.WorldRaidBossGroupId;
                return <div key={item.type === 'battle' ? `b-${bgId}` : `s-${bgId}`}>{item.type === 'battle' ? renderBattleItem(item) : renderStoryItem(item)}</div>;
              })}
            </div>
          </div>
        )}

        {/* ── Ticket Purchase Tab ── */}
        {activeTab === 'ticket' && (
          <div className="space-y-4 animate-fadeIn text-sm">
            {/* Owned Pyroxenes */}
            <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300">
              <div className="flex items-center gap-1.5">
                <ItemIcon type="Currency" itemId="4" amount={0} size={9} eventData={eventData} iconData={iconData} />
                <span>{t('owned_pyros')}</span>
              </div>
              <span className="font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{ownedPyros.toLocaleString()}</span>
            </div>

            {/* Auto-recharge info */}
            <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('ticket_auto_recharge_note')}</p>

            {/* Period settings */}
            <div className="space-y-3">
              {shopPhases.map((phase, i) => {
                const goods = phase.Goods?.[0];
                const tId = goods?.ParcelId?.[0] ?? 19 + i;
                const tType = goods?.ParcelTypeStr?.[0] ?? 'Currency';
                const days = periodDays[i] ?? 0;
                const purchase = dailyPurchase[i] ?? 0;
                const pyroCostPerDay = calcPyroCost(purchase, goods?.ConsumeExtraAmount ?? [5, 10, 15, 25, 35, 45]);
                const pyroCostTotal = pyroPerPhase[i] ?? 0;
                const freeTix = freeTicketsByShopIdx[i] ?? 0;
                const boughtTix = boughtTicketsByShopIdx[i] ?? 0;
                const totalTix = totalAvailableByShopIdx[i] ?? 0;
                const needed = ticketsNeededByShopIdx[i] ?? 0;
                const isShort = days > 0 && needed > totalTix;

                const ticketInfo = eventData.icons.Currency?.[String(tId)];
                const ticketName = getLocalizeEtcName(ticketInfo?.LocalizeEtc, i18n.language as Locale) ?? t('ticket_phase_n', { n: i + 1 });

                return (
                  <div key={i} className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-500 rounded-md p-3 shadow-sm space-y-2">
                    {/* Header: Ticket icon + Name + Required tickets */}
                    <div className="flex items-center gap-2">
                      <ItemIcon type={tType} itemId={String(tId)} amount={0} size={9} eventData={eventData} iconData={iconData} />
                      <span className="font-semibold text-neutral-800 dark:text-neutral-100">{ticketName}</span>
                      {needed > 0 && (
                        <span className={`ml-auto text-xs tabular-nums flex items-center gap-1 ${isShort ? 'text-red-500 font-semibold' : 'text-neutral-400'}`}>
                          {isShort && <FiAlertTriangle size={11} />}
                          {t('total_tickets_needed')}: {needed}
                        </span>
                      )}
                    </div>

                    {/* Period days */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 w-20 shrink-0">{t('period_days')}</span>
                      <CustomNumberInput
                        value={days}
                        onChange={(val) => updatePeriodDays(i, val ?? 0)}
                        min={0}
                        max={60}
                        className="w-16 text-center rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 py-0.5 text-sm"
                      />
                      <span className="text-xs text-neutral-400">{t('days_unit')}</span>
                      {days > 0 && (
                        <span className="text-xs text-neutral-400 ml-auto tabular-nums">
                          {t('auto_recharge')}: ~{freeTix.toLocaleString()} {t('ticket_unit')}
                        </span>
                      )}
                    </div>

                    {/* Daily purchase count */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 w-20 shrink-0">{t('daily_purchase')}</span>
                      <CustomNumberInput
                        value={purchase}
                        onChange={(val) => updateDailyPurchase(i, val ?? 0)}
                        min={0}
                        max={60}
                        className="w-16 text-center rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 py-0.5 text-sm"
                      />
                      <button
                        onClick={() => updateDailyPurchase(i, 60)}
                        className="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300"
                      >
                        MAX
                      </button>
                      {pyroCostPerDay > 0 && (
                        <span className="text-xs text-neutral-400 ml-auto tabular-nums">
                          {pyroCostPerDay.toLocaleString()} {t_g('pyro_unit')}/{t('days_unit')}
                        </span>
                      )}
                    </div>

                    {/* Total (only if days are set) */}
                    {days > 0 && (
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-100 dark:border-neutral-700 text-xs tabular-nums">
                        <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                          {t('available')}:
                          <ItemIcon type={tType} itemId={String(tId)} amount={0} size={7} eventData={eventData} iconData={iconData} />
                          {freeTix.toLocaleString()} + {boughtTix.toLocaleString()} =
                          <span className={`font-bold ${isShort ? 'text-red-500' : 'text-neutral-800 dark:text-neutral-100'}`}>{totalTix.toLocaleString()}</span>
                        </span>
                        {pyroCostTotal > 0 && (
                          <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                            <ItemIcon type="Currency" itemId="4" amount={0} size={7} eventData={eventData} iconData={iconData} />
                            <span className="font-bold text-neutral-800 dark:text-neutral-100">{pyroCostTotal.toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Grand total */}
            {totalPyros > 0 && (
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
                <div className="flex justify-between font-semibold tabular-nums text-sm">
                  <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
                    <ItemIcon type="Currency" itemId="4" amount={0} size={9} eventData={eventData} iconData={iconData} />
                    <span>{t('total_pyro')}</span>
                  </div>
                  <span className={totalPyros > ownedPyros ? 'text-red-500' : 'text-neutral-900 dark:text-neutral-100'}>
                    {totalPyros.toLocaleString()}
                    <span className="text-xs text-neutral-400 font-normal ml-1">/ {ownedPyros.toLocaleString()}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ──────────── Common Section (Outside tabs) ──────────── */}
        {/* Estimated total acquired */}
        {hasTotalRewards && (
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 mb-2">{t('total_rewards')}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(totalRewards)
                .filter(([, v]) => v > 0)
                .sort(([keyA], [keyB]) => {
                  const prioA = getItemSortPriority(keyA, eventData);
                  const prioB = getItemSortPriority(keyB, eventData);
                  return prioA - prioB;
                })
                .map(([key, amount]) => {
                  const us = key.indexOf('_');
                  return <ItemIcon key={key} type={key.slice(0, us)} itemId={key.slice(us + 1)} amount={Math.round(amount)} size={12} eventData={eventData} iconData={iconData} />;
                })}
            </div>
          </div>
        )}

        {/* Estimated total consumed */}
        {(ticketsNeededByShopIdx.some((n) => n > 0) || totalPyros > 0) && (
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 mb-2">{t('total_cost')}</p>
            <div className="flex flex-wrap gap-2">
              {[
                ...shopPhases.map((phase, i) => {
                  const needed = ticketsNeededByShopIdx[i] ?? 0;
                  if (needed <= 0) return null;
                  const goods = phase.Goods?.[0];
                  const tId = String(goods?.ParcelId?.[0] ?? 19 + i);
                  const tType = goods?.ParcelTypeStr?.[0] ?? 'Currency';
                  return [tType, tId, needed] as [string, string, number];
                }),
                totalPyros > 0 ? (['Currency', '4', totalPyros] as [string, string, number]) : null,
              ]
                .filter((item): item is [string, string, number] => item !== null)
                .sort(([typeA, idA], [typeB, idB]) => {
                  const keyA = `${typeA}_${idA}`;
                  const keyB = `${typeB}_${idB}`;
                  return getItemSortPriority(keyA, eventData) - getItemSortPriority(keyB, eventData);
                })
                .map(([type, id, amount]) => (
                  <ItemIcon key={`${type}_${id}`} type={type} itemId={id} amount={amount} size={12} eventData={eventData} iconData={iconData} />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
