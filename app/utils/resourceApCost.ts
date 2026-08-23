// Resolves AP cost per resource unit. Extract* functions (per-source) + Dijkstra resolution.
// See project memory `project_resource_efficiency_tab` for correctness rules.
import type { EventData, Stage, StageReward, MinigameDefenseStage, MinigameJankenStage } from '~/types/plannerData';
import { runSimulation as runDiceRaceSimulation } from '~/components/planner/minigame/DiceRacePlanner';
import { runSingleSimulation as runTreasureSimulation } from '~/components/planner/minigame/TreasurePlanner';
import { simulateAverageFlips } from '~/components/planner/minigame/CardMatchPlanner';
import { runSimulation as runFortuneGachaSimulation } from '~/components/planner/minigame/FortuneGachaPlanner';
import { buildRoundInfos as buildRoadPuzzleRoundInfos, simulateRoadPuzzleMapDraws } from '~/components/planner/minigame/RoadPuzzlePlanner';
import { calculateExpectedContents } from '~/components/planner/common/gachaIcon';
import { DefaultDiceRaceSimConfig } from '~/types/minigame/diceRace';
import { getStageCost } from '~/types/minigame/fieldEvent';
import type { TotalBonusMap } from '~/components/planner/BonusSelector';
import { solveRoadPuzzle } from '~/utils/solveRoadPuzzle';
import { ROAD_PUZZLE_MAPS } from '~/data/roadPuzzleMaps';
import { applyRepeatableEventBonus } from '~/utils/eventBonus';

const REPEATABLE_TAGS = new Set(['Event', 'Default', 'Rare']);
const AP = 'AP'; // sentinel currency key: raw AP itself.
const keyOf = (type: string, id: number) => `${type}_${id}`;

// Trailing stage number from a raw internal `Name` codename (e.g. "EVENT_845_Normal_MainGround_Stage02"
// -> "02"), matching the exact idiom RepeatableTab.tsx/OnetimeTab.tsx/MissionPlanner.tsx already use.
const stageNumberFromName = (name: string): string => name.split('_').pop()?.replace('Stage', '') || name;

export type StageWithType = Stage & { type: 'stage' | 'story' | 'challenge' };

export interface Ctx {
  allStages: StageWithType[];
  eventData: EventData;
  eventId: number;
  totalBonus?: TotalBonusMap;
  // Gates Monte-Carlo extractors (expensive: 1.5-3s+ per event); UI opts in explicitly, not auto on mount.
  includeSimulations?: boolean;
}

// ---------------------------------------------------------------------------
// Every extractor uses SourceRef (raw fields); only formatSourceLabel converts to display text (called once at end).
// ---------------------------------------------------------------------------

// Collapse enter-cost sources to one shape; category picks prefix, stageNumber is parsed from raw Name.
type StageLikeCategory = 'stage' | 'story' | 'challenge' | 'minigame_defense' | 'janken_story' | 'janken_normal' | 'janken_challenge';

export type SourceRef =
  // `oneTimeClear` covers FirstClear and ThreeStar: both one-time, same AP cost, tracked as one bucket.
  | { type: 'stage_like'; category: StageLikeCategory; stageNumber?: string; oneTimeClear?: boolean }
  // Sequenced family prefix spans multiple categories (story gates regular-stage access); list each category's range.
  | { type: 'sequenced_prefix_bulk'; ranges: { category: StageLikeCategory; from: number; to: number }[] }
  | { type: 'minigame_janken_score'; score: number }
  | { type: 'shop_unlimited'; shopId: string }
  | { type: 'shop_flat_limit'; shopId: string; limit: number }
  | { type: 'shop_tier'; shopId: string; tier: number }
  | { type: 'card_shop_round'; round: number }
  | { type: 'box_gacha_round'; round: number; repeat?: boolean }
  | { type: 'interactive_world_raid' }
  | { type: 'minigame_ccg_point'; point: number }
  | { type: 'clue_search_round'; round: number }
  | { type: 'clue_search_clue'; round: number; clueId: number }
  | { type: 'road_puzzle_round'; round: number; additional?: boolean }
  | { type: 'road_puzzle_rail_set' }
  | { type: 'dice_race' }
  | { type: 'treasure' }
  | { type: 'concentration' }
  | { type: 'minigame_dream' }
  | { type: 'fortune_gacha' }
  | { type: 'mission'; category: 'mission' | 'minigame_mission'; daily?: boolean; days?: number }
  | { type: 'field_quest'; daily?: boolean; days?: number }
  | { type: 'field_mastery'; level: number }
  | { type: 'field_stage'; index: number; oneTimeClear?: boolean };

type StageLikeSourceRef = Extract<SourceRef, { type: 'stage_like' }>;

const STAGE_LIKE_PREFIX: Record<StageLikeCategory, string> = {
  stage: 'common.stage',
  story: 'ui:story',
  challenge: 'common.challenge',
  minigame_defense: 'minigame.minigame_defense',
  janken_story: 'ui:story',
  janken_normal: 'ui:normal',
  janken_challenge: 'common.challenge',
};

// Format raw stage Name to parsed trailing number (same convention as RepeatableTab.tsx/OnetimeTab.tsx).
export interface SourceLabelKey {
  parts: Array<{ type: 'key' | 'text'; value: string }>;
  params?: Record<string, string | number>;
}

function formatSourceLabel(source: SourceRef): SourceLabelKey {
  switch (source.type) {
    case 'stage_like': {
      const baseKey = STAGE_LIKE_PREFIX[source.category];
      const parts: Array<{ type: 'key' | 'text'; value: string }> = [{ type: 'key', value: baseKey }];
      if (source.stageNumber) {
        parts.push({ type: 'text', value: ` {{stageNumber}}` });
      }
      if (source.oneTimeClear) {
        parts.push({ type: 'text', value: ' ' }, { type: 'key', value: 'ui.oneTimeReward' });
      }
      return { parts, params: source.stageNumber ? { stageNumber: source.stageNumber } : undefined };
    }
    case 'sequenced_prefix_bulk': {
      const parts: Array<{ type: 'key' | 'text'; value: string }> = [];
      source.ranges.forEach((r, i) => {
        if (i > 0) parts.push({ type: 'text', value: ' + ' });
        parts.push({ type: 'key', value: STAGE_LIKE_PREFIX[r.category] });
        parts.push({ type: 'text', value: r.from === r.to ? ` {{n${i}}}` : ` {{n${i}}}-{{m${i}}}` });
      });
      // Use literal "(cleared once each)" to disambiguate multi-stage ranges (not shared translation key).
      parts.push({ type: 'text', value: ' (cleared once each)' });
      const params: Record<string, string | number> = {};
      source.ranges.forEach((r, i) => {
        params[`n${i}`] = r.from;
        if (r.from !== r.to) params[`m${i}`] = r.to;
      });
      return { parts, params };
    }
    case 'minigame_janken_score':
      return {
        parts: [
          { type: 'key', value: 'minigame.minigame_janken' },
          { type: 'text', value: ' ' },
          { type: 'key', value: 'label.cumulativeRewards' },
          { type: 'text', value: ' {{score}}' },
        ],
        params: { score: source.score.toLocaleString() },
      };
    case 'shop_unlimited':
      return {
        parts: [
          { type: 'key', value: 'common.shop' },
          { type: 'text', value: ' ({{shopId}}) unlimited purchase' },
        ],
        params: { shopId: source.shopId },
      };
    case 'shop_flat_limit':
      return {
        parts: [
          { type: 'key', value: 'common.shop' },
          { type: 'text', value: ' ({{shopId}}) up to {{limit}}x' },
        ],
        params: { shopId: source.shopId, limit: source.limit },
      };
    case 'shop_tier':
      return {
        parts: [
          { type: 'key', value: 'common.shop' },
          { type: 'text', value: ' ({{shopId}}) tier {{tier}}' },
        ],
        params: { shopId: source.shopId, tier: source.tier },
      };
    case 'card_shop_round':
      return {
        parts: [
          { type: 'key', value: 'cardShop.title' },
          { type: 'text', value: ' round {{round}}' },
        ],
        params: { round: source.round },
      };
    case 'box_gacha_round':
      return {
        parts: [
          { type: 'key', value: 'box_gacha.title' },
          { type: 'text', value: source.repeat ? ' round {{round}} (repeat)' : ' round {{round}}' },
        ],
        params: { round: source.round },
      };
    case 'interactive_world_raid':
      return {
        parts: [
          { type: 'key', value: 'interactive_world_raid.title' },
          { type: 'text', value: ' (daily free ticket regen not modeled)' },
        ],
      };
    case 'minigame_ccg_point':
      return {
        parts: [
          { type: 'key', value: 'minigame_ccg.title' },
          { type: 'text', value: ' point {{point}}' },
        ],
        params: { point: source.point },
      };
    case 'clue_search_round':
      return {
        parts: [
          { type: 'key', value: 'clue_search.title' },
          { type: 'text', value: ' round {{round}} completion reward' },
        ],
        params: { round: source.round },
      };
    case 'clue_search_clue':
      return {
        parts: [
          { type: 'key', value: 'clue_search.title' },
          { type: 'text', value: ' round {{round}} clue {{clueId}}' },
        ],
        params: { round: source.round, clueId: source.clueId },
      };
    case 'road_puzzle_round':
      return {
        parts: [
          { type: 'key', value: 'road_puzzle.title' },
          { type: 'text', value: source.additional ? ' round {{round}} additional reward' : ' round {{round}}' },
        ],
        params: { round: source.round },
      };
    case 'road_puzzle_rail_set':
      return {
        parts: [
          { type: 'key', value: 'road_puzzle.title' },
          { type: 'text', value: ' rail set completion reward' },
        ],
      };
    case 'dice_race':
      return {
        parts: [
          { type: 'key', value: 'dice_race.title' },
          { type: 'text', value: ' (simulation average approximation)' },
        ],
      };
    case 'treasure':
      return {
        parts: [
          { type: 'key', value: 'treasure.title' },
          { type: 'text', value: ' (assumes full clear, simulation approximation)' },
        ],
      };
    case 'concentration':
      return {
        parts: [
          { type: 'key', value: 'cardmatch.page.cardMatchSimulator' },
          { type: 'text', value: ' (simulation average approximation)' },
        ],
      };
    case 'minigame_dream':
      return {
        parts: [
          { type: 'key', value: 'dream_maker.title' },
          { type: 'text', value: ' (ending-probability simulation approximation)' },
        ],
      };
    case 'fortune_gacha':
      return {
        parts: [
          { type: 'key', value: 'fortune_gacha.title' },
          { type: 'text', value: ' (simulation average, pity system approximation)' },
        ],
      };
    case 'mission': {
      const isMinigame = source.category === 'minigame_mission';
      const missionKey = isMinigame ? 'minigame_mission' : 'mission';
      if (source.daily && source.days !== undefined) {
        return {
          parts: [
            { type: 'key', value: missionKey },
            { type: 'text', value: ' reward (daily x {{days}} days)' },
          ],
          params: { days: source.days },
        };
      }
      return {
        parts: [
          { type: 'key', value: missionKey },
          { type: 'text', value: ' reward' },
        ],
      };
    }
    case 'field_quest':
      return source.daily && source.days !== undefined
        ? {
            parts: [
              { type: 'key', value: 'field_event.title' },
              { type: 'text', value: ' (daily x {{days}} days)' },
            ],
            params: { days: source.days },
          }
        : {
            parts: [
              { type: 'key', value: 'field_event.title' },
              { type: 'text', value: '' },
            ],
          };
    case 'field_mastery':
      return {
        parts: [
          { type: 'key', value: 'field_event.title' },
          { type: 'text', value: ' Mastery Level {{level}}' },
        ],
        params: { level: source.level },
      };
    case 'field_stage': {
      const index = source.index + 1;
      return {
        parts: [
          { type: 'key', value: 'field_event.title' },
          { type: 'text', value: source.oneTimeClear ? ' Stage {{index}} One-time Reward' : ' Stage {{index}}' },
        ],
        params: { index },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Public shapes (what the UI consumes) — unchanged from before this refactor.
// ---------------------------------------------------------------------------

export interface ApSegment {
  apCost: number;
  amount: number;
  source: SourceRef;
  sourceLabel: SourceLabelKey;
  repeatsForever?: boolean;
  isApproximated?: boolean;
  // See RawSegment.firstRunBonusAmount — a one-time bonus of this same resource bundled into this
  // segment's first run, at no extra AP cost.
  firstRunBonusAmount?: number;
}

export interface OneTimeContribution {
  amount: number;
  apCost?: number;
  source: SourceRef;
  sourceLabel: SourceLabelKey;
}

export interface ResourceApProfile {
  key: string;
  segments: ApSegment[];
  oneTimeContributions: OneTimeContribution[];
}

// ---------------------------------------------------------------------------
// Raw extraction shapes — cost is NOT resolved to AP yet, just declared.
// ---------------------------------------------------------------------------

interface RawSegment {
  costKey: string;
  costAmount: number;
  producesKey: string;
  amount: number;
  source: SourceRef;
  repeatsForever?: boolean;
  isApproximated?: boolean;
  // Extra one-time amount of this same producesKey granted alongside the segment's first run (e.g. a stage's
  // FirstClear bonus for a resource it also drops repeatably) — folded in here since it costs no extra AP.
  firstRunBonusAmount?: number;
}

interface RawOneTime {
  producesKey: string;
  amount: number;
  costKey?: string; // undefined = free / AP-cost genuinely undetermined (missions, score ladders, etc.)
  costAmount?: number;
  source: SourceRef;
}

interface Extracted {
  segments: RawSegment[];
  oneTime: RawOneTime[];
}

function merge(...parts: Extracted[]): Extracted {
  return { segments: parts.flatMap((p) => p.segments), oneTime: parts.flatMap((p) => p.oneTime) };
}

// GachaGroup rewards are opaque boxes — reuse Icon.tsx's expected-value decomposition (calculateExpectedContents)
// so a box chains into the resource graph as its real contents instead of an unusable GachaGroup_* key.
function expandGachaGroupReward(producesKey: string, amount: number, eventData: EventData): { producesKey: string; amount: number }[] {
  if (!producesKey.startsWith('GachaGroup_') || amount <= 0) return [{ producesKey, amount }];
  const groupId = producesKey.slice('GachaGroup_'.length);
  const contents = calculateExpectedContents(groupId, amount, eventData.icons, {}, 'en');
  return Object.values(contents)
    .filter((c) => c.expectedAmount > 0)
    .map((c) => ({ producesKey: keyOf(c.type, Number(c.id)), amount: c.expectedAmount }));
}

// Decompose GachaGroup boxes and re-merge by producesKey to sum duplicate same-cost rows.
function expandGachaGroupRewards(rewards: { producesKey: string; amount: number }[], eventData: EventData): { producesKey: string; amount: number }[] {
  const merged = new Map<string, number>();
  for (const r of rewards) {
    for (const expanded of expandGachaGroupReward(r.producesKey, r.amount, eventData)) {
      merged.set(expanded.producesKey, (merged.get(expanded.producesKey) ?? 0) + expanded.amount);
    }
  }
  return [...merged].map(([producesKey, amount]) => ({ producesKey, amount }));
}

// Convert parallel ParcelId/ParcelTypeStr/ParcelAmount arrays to {producesKey, amount} pairs, decomposing GachaGroup boxes.
function parcelRewards(ids: number[], types: string[], amounts: number[], eventData: EventData): { producesKey: string; amount: number }[] {
  return expandGachaGroupRewards(
    ids.map((id, i) => ({ producesKey: keyOf(types[i], id), amount: amounts[i] })),
    eventData,
  );
}

// Pushes one segment per {producesKey, amount} pair sharing the same (costKey, costAmount) — the shared
// pattern used by every round/tier-based source.
function emitSegments(
  segments: RawSegment[],
  costKey: string,
  costAmount: number,
  rewards: { producesKey: string; amount: number }[],
  source: SourceRef,
  extra?: Pick<RawSegment, 'repeatsForever' | 'isApproximated'>,
): void {
  if (costAmount <= 0) return;
  for (const { producesKey, amount } of rewards) {
    if (amount > 0) segments.push({ costKey, costAmount, producesKey, amount, source, ...extra });
  }
}

// Event's total day count (open -> close/extension) — used to project daily-repeating rewards
// (daily missions/quests) over the full event, mirroring MissionPlanner.tsx's `durationDays` idea.
export function getEventDurationDays(ctx: Ctx): number {
  const season = ctx.eventData.season;
  const closeTime = season?.EventContentCloseTime || season?.ExtensionTime;
  if (!season?.EventContentOpenTime || !closeTime) return 1;
  return Math.max(1, Math.round((new Date(closeTime).getTime() - new Date(season.EventContentOpenTime).getTime()) / 86400000));
}

// Stage-shaped sources: regular, defense, and janken with FirstClear-vs-repeatable split.

function extractStageLike(entries: { source: StageLikeSourceRef; costKey: string; costAmount: number; rewards: StageReward[]; bonusEligible?: boolean }[], ctx: Ctx): Extracted {
  const segments: RawSegment[] = [];
  const oneTime: RawOneTime[] = [];
  const eventCurrencyIds = new Set(ctx.eventData.currency?.map((c) => c.ItemUniqueId) ?? []);
  for (const entry of entries) {
    if (entry.costAmount <= 0) continue;
    // Group same-target rewards by key and sum (paid by single run's cost, not separate routes).
    const repeatableByKey = new Map<string, number>();
    const oneTimeClearByKey = new Map<string, number>();
    for (const r of entry.rewards) {
      const rawKey = keyOf(r.RewardParcelTypeStr, r.RewardId);
      let amount = r.RewardAmount * (r.RewardProb / 10000);
      const isRepeatable = REPEATABLE_TAGS.has(r.RewardTagStr);
      // Event bonus only boosts repeatable-tag farming stages (mirrors FarmingPlanner.tsx eligibility).
      if (isRepeatable && entry.bonusEligible && eventCurrencyIds.has(r.RewardId)) {
        const bonusPercent = ctx.totalBonus?.[r.RewardId] || 0;
        amount = applyRepeatableEventBonus(amount, bonusPercent);
      }
      const targetMap = isRepeatable ? repeatableByKey : oneTimeClearByKey;
      for (const { producesKey, amount: expandedAmount } of expandGachaGroupReward(rawKey, amount, ctx.eventData)) {
        targetMap.set(producesKey, (targetMap.get(producesKey) ?? 0) + expandedAmount);
      }
    }
    for (const [producesKey, amount] of repeatableByKey) {
      if (amount <= 0) continue;
      // If FirstClear/ThreeStar rows also grant this resource, it comes free with this segment's first run —
      // folded in here instead of emitted as a separate RawOneTime, to avoid double-charging AP.
      const firstRunBonusAmount = oneTimeClearByKey.get(producesKey);
      if (firstRunBonusAmount !== undefined) oneTimeClearByKey.delete(producesKey);
      segments.push({ costKey: entry.costKey, costAmount: entry.costAmount, producesKey, amount, source: entry.source, repeatsForever: true, firstRunBonusAmount });
    }
    for (const [producesKey, amount] of oneTimeClearByKey) {
      if (amount > 0) oneTime.push({ producesKey, amount, costKey: entry.costKey, costAmount: entry.costAmount, source: { ...entry.source, oneTimeClear: true } });
    }
  }
  return { segments, oneTime };
}

function extractStage(ctx: Ctx): Extracted {
  const entries = ctx.allStages.map((s) => ({
    source: { type: 'stage_like' as const, category: s.type, stageNumber: stageNumberFromName(s.Name) },
    costKey: AP,
    costAmount: s.StageEnterCostAmount,
    rewards: s.EventContentStageReward,
    bonusEligible: s.type === 'stage',
  }));
  return extractStageLike(entries, ctx);
}

// minigame_defense reuses Stage reward shape; entry cost is global currency, not per-stage fields.
function extractMinigameDefense(ctx: Ctx): Extracted {
  const defense = ctx.eventData.minigame_defense;
  if (!defense || defense.info.length === 0) return { segments: [], oneTime: [] };
  const info = defense.info[0];
  const costKey = keyOf(info.DefenseBattleParcelTypeStr, info.DefenseBattleParcelId);
  const entries = defense.stage.map((s: MinigameDefenseStage) => ({
    source: { type: 'stage_like' as const, category: 'minigame_defense' as const, stageNumber: stageNumberFromName(s.Name) },
    costKey,
    costAmount: s.StageEnterCostAmount,
    rewards: s.EventContentStageReward,
  }));
  return extractStageLike(entries, ctx);
}

// minigame_janken stages: same FirstClear-vs-repeatable split as regular stages, entry cost from
// info.CostParcelId/CostParcelTypeStr. Score-ladder has no formula, so treated as undetermined-cost one-time.
function extractMinigameJanken(ctx: Ctx): Extracted {
  const janken = ctx.eventData.minigame_janken;
  if (!janken || janken.info.length === 0) return { segments: [], oneTime: [] };
  const info = janken.info[0];
  const costKey = keyOf(info.CostParcelTypeStr, info.CostParcelId);
  const entries = janken.stage
    .filter((s: MinigameJankenStage) => s.EventContentStageReward)
    .map((s: MinigameJankenStage) => {
      // Challenge stages aren't numbered by the game itself — only Story/Normal carry a meaningful StageNumber.
      const category = s.JankenStageType === 3 ? ('janken_challenge' as const) : s.JankenStageType === 1 ? ('janken_story' as const) : ('janken_normal' as const);
      const stageNumber = s.JankenStageType === 3 ? undefined : String(s.StageNumber);
      return { source: { type: 'stage_like' as const, category, stageNumber }, costKey, costAmount: s.StageEnterCostAmount, rewards: s.EventContentStageReward as StageReward[] };
    });
  const result = extractStageLike(entries, ctx);
  for (const scoreRow of janken.reward_score) {
    for (let i = 0; i < scoreRow.ScoreRewardId.length; i++) {
      const rewardItem = janken.reward_score_item.find((it) => it.Id === scoreRow.ScoreRewardId[i]);
      if (!rewardItem) continue;
      rewardItem.ParcelUniqueId.forEach((pid, idx) => {
        if (rewardItem.Amount[idx] <= 0) return;
        result.oneTime.push({ producesKey: keyOf(rewardItem.ParcelTypeStr[idx], pid), amount: rewardItem.Amount[idx], source: { type: 'minigame_janken_score', score: scoreRow.StackedScore[i] } });
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extraction: shop (tiered pricing), card_shop (exact expectation), box_gacha (deterministic rounds).
// ---------------------------------------------------------------------------

function extractShop(ctx: Ctx): Extracted {
  const shop = ctx.eventData.shop;
  if (!shop) return { segments: [], oneTime: [] };
  const segments: RawSegment[] = [];
  for (const [shopId, items] of Object.entries(shop)) {
    for (const item of items) {
      for (const goods of item.Goods || []) {
        const costKey = keyOf(goods.ConsumeParcelTypeStr[0], goods.ConsumeParcelId[0]);
        const baseAmount = goods.ConsumeParcelAmount[0];
        const extraStep = goods.ConsumeExtraStep || [];
        const extraAmount = goods.ConsumeExtraAmount || [];
        goods.ParcelId.forEach((pid, idx) => {
          const producesKey = keyOf(goods.ParcelTypeStr[idx], pid);
          const amount = goods.ParcelAmount[idx];
          if (amount <= 0) return;
          // `PurchaseCountLimit === 0` means unlimited purchases (confirmed against live shop data —
          // every finite-limit item has a positive count; 0 is the outlier used for "no cap").
          if (!item.PurchaseCountLimit) {
            const finalPrice = extraStep.length > 0 ? extraAmount[extraAmount.length - 1] : baseAmount;
            segments.push({ costKey, costAmount: finalPrice, producesKey, amount, source: { type: 'shop_unlimited', shopId }, repeatsForever: true });
            return;
          }
          if (extraStep.length === 0) {
            // Flat price for the whole limit — one aggregated segment.
            segments.push({
              costKey,
              costAmount: baseAmount * item.PurchaseCountLimit,
              producesKey,
              amount: amount * item.PurchaseCountLimit,
              source: { type: 'shop_flat_limit', shopId, limit: item.PurchaseCountLimit },
            });
            return;
          }
          // Tiered price, bounded by PurchaseCountLimit — one segment per tier (not per unit).
          let purchased = 0;
          let tierStart = 0;
          for (let i = 0; i < extraStep.length && purchased < item.PurchaseCountLimit; i++) {
            const tierEnd = Math.min(tierStart + extraStep[i], item.PurchaseCountLimit);
            const unitsInTier = tierEnd - purchased;
            if (unitsInTier > 0) {
              segments.push({ costKey, costAmount: extraAmount[i] * unitsInTier, producesKey, amount: amount * unitsInTier, source: { type: 'shop_tier', shopId, tier: i + 1 } });
              purchased = tierEnd;
            }
            tierStart += extraStep[i];
          }
          if (purchased < item.PurchaseCountLimit) {
            const remaining = item.PurchaseCountLimit - purchased;
            segments.push({
              costKey,
              costAmount: extraAmount[extraAmount.length - 1] * remaining,
              producesKey,
              amount: amount * remaining,
              source: { type: 'shop_tier', shopId, tier: extraStep.length + 1 },
            });
          }
        });
      }
    }
  }
  return { segments, oneTime: [] };
}

function extractCardShop(ctx: Ctx): Extracted {
  const cardShop = ctx.eventData.card_shop;
  if (!cardShop || cardShop.length === 0) return { segments: [], oneTime: [] };
  const costGoods = cardShop[0].CostGoods;
  const costKey = keyOf('Item', costGoods.ConsumeParcelId[0]);
  // Expected amount of each produced key per single card flip, across the whole rarity/prob table.
  const expectedPerFlip = new Map<string, number>();
  for (const card of cardShop) {
    const weighted = card.RewardParcelAmount.map((a) => a * (card.Prob / 10000));
    for (const { producesKey, amount } of parcelRewards(card.RewardParcelId, card.RewardParcelTypeStr, weighted, ctx.eventData)) {
      expectedPerFlip.set(producesKey, (expectedPerFlip.get(producesKey) ?? 0) + amount);
    }
  }
  const rewardsPerFlip = [...expectedPerFlip].map(([producesKey, amount]) => ({ producesKey, amount }));
  const segments: RawSegment[] = [];
  costGoods.ConsumeExtraAmount.forEach((price, round) => emitSegments(segments, costKey, price, rewardsPerFlip, { type: 'card_shop_round', round: round + 1 }));
  return { segments, oneTime: [] };
}

function extractBoxGacha(ctx: Ctx): Extracted {
  const boxGacha = ctx.eventData.box_gacha;
  if (!boxGacha) return { segments: [], oneTime: [] };
  const segments: RawSegment[] = [];
  // `manage[]` carries per-round loop metadata only (matched by `Round`) — its own `Goods` never has reward
  // fields in real data, it's purely a lookup for whether a `shop` round repeats forever.
  const loopByRound = new Map<number, boolean>();
  boxGacha.manage.forEach((m) => loopByRound.set(m.Round, m.IsLoop));
  boxGacha.shop.forEach((item) => {
    const repeatsForever = loopByRound.get(item.Round);
    item.Goods.forEach((g) =>
      emitSegments(
        segments,
        keyOf(g.ConsumeParcelTypeStr[0], g.ConsumeParcelId[0]),
        g.ConsumeParcelAmount[0],
        parcelRewards(g.ParcelId, g.ParcelTypeStr, g.ParcelAmount, ctx.eventData),
        { type: 'box_gacha_round', round: item.Round, repeat: repeatsForever },
        { repeatsForever },
      ),
    );
  });
  return { segments, oneTime: [] };
}

// Exact-math extractors: interactive_world_raid, minigame_ccg, clue_search.

function extractInteractiveWorldRaid(ctx: Ctx): Extracted {
  const raid = ctx.eventData.interactive_world_raid;
  if (!raid) return { segments: [], oneTime: [] };
  const segments: RawSegment[] = [];
  // Ticket item id isn't in this type; approximated via a fixed currency fallback (see sourceLabel disclosure).
  const ticketKey = keyOf('Currency', 4);
  for (const stage of Object.values(raid.interactive_world_raid_stage)) {
    const rewards = raid.world_raid_stage_reward[stage.RaidBattleEndRewardGroupId] || [];
    const ticketsPerRun = stage.RaidEnterAmount || stage.ReEnterAmount || 1;
    const weighted = parcelRewards(
      rewards.map((r) => r.ClearStageRewardParcelUniqueId),
      rewards.map((r) => r.ClearStageRewardParcelTypeStr),
      rewards.map((r) => r.ClearStageRewardAmount * (r.ClearStageRewardProb / 10000)),
      ctx.eventData,
    );
    emitSegments(segments, ticketKey, ticketsPerRun, weighted, { type: 'interactive_world_raid' }, { repeatsForever: true, isApproximated: true });
  }
  return { segments, oneTime: [] };
}

function extractMinigameCcg(ctx: Ctx): Extracted {
  const ccg = ctx.eventData.minigame_ccg;
  if (!ccg || ccg.info.length === 0) return { segments: [], oneTime: [] };
  const info = ccg.info[0];
  const costKey = keyOf(info.CostParcelTypeStr, info.CostParcelId);
  const segments: RawSegment[] = [];
  for (const item of ccg.reward_item) {
    if (item.MinPoint <= 0) continue;
    // 1 play is assumed to advance 1 point (best-effort — exact per-play point gain isn't modeled elsewhere).
    emitSegments(
      segments,
      costKey,
      info.CostParcelAmount * item.MinPoint,
      expandGachaGroupReward(keyOf(item.RewardParcelTypeStr, item.RewardParcelId), item.RewardParcelAmount, ctx.eventData),
      { type: 'minigame_ccg_point', point: item.MinPoint },
      { isApproximated: true },
    );
  }
  return { segments, oneTime: [] };
}

function extractClueSearch(ctx: Ctx): Extracted {
  const clue = ctx.eventData.clue;
  if (!clue) return { segments: [], oneTime: [] };
  const segments: RawSegment[] = [];
  for (const round of clue.round) {
    // Round-completion bonus (paid via the sum of all clue-slot costs in this round).
    const totalCost = round.ClueCostAmount.reduce((a, b) => a + b, 0);
    const roundCostKey = keyOf('Item', round.ClueId[0]);
    emitSegments(
      segments,
      roundCostKey,
      totalCost,
      parcelRewards(round.Reward.RewardParcelId, round.Reward.RewardParcelTypeStr, round.Reward.RewardParcelAmount, ctx.eventData),
      { type: 'clue_search_round', round: round.Round },
      { repeatsForever: round.IsLoop },
    );
    // Per-clue reward: ClueSearchPlanner.tsx confirms each clue slot itself gives
    // `clue.RewardParcelAmount[idx] * ClueCostAmount[slotIdx]`, paid in `Item_${ClueId}` fragments.
    round.ClueId.forEach((clueId, slotIdx) => {
      const clueDef = clue.clue.find((c) => c.ClueId === clueId);
      if (!clueDef) return;
      const costAmount = round.ClueCostAmount[slotIdx];
      clueDef.RewardParcelId.forEach((pid, rewardIdx) => {
        const rewards = expandGachaGroupReward(keyOf(clueDef.RewardParcelTypeStr[rewardIdx], pid), clueDef.RewardParcelAmount[rewardIdx] * costAmount, ctx.eventData);
        for (const { producesKey, amount } of rewards) {
          segments.push({
            costKey: keyOf('Item', clueId),
            costAmount,
            producesKey,
            amount,
            source: { type: 'clue_search_clue', round: round.Round, clueId },
            repeatsForever: round.IsLoop,
          });
        }
      });
    });
  }
  return { segments, oneTime: [] };
}

// Path-dependent random minigames: reuse existing Monte Carlo simulations.
// Gated behind Ctx.includeSimulations for performance.

// Trials for the road-puzzle draw simulation below — matches RoadPuzzlePlanner.tsx's own default simCount,
// so results between the two are directly comparable. Acceptable as an explicit, user-triggered action.
const ROAD_PUZZLE_SIM_TRIALS = 1000;

function extractRoadPuzzle(ctx: Ctx): Extracted {
  const puzzle = ctx.eventData.minigame_road_puzzle;
  if (!puzzle || puzzle.info.length === 0) return { segments: [], oneTime: [] };
  const info = puzzle.info[0];
  // ConsumeParcelAmount is the cost of ONE rail placement (confirmed by RoadPuzzlePlanner.tsx's own
  // comment: "consumed per rail placed"), not a flat per-round cost — multiply by draws-needed below.
  const costKey = keyOf(info.CostGoods.ConsumeParcelTypeStr[0], info.CostGoods.ConsumeParcelId[0]);
  const costPerRail = info.CostGoods.ConsumeParcelAmount[0];
  const segments: RawSegment[] = [];
  // Reuses RoadPuzzlePlanner.tsx's draw simulation: tiles are drawn WITHOUT replacement from each map's fixed
  // pool, so true AP cost is the simulated draw count, not the unconstrained minimum-tiles pathfinding solve.
  const roundInfos = buildRoadPuzzleRoundInfos(puzzle);
  for (const roundInfo of roundInfos) {
    const drawCounts: number[] = [];
    for (const m of roundInfo.maps) {
      const mapData = ROAD_PUZZLE_MAPS[m.name];
      if (!mapData) continue;
      const solveResult = solveRoadPuzzle(mapData.grid, mapData.rowOffset, undefined, mapData.goalEntry, mapData.startEntry);
      if (!solveResult.found) continue;
      drawCounts.push(simulateRoadPuzzleMapDraws(m.name, m.toPlace, solveResult.minTiles, ROAD_PUZZLE_SIM_TRIALS).avg);
    }
    if (drawCounts.length === 0) continue;
    const avgDraws = drawCounts.reduce((a, b) => a + b, 0) / drawCounts.length;
    const costAmount = costPerRail * avgDraws;
    if (roundInfo.reward) {
      emitSegments(
        segments,
        costKey,
        costAmount,
        parcelRewards(roundInfo.reward.parcelId, roundInfo.reward.parcelTypeStr, roundInfo.reward.parcelAmount, ctx.eventData),
        { type: 'road_puzzle_round', round: roundInfo.round },
        { repeatsForever: roundInfo.isLoop, isApproximated: true },
      );
    }
    for (const add of roundInfo.additionalRewards) {
      emitSegments(
        segments,
        costKey,
        costAmount,
        parcelRewards(add.parcelId, add.parcelTypeStr, add.parcelAmount, ctx.eventData),
        { type: 'road_puzzle_round', round: roundInfo.round, additional: true },
        { repeatsForever: roundInfo.isLoop, isApproximated: true },
      );
    }
  }
  // "Rail set" completion bonus — a fixed reward granted once for completing a rail collection, not tied
  // to a specific extra cost beyond normal play, so it's a free one-time contribution.
  const oneTime: RawOneTime[] = [];
  for (const i of puzzle.info) {
    const railSetReward = (puzzle.rail_set_reward || []).find((r) => r.UniqueId === i.RailSetRewardId);
    if (!railSetReward) continue;
    for (const { producesKey, amount } of parcelRewards(railSetReward.RewardParcelId, railSetReward.RewardParcelTypeStr, railSetReward.RewardParcelAmount, ctx.eventData)) {
      oneTime.push({ producesKey, amount, source: { type: 'road_puzzle_rail_set' } });
    }
  }
  return { segments, oneTime };
}

function extractDiceRace(ctx: Ctx): Extracted {
  const diceRace = ctx.eventData.dice_race;
  const currency = ctx.eventData.currency;
  if (!diceRace || !currency) return { segments: [], oneTime: [] };
  const result = runDiceRaceSimulation(diceRace, { ...DefaultDiceRaceSimConfig, simRuns: 300 }, { ...ctx.eventData, dice_race: diceRace, currency });
  const costEntries = Object.entries(result.avgCost);
  if (costEntries.length === 0) return { segments: [], oneTime: [] };
  const [costKey, costAmount] = costEntries[0];
  const segments: RawSegment[] = [];
  for (const [producesKey, amount] of Object.entries(result.avgRewards)) {
    if (amount > 0) segments.push({ costKey, costAmount, producesKey, amount, source: { type: 'dice_race' }, repeatsForever: true, isApproximated: true });
  }
  return { segments, oneTime: [] };
}

function extractTreasure(ctx: Ctx): Extracted {
  const treasure = ctx.eventData.treasure;
  if (!treasure) return { segments: [], oneTime: [] };
  let totalCells = 0;
  const totalAmountByKey = new Map<string, number>();
  let costKey: string | null = null;
  let costPerCell = 0;
  for (const round of treasure.round) {
    const cells = runTreasureSimulation({ roundData: round, treasureRewards: treasure.reward, strategy: 'heuristic', goal: 'clear_all' });
    totalCells += cells;
    round.RewardId.forEach((rid, idx) => {
      const reward = treasure.reward[rid];
      reward?.RewardParcelId.forEach((pid, i) => {
        const producesKey = keyOf(reward.RewardParcelTypeStr[i], pid);
        totalAmountByKey.set(producesKey, (totalAmountByKey.get(producesKey) ?? 0) + reward.RewardParcelAmount[i] * round.RewardAmount[idx]);
      });
    });
    if (!costKey) {
      costKey = keyOf(round.CellCheckGoods.ConsumeParcelTypeStr[0], round.CellCheckGoods.ConsumeParcelId[0]);
      costPerCell = round.CellCheckGoods.ConsumeParcelAmount[0];
    }
  }
  if (!costKey || totalCells <= 0) return { segments: [], oneTime: [] };
  const repeatsForever = (treasure.info[0]?.LoopRound ?? 0) > 0;
  const segments: RawSegment[] = [];
  for (const [producesKey, amount] of totalAmountByKey) {
    if (amount > 0) segments.push({ costKey, costAmount: costPerCell * totalCells, producesKey, amount, source: { type: 'treasure' }, repeatsForever, isApproximated: true });
  }
  return { segments, oneTime: [] };
}

function extractConcentration(ctx: Ctx): Extracted {
  const concentration = ctx.eventData.concentration;
  if (!concentration || concentration.info.length === 0) return { segments: [], oneTime: [] };
  const info = concentration.info[0];
  const amountByKey = new Map<string, number>();
  for (const r of concentration.reward) {
    if (r.Round !== 1 && !r.IsLoop) continue;
    r.RewardParcelId.forEach((pid, idx) => {
      const producesKey = keyOf(r.RewardParcelTypeStr[idx], pid);
      amountByKey.set(producesKey, (amountByKey.get(producesKey) ?? 0) + r.RewardParcelAmount[idx]);
    });
  }
  if (amountByKey.size === 0) return { segments: [], oneTime: [] };
  const avgFlips = simulateAverageFlips(300, info.MaxCardOpenCount);
  const costKey = keyOf(info.CostGoods.ConsumeParcelTypeStr[0], info.CostGoods.ConsumeParcelId[0]);
  const costAmount = avgFlips * info.CostGoods.ConsumeParcelAmount[0];
  const segments: RawSegment[] = [];
  for (const [producesKey, amount] of amountByKey) {
    if (amount > 0) segments.push({ costKey, costAmount, producesKey, amount, source: { type: 'concentration' }, repeatsForever: true, isApproximated: true });
  }
  return { segments, oneTime: [] };
}

// minigame_dream: no existing exported simulation covers the day-by-day parameter/ending random walk.
// Approximate with a small Monte Carlo over `schedule_result.Prob` outcomes, disclosed as approximated.
function extractMinigameDream(ctx: Ctx): Extracted {
  const dream = ctx.eventData.minigame_dream;
  if (!dream || dream.info.length === 0) return { segments: [], oneTime: [] };
  const info = dream.info[0];
  const trials = 300;
  const sumByKey = new Map<string, number>();
  for (let t = 0; t < trials; t++) {
    let roll = Math.random() * 10000;
    let chosen = dream.schedule_result[0];
    for (const outcome of dream.schedule_result) {
      roll -= outcome.Prob;
      if (roll <= 0) {
        chosen = outcome;
        break;
      }
    }
    const endingReward = dream.ending_reward.find((e) => e.DreamMakerEndingType === chosen.DreamMakerResult);
    endingReward?.RewardParcelId.forEach((pid, idx) => {
      const producesKey = keyOf(endingReward.RewardParcelTypeStr[idx], pid);
      sumByKey.set(producesKey, (sumByKey.get(producesKey) ?? 0) + endingReward.RewardParcelAmount[idx]);
    });
  }
  if (sumByKey.size === 0) return { segments: [], oneTime: [] };
  const costKey = keyOf(info.ScheduleCostGoods.ConsumeParcelTypeStr[0], info.ScheduleCostGoods.ConsumeParcelId[0]);
  const costAmount = info.ScheduleCostGoods.ConsumeParcelAmount[0] * info.DreamMakerDays;
  const segments: RawSegment[] = [];
  for (const [producesKey, sum] of sumByKey) {
    const amount = sum / trials;
    if (amount > 0) segments.push({ costKey, costAmount, producesKey, amount, source: { type: 'minigame_dream' }, repeatsForever: true, isApproximated: true });
  }
  return { segments, oneTime: [] };
}

// fortune_gacha (Omikuji): reuses FortuneGachaPlanner.tsx's own pity-shift simulation as-is. GachaGroup box
// draws are decomposed into expected real contents, same as every other reward table here.
function extractFortuneGacha(ctx: Ctx): Extracted {
  const gacha = ctx.eventData.fortune_gacha;
  if (!gacha || gacha.shop.length === 0) return { segments: [], oneTime: [] };
  const result = runFortuneGachaSimulation(gacha, 2000);
  if (result.avgCost <= 0) return { segments: [], oneTime: [] };
  const costGoods = gacha.shop[0].CostGoods;
  const costKey = keyOf(costGoods.ConsumeParcelTypeStr[0], costGoods.ConsumeParcelId[0]);
  const rewards = expandGachaGroupRewards(
    Object.entries(result.avgRewards).map(([producesKey, amount]) => ({ producesKey, amount })),
    ctx.eventData,
  );
  const segments: RawSegment[] = [];
  for (const { producesKey, amount } of rewards) {
    if (amount > 0) segments.push({ costKey, costAmount: result.avgCost, producesKey, amount, source: { type: 'fortune_gacha' }, repeatsForever: true, isApproximated: true });
  }
  return { segments, oneTime: [] };
}

// ---------------------------------------------------------------------------
// Extraction: missions + field — free contributions (no AP cost modeled), plus field's stage-shaped route.
// ---------------------------------------------------------------------------

function extractMissions(ctx: Ctx): Extracted {
  const oneTime: RawOneTime[] = [];
  const durationDays = getEventDurationDays(ctx);
  const collect = (
    missions: { CategoryStr: string; MissionRewardParcelId: number[]; MissionRewardParcelTypeStr: string[]; MissionRewardAmount: number[] }[] | undefined,
    category: 'mission' | 'minigame_mission',
  ) => {
    for (const m of missions || []) {
      const isDaily = m.CategoryStr === 'Daily';
      m.MissionRewardParcelId.forEach((rid, idx) => {
        const perOccurrence = m.MissionRewardAmount[idx];
        if (perOccurrence <= 0) return;
        for (const { producesKey, amount } of expandGachaGroupReward(keyOf(m.MissionRewardParcelTypeStr[idx], rid), perOccurrence, ctx.eventData)) {
          if (isDaily) oneTime.push({ producesKey, amount: amount * durationDays, source: { type: 'mission', category, daily: true, days: durationDays } });
          else oneTime.push({ producesKey, amount, source: { type: 'mission', category } });
        }
      });
    }
  };
  collect(ctx.eventData.mission, 'mission');
  collect(ctx.eventData.minigame_mission, 'minigame_mission');
  return { segments: [], oneTime };
}

// Field quests/mastery free; FieldContentStageReward costs AP via hardcoded stage-lookup table.
function extractField(ctx: Ctx): Extracted {
  const field = ctx.eventData.field;
  if (!field) return { segments: [], oneTime: [] };
  const oneTime: RawOneTime[] = [];
  const durationDays = getEventDurationDays(ctx);
  for (const quest of field.FieldQuest) {
    for (const r of quest.Reward) {
      const perOccurrence = r.RewardAmount * (r.RewardProb / 10000);
      if (perOccurrence <= 0) continue;
      for (const { producesKey, amount } of expandGachaGroupReward(keyOf(r.RewardParcelType, r.RewardId), perOccurrence, ctx.eventData)) {
        if (quest.IsDaily) oneTime.push({ producesKey, amount: amount * durationDays, source: { type: 'field_quest', daily: true, days: durationDays } });
        else oneTime.push({ producesKey, amount, source: { type: 'field_quest' } });
      }
    }
  }
  for (const level of field.FieldMasteryLevel) {
    for (const r of level.Reward || []) {
      if (r.RewardAmount <= 0) continue;
      for (const { producesKey, amount } of expandGachaGroupReward(keyOf(r.RewardParcelType, r.RewardId), r.RewardAmount, ctx.eventData)) {
        oneTime.push({ producesKey, amount, source: { type: 'field_mastery', level: level.Level } });
      }
    }
  }
  const segments: RawSegment[] = [];
  const entryCurrencyId = ctx.eventData.currency?.[0]?.ItemUniqueId;
  if (entryCurrencyId) {
    const costKey = keyOf('Item', entryCurrencyId);
    // Displayed as "Field Stage N" using position in the list, same as FieldEventPlanner.tsx's own
    // `t('stageLabel', { n: idx + 1 })` — the raw numeric stageId isn't fit for user-facing display.
    Object.entries(field.FieldContentStageReward).forEach(([stageId, rewardItems], idx) => {
      const costAmount = getStageCost(ctx.eventId, stageId);
      // Same co-reward summing + FirstClear/ThreeStar split as extractStageLike — merged into one bucket since
      // both are one-time and same-cost, folded into the segment's first-run bonus to avoid double-charging AP.
      const repeatableByKey = new Map<string, number>();
      const oneTimeClearByKey = new Map<string, number>();
      for (const r of rewardItems) {
        if (r.RewardProb === 0) continue;
        const amount = r.RewardAmount * (r.RewardProb / 10000);
        if (amount <= 0) continue;
        const isSpecial = r.RewardTag === 'FirstClear' || r.RewardTag === 'ThreeStar';
        const targetMap = isSpecial ? oneTimeClearByKey : repeatableByKey;
        const rawKey = keyOf(r.RewardParcelType, r.RewardId);
        for (const { producesKey, amount: expandedAmount } of expandGachaGroupReward(rawKey, amount, ctx.eventData)) {
          targetMap.set(producesKey, (targetMap.get(producesKey) ?? 0) + expandedAmount);
        }
      }
      for (const [producesKey, amount] of repeatableByKey) {
        if (amount <= 0) continue;
        const firstRunBonusAmount = oneTimeClearByKey.get(producesKey);
        if (firstRunBonusAmount !== undefined) oneTimeClearByKey.delete(producesKey);
        segments.push({ costKey, costAmount, producesKey, amount, source: { type: 'field_stage', index: idx }, repeatsForever: true, firstRunBonusAmount });
      }
      for (const [producesKey, amount] of oneTimeClearByKey) {
        if (amount > 0) oneTime.push({ producesKey, amount, costKey, costAmount, source: { type: 'field_stage', index: idx, oneTimeClear: true } });
      }
    });
  }
  return { segments, oneTime };
}

// ---------------------------------------------------------------------------
// Resolution: one generic shortest-path pass converts every raw cost into an AP amount.
// ---------------------------------------------------------------------------

const EMPTY_EXTRACTED: Extracted = { segments: [], oneTime: [] };

function extractAll(ctx: Ctx): Extracted {
  // Monte-Carlo-simulation-based extractors only run when explicitly opted into (see Ctx.includeSimulations)
  // — road_puzzle alone measured ~2.3s per event, far too slow to run on every render/tab-open.
  const sim = ctx.includeSimulations;
  return merge(
    extractStage(ctx),
    extractMinigameDefense(ctx),
    extractShop(ctx),
    extractCardShop(ctx),
    extractBoxGacha(ctx),
    extractInteractiveWorldRaid(ctx),
    extractMinigameJanken(ctx),
    extractMinigameCcg(ctx),
    extractClueSearch(ctx),
    sim ? extractRoadPuzzle(ctx) : EMPTY_EXTRACTED,
    sim ? extractDiceRace(ctx) : EMPTY_EXTRACTED,
    sim ? extractTreasure(ctx) : EMPTY_EXTRACTED,
    sim ? extractConcentration(ctx) : EMPTY_EXTRACTED,
    sim ? extractMinigameDream(ctx) : EMPTY_EXTRACTED,
    sim ? extractFortuneGacha(ctx) : EMPTY_EXTRACTED,
    extractMissions(ctx),
    extractField(ctx),
  );
}

/* Dijkstra: cheapest AP-per-unit route for every reachable currency (no cycles/bookkeeping) */
interface ApRateResult {
  apCostPerUnit: Map<string, number>;
  // Cheapest repeatable route per currency picked by Dijkstra.
  // firstRunBonusAmount is only free for the chosen segment.
  chosenEdge: Map<string, RawSegment>;
}

function computeApRateMap(segments: RawSegment[]): ApRateResult {
  const edgesByCost = new Map<string, RawSegment[]>();
  for (const s of segments) {
    if (s.amount <= 0 || s.costAmount <= 0) continue;
    if (!edgesByCost.has(s.costKey)) edgesByCost.set(s.costKey, []);
    edgesByCost.get(s.costKey)?.push(s);
  }

  const apCostPerUnit = new Map<string, number>([[AP, 1]]);
  const chosenEdge = new Map<string, RawSegment>();
  const finalized = new Set<string>();

  while (true) {
    let curKey: string | null = null;
    let curCost = Infinity;
    for (const [key, cost] of apCostPerUnit) {
      if (!finalized.has(key) && cost < curCost) {
        curCost = cost;
        curKey = key;
      }
    }
    if (curKey === null) break;
    finalized.add(curKey);

    for (const edge of edgesByCost.get(curKey) ?? []) {
      const candidate = (curCost * edge.costAmount) / edge.amount;
      const existing = apCostPerUnit.get(edge.producesKey);
      if (existing === undefined || candidate < existing) {
        apCostPerUnit.set(edge.producesKey, candidate);
        chosenEdge.set(edge.producesKey, edge);
      }
    }
  }
  return { apCostPerUnit, chosenEdge };
}

function resolveOneTime(rateMap: Map<string, number>, o: RawOneTime): OneTimeContribution | null {
  const sourceLabel = formatSourceLabel(o.source);
  if (o.costKey === undefined) return { amount: o.amount, source: o.source, sourceLabel };
  const rate = o.costKey === AP ? 1 : rateMap.get(o.costKey);
  if (rate === undefined) return null;
  const apCost = rate * (o.costAmount ?? 0);
  return { amount: o.amount, apCost, source: o.source, sourceLabel };
}

// Resolves one-time amounts at any chain depth, including recursive currency exchanges.
// Handles firstRunBonusAmount correctly via sequencedFamilyPrefix.
function sequencedFamilyPrefix(
  extracted: Extracted,
  chosenEdge: ReadonlyMap<string, RawSegment>,
  currencyKey: string,
): { amount: number; apCost: number; segMembers: Set<RawSegment>; oneTimeMembers: Set<RawOneTime>; bulkSource: SourceRef } | null {
  const chosen = chosenEdge.get(currencyKey);
  if (!chosen) return null;
  const family = sequenceFamilyOf(chosen.source);
  const chosenOrder = sequenceOrderOf(chosen.source);
  if (family === null || chosenOrder === null) return null;

  const segMembers = extracted.segments.filter((s) => s.producesKey === currencyKey && sequenceFamilyOf(s.source) === family && (sequenceOrderOf(s.source) as number) <= chosenOrder);
  const oneTimeMembers = extracted.oneTime.filter((o) => o.producesKey === currencyKey && sequenceFamilyOf(o.source) === family && (sequenceOrderOf(o.source) as number) <= chosenOrder);
  const amount = segMembers.reduce((a, s) => a + s.amount + (s.firstRunBonusAmount ?? 0), 0) + oneTimeMembers.reduce((a, o) => a + o.amount, 0);
  const apCost = segMembers.reduce((a, s) => a + s.costAmount, 0) + oneTimeMembers.reduce((a, o) => a + (o.costAmount ?? 0), 0);

  // Show full range covered ("story 1-10 + stage 1-12"), not just endpoint; prefix spans multiple categories.
  const rangeByCategory = new Map<StageLikeCategory, { from: number; to: number }>();
  for (const s of [...segMembers, ...oneTimeMembers.map((o) => ({ source: o.source }))]) {
    if (s.source.type !== 'stage_like' || s.source.stageNumber === undefined) continue;
    const num = Number(s.source.stageNumber);
    const existing = rangeByCategory.get(s.source.category);
    if (existing) {
      existing.from = Math.min(existing.from, num);
      existing.to = Math.max(existing.to, num);
    } else {
      rangeByCategory.set(s.source.category, { from: num, to: num });
    }
  }
  const ranges = [...rangeByCategory.entries()].sort((a, b) => a[1].from - b[1].from).map(([category, { from, to }]) => ({ category, from, to }));
  const bulkSource: SourceRef = ranges.length > 0 ? { type: 'sequenced_prefix_bulk', ranges } : chosen.source;

  return { amount, apCost, segMembers: new Set(segMembers), oneTimeMembers: new Set(oneTimeMembers), bulkSource };
}

function collectCurrencyOneTime(
  extracted: Extracted,
  chosenEdge: ReadonlyMap<string, RawSegment>,
  currencyKey: string,
  // Explicit isTopLevel flag (not inferred from visited); netCurrencyPoolIntoSegments needs it for recursive calls.
  isTopLevel: boolean,
  visited: ReadonlySet<string> = new Set(),
  skipCostKeys: ReadonlySet<string> = new Set(),
): RawOneTime[] {
  if (visited.has(currencyKey)) return [];
  const nextVisited = new Set(visited).add(currencyKey);

  const prefix = sequencedFamilyPrefix(extracted, chosenEdge, currencyKey);

  const direct = extracted.oneTime.filter((o) => o.producesKey === currencyKey && !prefix?.oneTimeMembers.has(o));
  // firstRunBonusAmount is free only in mandatory prefix segments.
  // Skipped at top level, bundled deeper in the chain.
  const bundled = extracted.segments
    .filter((s) => s.producesKey === currencyKey && s.firstRunBonusAmount && !prefix?.segMembers.has(s))
    .map((s) => ({
      producesKey: currencyKey,
      amount: s.firstRunBonusAmount as number,
      costKey: s.costKey,
      costAmount: s.costAmount,
      source: s.source,
    }));
  const bulk: RawOneTime[] = !isTopLevel && prefix && prefix.amount > 0 ? [{ producesKey: currencyKey, amount: prefix.amount, costKey: AP, costAmount: prefix.apCost, source: prefix.bulkSource }] : [];

  // Dedupe by costKey: keep single best (highest amount/costAmount) edge (tiered shop per tier).
  // Skip skipCostKeys to avoid double-counting (already folded into target's own segments).
  const bestEdgeByCostKey = new Map<string, RawSegment>();
  for (const s of extracted.segments) {
    if (s.producesKey !== currencyKey || s.costKey === AP || s.costAmount <= 0) continue;
    if (isTopLevel && skipCostKeys.has(s.costKey)) continue;
    const rate = s.amount / s.costAmount;
    const existing = bestEdgeByCostKey.get(s.costKey);
    if (!existing || rate > existing.amount / existing.costAmount) bestEdgeByCostKey.set(s.costKey, s);
  }
  const chained: RawOneTime[] = [];
  for (const edge of bestEdgeByCostKey.values()) {
    const exchangeRate = edge.amount / edge.costAmount;
    for (const upstream of collectCurrencyOneTime(extracted, chosenEdge, edge.costKey, false, nextVisited)) {
      chained.push({ ...upstream, producesKey: currencyKey, amount: upstream.amount * exchangeRate });
    }
  }

  return [...direct, ...bundled, ...bulk, ...chained];
}

// Group segments by consumption order within families (never across different families, even with same SourceRef shape).
function sequenceFamilyOf(source: SourceRef): string | null {
  switch (source.type) {
    case 'stage_like':
      if (source.stageNumber === undefined) return null;
      // Story gates regular-stage access, so merge into stage family as mandatory prerequisite; challenge is separate.
      return source.category === 'story' ? 'stage_like:stage' : `stage_like:${source.category}`;
    case 'clue_search_round':
    case 'clue_search_clue':
      return 'clue_search';
    case 'road_puzzle_round':
    case 'card_shop_round':
    case 'box_gacha_round':
    case 'minigame_ccg_point':
      return source.type;
    default:
      return null;
  }
}

// Position within that family's progression (see foldOneSequencedFamily/netCurrencyPoolIntoSegments) — null
// for anything sequenceFamilyOf already excluded.
function sequenceOrderOf(source: SourceRef): number | null {
  switch (source.type) {
    case 'stage_like': {
      if (source.stageNumber === undefined) return null;
      const num = Number(source.stageNumber);
      // Story has its own numbering but must be cleared before any area stage — offset it well below every
      // area stage number so it sorts first, while still preserving story's own internal order via `num`.
      return source.category === 'story' ? num - 100_000 : num;
    }
    case 'clue_search_round':
    case 'clue_search_clue':
    case 'road_puzzle_round':
    case 'card_shop_round':
    case 'box_gacha_round':
      return source.round;
    case 'minigame_ccg_point':
      return source.point;
    default:
      return null;
  }
}

// Net one-time currency pools against segment costs to avoid double-counting.
function netCurrencyPoolIntoSegments(
  extracted: Extracted,
  rateMap: Map<string, number>,
  chosenEdge: ReadonlyMap<string, RawSegment>,
  rawSegments: RawSegment[],
): { segments: ApSegment[]; nettedCostKeys: Set<string> } {
  const byCostKey = new Map<string, RawSegment[]>();
  for (const s of rawSegments) {
    if (s.costKey === AP) continue;
    if (!byCostKey.has(s.costKey)) byCostKey.set(s.costKey, []);
    byCostKey.get(s.costKey)?.push(s);
  }

  const discountedCostAmount = new Map<RawSegment, number>();
  const extraApCost = new Map<RawSegment, number>();
  const nettedCostKeys = new Set<string>();
  for (const [costKey, group] of byCostKey) {
    // Net only into groups with same sequenced family; others handled by collectCurrencyOneTime.
    const families = new Set(group.map((s) => sequenceFamilyOf(s.source)));
    if (families.size !== 1 || families.has(null)) continue;

    // Only activate as much of the pool as the group's total demand needs, to avoid overcounting unused
    // amounts. Free contributors sort first, then best rate (amount/AP), until demand is covered.
    const totalDemand = group.reduce((a, s) => a + s.costAmount, 0);
    const pool = collectCurrencyOneTime(extracted, chosenEdge, costKey, false)
      .map((o) => resolveOneTime(rateMap, o))
      .filter((o): o is OneTimeContribution => o !== null)
      .sort((a, b) => {
        const rateA = a.apCost === undefined || a.apCost === 0 ? Infinity : a.amount / a.apCost;
        const rateB = b.apCost === undefined || b.apCost === 0 ? Infinity : b.amount / b.apCost;
        return rateB - rateA;
      });
    let remaining = 0;
    let poolApCost = 0;
    for (const o of pool) {
      if (remaining >= totalDemand) break;
      remaining += o.amount;
      poolApCost += o.apCost ?? 0;
    }
    if (remaining <= 0) continue;
    nettedCostKeys.add(costKey);

    const ordered = [...group].sort((a, b) => (sequenceOrderOf(a.source) as number) - (sequenceOrderOf(b.source) as number));
    for (const s of ordered) {
      if (remaining <= 0) break;
      const discount = Math.min(remaining, s.costAmount);
      remaining -= discount;
      discountedCostAmount.set(s, s.costAmount - discount);
      if (poolApCost > 0) {
        extraApCost.set(s, poolApCost);
        poolApCost = 0;
      }
    }
  }

  // Resolved inline rather than via resolveSegment: a fully-netted segment has costAmount 0, which
  // resolveSegment's apCost<=0 guard would drop — but the pool-unlock AP (`extra`) must be added first,
  // since it can still be non-zero.
  const segments = rawSegments
    .map((s): ApSegment | null => {
      const costAmount = discountedCostAmount.get(s) ?? s.costAmount;
      const rate = s.costKey === AP ? 1 : rateMap.get(s.costKey);
      if (rate === undefined) return null;
      const apCost = rate * costAmount + (extraApCost.get(s) ?? 0);
      if (apCost <= 0) return null;
      return {
        apCost,
        amount: s.amount,
        source: s.source,
        sourceLabel: formatSourceLabel(s.source),
        repeatsForever: s.repeatsForever,
        isApproximated: s.isApproximated,
        firstRunBonusAmount: s.firstRunBonusAmount,
      };
    })
    .filter((s): s is ApSegment => s !== null);
  return { segments, nettedCostKeys };
}

function profileFromExtracted(extracted: Extracted, rateMap: Map<string, number>, chosenEdge: ReadonlyMap<string, RawSegment>, targetKey: string): ResourceApProfile {
  const rawSegments = extracted.segments.filter((s) => s.producesKey === targetKey);
  const { segments: nettedSegments, nettedCostKeys } = netCurrencyPoolIntoSegments(extracted, rateMap, chosenEdge, rawSegments);
  const segments = nettedSegments.sort((a, b) => b.amount / b.apCost - a.amount / a.apCost);

  const oneTimeContributions = collectCurrencyOneTime(extracted, chosenEdge, targetKey, true, new Set(), nettedCostKeys)
    .map((o) => resolveOneTime(rateMap, o))
    .filter((o): o is OneTimeContribution => o !== null);

  return { key: targetKey, segments, oneTimeContributions };
}

export interface ResourceApIndex {
  resourceKeys: string[];
  resolveProfile: (targetKey: string) => ResourceApProfile;
  buildSankey: (targetKey: string, targetAmount: number) => SankeyFlow;
  buildFarmingPlan: (targetKey: string) => FarmingPlanEntry[];
}

/**
 * Runs extraction + rate resolution once; caches result so callers can resolve multiple profiles efficiently.
 */
export function buildResourceApIndex(ctx: Ctx): ResourceApIndex {
  const extracted = extractAll(ctx);
  const { apCostPerUnit: rateMap, chosenEdge } = computeApRateMap(extracted.segments);
  const resourceKeys = [...new Set([...extracted.segments.map((s) => s.producesKey), ...extracted.oneTime.map((o) => o.producesKey)])];
  return {
    resourceKeys,
    resolveProfile: (targetKey) => profileFromExtracted(extracted, rateMap, chosenEdge, targetKey),
    buildSankey: (targetKey, targetAmount) => sankeyFlowFromExtracted(extracted, chosenEdge, targetKey, targetAmount),
    buildFarmingPlan: (targetKey) => farmingPlanFromExtracted(extracted, chosenEdge, targetKey),
  };
}

export function resolveResourceApProfile(targetKey: string, ctx: Ctx): ResourceApProfile {
  return buildResourceApIndex(ctx).resolveProfile(targetKey);
}

/** Every resource key producible anywhere in this event (stage/shop/minigame/mission/field). */
export function listSelectableResourceKeys(ctx: Ctx): string[] {
  return buildResourceApIndex(ctx).resourceKeys;
}

// AP flow trace for Sankey rendering; debug use only.

export interface SankeyFlow {
  labels: string[];
  source: number[];
  target: number[];
  value: number[];
  /** Column (left-to-right position) per node index, in chronological/causal order from AP (0) onward. */
  depth: number[];
}

function sankeyNodeLabel(source: SourceRef): string {
  switch (source.type) {
    case 'stage_like': {
      const num = source.stageNumber ? ` ${source.stageNumber}` : '';
      return `${source.category}${num}${source.oneTimeClear ? ' (1st clear)' : ''}`;
    }
    case 'sequenced_prefix_bulk':
      return source.ranges.map((r) => `${r.category} ${r.from === r.to ? r.from : `${r.from}-${r.to}`}`).join(' + ') + ' (1x each)';
    case 'clue_search_round':
      return `Clue round ${source.round}`;
    case 'clue_search_clue':
      return `Clue ${source.round}/${source.clueId}`;
    case 'shop_unlimited':
      return `Shop ${source.shopId}`;
    case 'shop_flat_limit':
      return `Shop ${source.shopId} (x${source.limit})`;
    case 'shop_tier':
      return `Shop ${source.shopId} tier ${source.tier}`;
    case 'road_puzzle_round':
      return `Road puzzle round ${source.round}`;
    case 'card_shop_round':
      return `Card shop round ${source.round}`;
    case 'box_gacha_round':
      return `Box gacha round ${source.round}`;
    case 'mission':
      return source.category === 'minigame_mission' ? 'Minigame mission' : 'Mission';
    case 'field_quest':
      return 'Field quest';
    case 'field_stage':
      return `Field stage ${source.index + 1}`;
    default:
      return source.type;
  }
}

/**
 * Trace AP cost breakdown for targetAmount; returns Plotly sankey node/link structure.
 * Takes extracted data and chosen-route map to reuse cached ResourceApIndex.
 * pass instead of paying for extractAll (and any simulations it runs) a second time.
 */
export function sankeyFlowFromExtracted(extracted: Extracted, chosenEdge: ReadonlyMap<string, RawSegment>, targetKey: string, targetAmount: number): SankeyFlow {
  const labels: string[] = [];
  const nodeIndex = new Map<string, number>();
  const linkValueByPair = new Map<string, number>();
  // Column (left-to-right position) per node index — AP is column 0, each hop further out is one column
  // more, so the diagram reads in chronological order instead of Plotly's default auto-layout.
  const nodeDepth: number[] = [];
  function setDepth(idx: number, depth: number): void {
    nodeDepth[idx] = nodeDepth[idx] === undefined ? depth : Math.max(nodeDepth[idx], depth);
  }

  function node(key: string, label: string): number {
    let idx = nodeIndex.get(key);
    if (idx === undefined) {
      idx = labels.length;
      labels.push(label);
      nodeIndex.set(key, idx);
    }
    return idx;
  }
  // Accumulates into one link per (source, target) pair instead of a new link per crossing — Plotly renders
  // repeated links as separate bands, not merged.
  function addLink(source: number, target: number, value: number): void {
    if (value <= 0) return;
    const key = `${source}:${target}`;
    linkValueByPair.set(key, (linkValueByPair.get(key) ?? 0) + value);
  }

  const apNodeIdx = node(AP, 'AP spent');
  setDepth(apNodeIdx, 0);

  // Tracks how much of each currency's mandatory prefix pool (see sequencedFamilyPrefix) has been allocated,
  // so it's a shared one-time cost across all call sites, not re-granted per caller.
  const prefixUsed = new Map<string, number>();

  // Resolve currency amount via chosen route, return node index and AP cost.
  function resolve(currencyKey: string, amount: number): { nodeIdx: number; apValue: number; depth: number } {
    const currencyNode = node(currencyKey, currencyKey);
    if (amount <= 0) return { nodeIdx: currencyNode, apValue: 0, depth: nodeDepth[currencyNode] ?? 1 };
    const chosen = chosenEdge.get(currencyKey);
    if (!chosen) return { nodeIdx: currencyNode, apValue: 0, depth: nodeDepth[currencyNode] ?? 1 };

    let remaining = amount;
    let apValue = 0;
    let depth = 1;
    const prefix = sequencedFamilyPrefix(extracted, chosenEdge, currencyKey);
    if (prefix && prefix.amount > 0) {
      const alreadyUsed = prefixUsed.get(currencyKey) ?? 0;
      const available = Math.max(0, prefix.amount - alreadyUsed);
      const used = Math.min(remaining, available);
      if (used > 0) {
        const apPortion = (used / prefix.amount) * prefix.apCost;
        const prefixNode = node(`${currencyKey}:prefix`, `${currencyKey}: clear ${sankeyNodeLabel(prefix.bulkSource)}`);
        setDepth(prefixNode, 1);
        addLink(apNodeIdx, prefixNode, apPortion);
        addLink(prefixNode, currencyNode, apPortion);
        prefixUsed.set(currencyKey, alreadyUsed + used);
        remaining -= used;
        apValue += apPortion;
        depth = Math.max(depth, 2);
      }
    }
    if (remaining > 0) {
      const rate = chosen.amount / chosen.costAmount; // currencyKey units per 1 unit of chosen.costKey
      const costKeyAmountNeeded = remaining / rate;
      if (chosen.costKey === AP) {
        const repeatNode = node(`${currencyKey}:repeat`, `${currencyKey}: repeat ${sankeyNodeLabel(chosen.source)}`);
        setDepth(repeatNode, 1);
        addLink(apNodeIdx, repeatNode, costKeyAmountNeeded);
        addLink(repeatNode, currencyNode, costKeyAmountNeeded);
        apValue += costKeyAmountNeeded;
        depth = Math.max(depth, 2);
      } else {
        const upstream = resolve(chosen.costKey, costKeyAmountNeeded);
        addLink(upstream.nodeIdx, currencyNode, upstream.apValue);
        apValue += upstream.apValue;
        depth = Math.max(depth, upstream.depth + 1);
      }
    }
    setDepth(currencyNode, depth);
    return { nodeIdx: currencyNode, apValue, depth };
  }

  // Walk sequential target segments in natural order; create nodes in order to keep them top-to-bottom in diagram.
  const targetNode = node(targetKey, targetKey);
  const targetSegments = extracted.segments
    .filter((s) => s.producesKey === targetKey)
    .sort((a, b) => {
      const oa = sequenceOrderOf(a.source);
      const ob = sequenceOrderOf(b.source);
      return oa !== null && ob !== null ? oa - ob : 0;
    });
  let remainingTarget = targetAmount;
  let targetDepth = 1;
  for (const s of targetSegments) {
    if (remainingTarget <= 0) break;
    // A repeatsForever segment (e.g. IsLoop round) isn't capped at its one-run amount — it repeats as needed
    // to cover whatever remains, acting as the target's steady-state tail.
    const used = s.repeatsForever ? remainingTarget : Math.min(remainingTarget, s.amount);
    if (used <= 0) continue;
    const costAmountNeeded = (used / s.amount) * s.costAmount;
    remainingTarget -= used;
    const resolved = s.costKey === AP ? { nodeIdx: apNodeIdx, apValue: costAmountNeeded, depth: 0 } : resolve(s.costKey, costAmountNeeded);
    const stepNode = node(`${targetKey}:step:${sankeyNodeLabel(s.source)}`, sankeyNodeLabel(s.source));
    setDepth(stepNode, resolved.depth + 1);
    addLink(resolved.nodeIdx, stepNode, resolved.apValue);
    addLink(stepNode, targetNode, resolved.apValue);
    targetDepth = Math.max(targetDepth, resolved.depth + 2);
  }
  setDepth(targetNode, targetDepth);

  const source: number[] = [];
  const target: number[] = [];
  const value: number[] = [];
  for (const [key, v] of linkValueByPair) {
    const [s, t] = key.split(':').map(Number);
    source.push(s);
    target.push(t);
    value.push(v);
  }
  return { labels, source, target, value, depth: nodeDepth };
}

/** Standalone convenience wrapper — runs its own extractAll pass. Prefer ResourceApIndex.buildSankey when a
 *  ResourceApIndex already exists for this ctx (e.g. in a UI that also renders profiles), to avoid extracting
 *  twice. */
export function buildApFlowSankey(ctx: Ctx, targetKey: string, targetAmount: number): SankeyFlow {
  const extracted = extractAll(ctx);
  const { chosenEdge } = computeApRateMap(extracted.segments);
  return sankeyFlowFromExtracted(extracted, chosenEdge, targetKey, targetAmount);
}

export interface FarmingPlanEntry {
  category: 'stage' | 'story';
  stageNumber: string;
  repeatsForever: boolean;
}

/**
 * List every regular farming stage; only chosen repeat target (via chosenEdge) marks as repeating.
 */
export function farmingPlanFromExtracted(extracted: Extracted, chosenEdge: ReadonlyMap<string, RawSegment>, targetKey: string): FarmingPlanEntry[] {
  const plan = new Map<string, FarmingPlanEntry>();
  function addEntry(source: SourceRef, repeatsForever: boolean): void {
    if (source.type !== 'stage_like' || source.stageNumber === undefined) return;
    if (source.category !== 'stage' && source.category !== 'story') return;
    const key = `${source.category}:${source.stageNumber}`;
    const existing = plan.get(key);
    if (existing) {
      existing.repeatsForever = existing.repeatsForever || repeatsForever;
    } else {
      plan.set(key, { category: source.category, stageNumber: source.stageNumber, repeatsForever });
    }
  }

  for (const s of extracted.segments) addEntry(s.source, false);
  for (const o of extracted.oneTime) addEntry(o.source, false);

  // Mark whichever single stage is targetKey's own chosen ongoing repeat target, walking the same
  // chosenEdge chain the Segments list's AP rates are priced through.
  const visited = new Set<string>();
  function walk(currencyKey: string): void {
    if (visited.has(currencyKey)) return;
    visited.add(currencyKey);
    const chosen = chosenEdge.get(currencyKey);
    if (!chosen) return;
    if (chosen.costKey === AP) {
      addEntry(chosen.source, true);
    } else {
      walk(chosen.costKey);
    }
  }
  for (const s of extracted.segments) {
    if (s.producesKey !== targetKey) continue;
    if (s.costKey === AP) {
      addEntry(s.source, !!s.repeatsForever);
    } else {
      walk(s.costKey);
    }
  }

  return [...plan.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category === 'story' ? -1 : 1;
    return Number(a.stageNumber) - Number(b.stageNumber);
  });
}

/** Standalone convenience wrapper — see buildApFlowSankey's own note; prefer ResourceApIndex.buildFarmingPlan
 *  when a ResourceApIndex already exists. */
export function buildFarmingPlan(ctx: Ctx, targetKey: string): FarmingPlanEntry[] {
  const extracted = extractAll(ctx);
  const { chosenEdge } = computeApRateMap(extracted.segments);
  return farmingPlanFromExtracted(extracted, chosenEdge, targetKey);
}

// Build cumulative reward curve with sample points for consistent chart granularity.

const REPEATING_TAIL_SAMPLE_POINTS = 24;

// Sequential-progression key for stage/clue sources. Groups by family, position by order.
function sequenceKeyOf(s: ApSegment): { family: string; order: number } | null {
  const family = sequenceFamilyOf(s.source);
  const order = sequenceOrderOf(s.source);
  if (family === null || order === null) return null;
  return { family, order };
}

// Pick the best-rate member as the infinite repeat target; earlier members become mandatory prefix runs,
// later members are kept only while cumulative (reward - tailRate*cost) still improves.
function foldOneSequencedFamily(segments: ApSegment[], members: ApSegment[]): ApSegment[] {
  const best = members.reduce((a, b) => (b.amount / b.apCost > a.amount / a.apCost ? b : a));
  const bestOrder = sequenceKeyOf(best)?.order;
  if (bestOrder === undefined || !Number.isFinite(bestOrder)) return segments;
  const rate = best.amount / best.apCost;
  const orderOf = (s: ApSegment) => sequenceKeyOf(s)?.order ?? NaN;

  const others = members.filter((s) => s !== best);
  const before = others.filter((s) => orderOf(s) < bestOrder).sort((a, b) => orderOf(a) - orderOf(b));
  const after = others.filter((s) => orderOf(s) > bestOrder).sort((a, b) => orderOf(a) - orderOf(b));

  const mandatory = before.map((s) => ({ ...s, repeatsForever: false }));

  let running = 0;
  let bestRunning = 0;
  let cut = 0;
  for (let i = 0; i < after.length; i++) {
    const s = after[i];
    running += s.amount + (s.firstRunBonusAmount ?? 0) - rate * s.apCost;
    if (running > bestRunning) {
      bestRunning = running;
      cut = i + 1;
    }
  }
  const extension = after.slice(0, cut).map((s) => ({ ...s, repeatsForever: false }));

  const memberSet = new Set(members);
  const rest = segments.filter((s) => s === best || !memberSet.has(s));
  return [...mandatory, ...extension, ...rest];
}

function foldSequencedFamilies(segments: ApSegment[]): ApSegment[] {
  const byFamily = new Map<string, ApSegment[]>();
  for (const s of segments) {
    if (!s.repeatsForever) continue;
    const key = sequenceKeyOf(s);
    if (!key) continue;
    if (!byFamily.has(key.family)) byFamily.set(key.family, []);
    byFamily.get(key.family)?.push(s);
  }

  let result = segments;
  for (const members of byFamily.values()) {
    if (members.length > 1) result = foldOneSequencedFamily(result, members);
  }
  return result;
}

// Force sequenced one-time contributions to the front (player completes them early regardless of optimized resource).
function pullSequencedOneTimeToFront(segments: ApSegment[]): ApSegment[] {
  const isSequencedFinite = (s: ApSegment) => !s.repeatsForever && sequenceKeyOf(s) !== null;
  const front: ApSegment[] = [];
  const rest: ApSegment[] = [];
  for (const s of segments) (isSequencedFinite(s) ? front : rest).push(s);
  // Enforce natural order within each family (round 1, 2, 3...) despite efficiency-based sorting.
  front.sort((a, b) => {
    const ka = sequenceKeyOf(a);
    const kb = sequenceKeyOf(b);
    if (!ka || !kb || ka.family !== kb.family) return 0;
    return ka.order - kb.order;
  });
  return [...front, ...rest];
}

export function buildCumulativeCurve(rawSegments: ApSegment[], maxAp: number): { ap: number; amount: number }[] {
  const segments = pullSequencedOneTimeToFront(foldSequencedFamilies(rawSegments));
  const points: { ap: number; amount: number }[] = [{ ap: 0, amount: 0 }];
  let ap = 0;
  let amount = 0;
  for (const seg of segments) {
    if (ap >= maxAp) break;
    if (seg.repeatsForever) {
      const startAp = ap;
      const rate = seg.amount / seg.apCost;
      // A FirstClear-tagged bonus of this same resource bundled with this segment's very first run — no
      // extra AP cost, so it's added once, right as this segment's tail begins (see extractStageLike).
      amount += seg.firstRunBonusAmount ?? 0;
      for (let i = 1; i <= REPEATING_TAIL_SAMPLE_POINTS; i++) {
        const stepAp = startAp + ((maxAp - startAp) * i) / REPEATING_TAIL_SAMPLE_POINTS;
        points.push({ ap: stepAp, amount: amount + (stepAp - startAp) * rate });
      }
      ap = maxAp;
      amount += (maxAp - startAp) * rate;
      break;
    }
    ap += seg.apCost;
    // firstRunBonusAmount can still be set here on a demoted (foldSequencedFamilies) segment.
    amount += seg.amount + (seg.firstRunBonusAmount ?? 0);
    points.push({ ap: Math.min(ap, maxAp), amount });
  }
  if (ap < maxAp) points.push({ ap: maxAp, amount });
  return points;
}

const has = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : Object.keys(v ?? {}).length > 0 || !!v);

// Cheap presence check across all known data shapes — deliberately skips extractAll/listSelectableResourceKeys,
// since several extractors run real Monte Carlo simulations too expensive to run just to decide tab visibility.
export function hasAnySelectableResourceSource(eventData: EventData): boolean {
  const d = eventData;
  return (
    has(d.stage?.stage) ||
    has(d.stage?.story) ||
    has(d.stage?.challenge) ||
    has(d.shop) ||
    has(d.card_shop) ||
    has(d.box_gacha) ||
    has(d.minigame_defense) ||
    has(d.interactive_world_raid) ||
    has(d.minigame_janken) ||
    has(d.minigame_ccg) ||
    has(d.clue) ||
    has(d.minigame_road_puzzle) ||
    has(d.dice_race) ||
    has(d.treasure) ||
    has(d.concentration) ||
    has(d.minigame_dream) ||
    has(d.fortune_gacha) ||
    has(d.mission) ||
    has(d.minigame_mission) ||
    has(d.field?.FieldQuest) ||
    has(d.field?.FieldMasteryLevel) ||
    has(d.field?.FieldContentStageReward)
  );
}

// Cheap check: does this event have any Monte-Carlo-gated source (see Ctx.includeSimulations)? Lets the UI
// skip the "include simulations" prompt when there's nothing for it to affect.
export function hasSimulatedResourceSource(eventData: EventData): boolean {
  const d = eventData;
  return has(d.dice_race) || has(d.treasure) || has(d.concentration) || has(d.minigame_dream) || has(d.fortune_gacha) || has(d.minigame_road_puzzle);
}

// ---------------------------------------------------------------------------
// Debug: per-source coverage matrix — exists-in-data vs modeled status, for auditing any event.
// ---------------------------------------------------------------------------

export type CoverageStatus = 'modeled' | 'partially_modeled' | 'not_modeled';

export interface SourceCoverageEntry {
  source: string;
  existsInData: boolean;
  status: CoverageStatus;
  note?: string;
}

export function debugSourceCoverage(ctx: Ctx): SourceCoverageEntry[] {
  const d = ctx.eventData;

  return [
    { source: 'stage.stage (farming)', existsInData: has(d.stage?.stage), status: 'modeled' },
    { source: 'stage.story', existsInData: has(d.stage?.story), status: 'modeled' },
    { source: 'stage.challenge', existsInData: has(d.stage?.challenge), status: 'modeled' },
    { source: 'shop (tiered pricing)', existsInData: has(d.shop), status: 'modeled' },
    { source: 'card_shop', existsInData: has(d.card_shop), status: 'modeled' },
    { source: 'box_gacha', existsInData: has(d.box_gacha), status: 'modeled' },
    { source: 'minigame_defense', existsInData: has(d.minigame_defense), status: 'modeled' },
    {
      source: 'interactive_world_raid',
      existsInData: has(d.interactive_world_raid),
      status: 'partially_modeled',
      note: 'Ticket currency id is not in the type, approximated as Currency_4; daily free ticket regen not modeled.',
    },
    { source: 'minigame_janken (stage clear reward)', existsInData: has(d.minigame_janken?.stage), status: 'modeled' },
    {
      source: 'minigame_janken (score ladder)',
      existsInData: has(d.minigame_janken?.reward_score),
      status: 'partially_modeled',
      note: 'Score-per-win has no formula anywhere in the codebase or data (manual player input) — cannot be graphed, shown as an AP-cost-undetermined one-time item instead.',
    },
    {
      source: 'minigame_ccg',
      existsInData: has(d.minigame_ccg),
      status: 'partially_modeled',
      note: 'Assumes 1 play = 1 point (MinPoint maps directly to stage number, reasonable but not independently verified).',
    },
    { source: 'clue_search (round completion reward)', existsInData: has(d.clue?.round), status: 'modeled' },
    { source: 'clue_search (per-clue reward)', existsInData: has(d.clue?.clue), status: 'modeled' },
    {
      source: 'minigame_road_puzzle',
      existsInData: has(d.minigame_road_puzzle),
      status: 'partially_modeled',
      note: "Reuses RoadPuzzlePlanner.tsx's own draw-without-replacement simulation (real per-map tile pool, not a free-choice minimum); gated behind includeSimulations since it is too slow (~2.3s/event) to run automatically.",
    },
    { source: 'dice_race', existsInData: has(d.dice_race), status: 'partially_modeled', note: 'Reuses the existing simulation, average approximation (isApproximated).' },
    { source: 'treasure', existsInData: has(d.treasure), status: 'partially_modeled', note: 'Reuses the existing simulation, assumes full clear + average approximation.' },
    { source: 'concentration (card matching)', existsInData: has(d.concentration), status: 'partially_modeled', note: 'Reuses the existing simulation, average approximation.' },
    { source: 'minigame_dream', existsInData: has(d.minigame_dream), status: 'partially_modeled', note: 'Custom small Monte Carlo over schedule_result.Prob.' },
    {
      source: 'fortune_gacha',
      existsInData: has(d.fortune_gacha),
      status: 'partially_modeled',
      note: "Reuses FortuneGachaPlanner.tsx's own pity-system simulation, average approximation; flavor-only GachaGroup entries excluded.",
    },
    { source: 'mission', existsInData: has(d.mission), status: 'modeled', note: 'AP-independent one-time/free contribution only.' },
    { source: 'minigame_mission', existsInData: has(d.minigame_mission), status: 'modeled', note: 'AP-independent one-time/free contribution only.' },
    { source: 'field.FieldQuest', existsInData: has(d.field?.FieldQuest), status: 'modeled', note: 'AP-independent one-time/free contribution only.' },
    {
      source: 'field.FieldMasteryLevel',
      existsInData: has(d.field?.FieldMasteryLevel),
      status: 'modeled',
      note: 'AP-independent one-time/free contribution only (FieldEventPlanner.tsx has no cost formula for this either).',
    },
    { source: 'field.FieldContentStageReward', existsInData: has(d.field?.FieldContentStageReward), status: 'modeled' },
  ];
}
