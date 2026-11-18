// Resolves AP cost per resource unit. Extract* functions (per-source) + Dijkstra resolution.
import type { ClueSearchData, EventData, Stage, StageReward, MinigameDefenseStage, MinigameJankenStage, MinigameTankStage } from '~/types/plannerData';
import { buildJointCurve, solveJointDetail, type JointClear, type JointColumn, type JointCurvePoint, type JointModel } from './jointGoalCurve';
import { planJointAtAp, type JointStep } from './jointPlan';
import { runSimulation as runDiceRaceSimulation } from '~/features/event-planner/logic/diceRaceSim';
import { runSingleSimulation as runTreasureSimulation } from '~/features/event-planner/logic/treasureSimulation';
import { simulateAverageFlips } from '~/features/event-planner/logic/cardMatchSim';
import { runSimulation as runFortuneGachaSimulation } from '~/features/event-planner/logic/fortuneGachaSim';
import { buildRoundInfos as buildRoadPuzzleRoundInfos, simulateRoadPuzzleMapDraws } from '~/features/event-planner/logic/roadPuzzleSim';
import { calculateExpectedContents } from '~/utils/gachaIcon';
import { DefaultDiceRaceSimConfig, type DiceRaceSimConfig } from '~/types/minigame/diceRace';
import { getStageCost } from '~/types/minigame/fieldEvent';
import type { TotalBonusMap } from '~/features/event-planner/types';
import { solveRoadPuzzle } from '~/features/event-planner/logic/solveRoadPuzzle';
import { ROAD_PUZZLE_MAPS } from '~/data/roadPuzzleMaps';
import { applyRepeatableEventBonus } from '~/features/event-planner/logic/eventBonus';
import { getLocationRows } from '~/features/event-planner/logic/locationPlanner';
import { getClueSearchCostModel, searchesForFragments, type ClueSearchCostModel } from '~/features/event-planner/logic/clueSearch';
import { calcTieredCost } from '~/features/event-planner/logic/shopTieredCost';

const REPEATABLE_TAGS = new Set(['Event', 'Default', 'Rare']);
const AP = 'AP'; // sentinel currency key: raw AP itself.
const HIGH_AREA_FIRST = 9;
const HIGH_AREA_LAST = 12;
const keyOf = (type: string, id: number) => `${type}_${id}`;

// Trailing stage number from a raw internal `Name` codename (e.g. "EVENT_845_Normal_MainGround_Stage02"
// -> "02"), matching the exact idiom RepeatableTab.tsx/OnetimeTab.tsx/MissionPlanner.tsx already use.
const stageNumberFromName = (name: string): string => name.split('_').pop()?.replace('Stage', '') || name;

export type StageWithType = Stage & { type: 'stage' | 'story' | 'challenge' };

// The user's shop purchase plan (item id -> count). When set, finite-limit shop items shrink to exactly the
// planned purchases (after what was already bought) instead of their full limit.
export interface ShopGoals {
  purchaseCounts: Record<string, number>;
  alreadyPurchasedCounts: Record<string, number>;
}

export interface Ctx {
  allStages: StageWithType[];
  eventData: EventData;
  eventId: number;
  totalBonus?: TotalBonusMap;
  // Gates Monte-Carlo extractors (expensive: 1.5-3s+ per event); UI opts in explicitly, not auto on mount.
  includeSimulations?: boolean;
  // Which tile a fixed die targets (user's saved calculator-tab setting); unset = currency-neutral "advance
  // as far as possible" default. Never includes targetLap/endConditionType — the simulated horizon is fixed
  // by the event's own total_reward data, not the user's personal plan (see extractDiceRace).
  diceRaceRouting?: Pick<DiceRaceSimConfig, 'fixedDicePriority' | 'ownedFixedDice' | 'allowDoubleFixedDice'>;
  shopGoals?: ShopGoals;
  // Treat story clears as a mandatory prerequisite of area stages. Off by default: story is cleared for other
  // reasons anyway (pyroxene, minigames) and is not a gate in-game.
  includeStoryClears?: boolean;
  // Repeat farming only areas 9-12 (their by-product top-tier ooparts); lower areas count as a single clear each.
  highAreaFirst?: boolean;
  // Result of computeSimulatedSources, reused so plan-only changes (e.g. shop goals) skip re-simulating.
  simulatedSources?: SimulatedSources;
}

// ---------------------------------------------------------------------------
// Every extractor uses SourceRef (raw fields); only formatSourceLabel converts to display text (called once at end).
// ---------------------------------------------------------------------------

// Collapse enter-cost sources to one shape; category picks prefix, stageNumber is parsed from raw Name.
type StageLikeCategory = 'stage' | 'story' | 'challenge' | 'minigame_defense' | 'janken_story' | 'janken_normal' | 'janken_challenge' | 'minigame_tank';

// Present only when planned purchases drive the shop sources: which purchases (1-based, inclusive) of
// which item this segment covers.
export interface ShopGoalRange {
  itemId: number;
  from: number;
  to: number;
}

export type SourceRef =
  // `oneTimeClear` covers FirstClear and ThreeStar: both one-time, same AP cost, tracked as one bucket.
  // `storyGate`: a story stage that must be cleared before any area stage (user opted in); otherwise story is its own track.
  | { type: 'stage_like'; category: StageLikeCategory; stageNumber?: string; oneTimeClear?: boolean; storyGate?: boolean }
  // Sequenced family prefix spans multiple categories (story gates regular-stage access); list each category's range.
  | { type: 'sequenced_prefix_bulk'; ranges: { category: StageLikeCategory; from: number; to: number }[] }
  | { type: 'minigame_janken_score'; score: number }
  | { type: 'shop_unlimited'; shopId: string; costKey?: string }
  | { type: 'shop_flat_limit'; shopId: string; limit: number; goal?: ShopGoalRange; costKey?: string }
  | { type: 'shop_tier'; shopId: string; tier: number; goal?: ShopGoalRange; costKey?: string }
  | { type: 'card_shop_round'; round: number }
  | { type: 'box_gacha_round'; round: number; repeat?: boolean }
  | { type: 'interactive_world_raid' }
  | { type: 'minigame_ccg_point'; point: number }
  | { type: 'clue_search_round'; round: number }
  | { type: 'clue_search_clue'; round: number; clueId: number }
  | { type: 'road_puzzle_round'; round: number; additional?: boolean }
  | { type: 'road_puzzle_rail_set' }
  | { type: 'dice_race' }
  | { type: 'dice_race_lap'; lap: number }
  | { type: 'treasure' }
  | { type: 'concentration' }
  | { type: 'minigame_dream' }
  | { type: 'fortune_gacha' }
  | { type: 'mission'; category: 'mission' | 'minigame_mission'; daily?: boolean; days?: number }
  | { type: 'field_quest'; daily?: boolean; days?: number }
  | { type: 'field_mastery'; level: number }
  | { type: 'field_stage'; index: number; oneTimeClear?: boolean }
  | { type: 'location_schedule'; rank: number; name: string; runs: number };

type StageLikeSourceRef = Extract<SourceRef, { type: 'stage_like' }>;

const STAGE_LIKE_PREFIX: Record<StageLikeCategory, string> = {
  stage: 'common.stage',
  story: 'game:story',
  challenge: 'common.challenge',
  minigame_defense: 'minigame.minigame_defense',
  janken_story: 'game:story',
  janken_normal: 'game:difficulties.normal',
  janken_challenge: 'common.challenge',
  minigame_tank: 'minigame.minigame_tank',
};

// Format raw stage Name to parsed trailing number (same convention as RepeatableTab.tsx/OnetimeTab.tsx).
export interface SourceLabelKey {
  parts: Array<{ type: 'key' | 'text' | 'resource'; value: string }>;
  params?: Record<string, string | number>;
}

const JANKEN_CATEGORIES: ReadonlySet<StageLikeCategory> = new Set(['janken_story', 'janken_normal', 'janken_challenge']);

// Janken stage names ("story 1") are ambiguous next to regular stages, so they carry the minigame title.
function stageLikePrefixParts(category: StageLikeCategory): Array<{ type: 'key' | 'text'; value: string }> {
  const parts: Array<{ type: 'key' | 'text'; value: string }> = [];
  if (JANKEN_CATEGORIES.has(category)) parts.push({ type: 'key', value: 'minigame_janken.title' }, { type: 'text', value: ' ' });
  parts.push({ type: 'key', value: STAGE_LIKE_PREFIX[category] });
  return parts;
}

// A shop is named after the currency it takes; the shop id only stands in when that currency is unknown.
function shopNameParts(source: { shopId: string; costKey?: string }): SourceLabelKey['parts'] {
  return source.costKey
    ? [{ type: 'resource', value: source.costKey }]
    : [
        { type: 'key', value: 'common.shop' },
        { type: 'text', value: ` (${source.shopId})` },
      ];
}

function formatSourceLabel(source: SourceRef): SourceLabelKey {
  switch (source.type) {
    case 'stage_like': {
      const parts = stageLikePrefixParts(source.category);
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
        parts.push(...stageLikePrefixParts(r.category));
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
          { type: 'key', value: 'minigame_janken.title' },
          { type: 'text', value: ' ' },
          { type: 'key', value: 'label.cumulativeRewards' },
          { type: 'text', value: ' {{score}}' },
        ],
        params: { score: source.score.toLocaleString() },
      };
    case 'shop_unlimited':
      return {
        parts: [...shopNameParts(source), { type: 'key', value: 'ui.resourceEfficiencyShopUnlimited' }],
        params: { shopId: source.shopId },
      };
    case 'shop_flat_limit':
      return {
        parts: [...shopNameParts(source), { type: 'key', value: source.goal ? 'ui.resourceEfficiencyShopPurchase' : 'ui.resourceEfficiencyShopLimit' }],
        params: source.goal ? { shopId: source.shopId, from: source.goal.from, to: source.goal.to } : { shopId: source.shopId, limit: source.limit },
      };
    case 'shop_tier':
      return {
        parts: [...shopNameParts(source), { type: 'key', value: source.goal ? 'ui.resourceEfficiencyShopTierPurchase' : 'ui.resourceEfficiencyShopTier' }],
        params: source.goal ? { shopId: source.shopId, tier: source.tier, from: source.goal.from, to: source.goal.to } : { shopId: source.shopId, tier: source.tier },
      };
    case 'card_shop_round':
      return {
        parts: [{ type: 'key', value: 'cardShop.title' }],
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
          { type: 'text', value: ' (post-completion tail, simulation average approximation)' },
        ],
      };
    case 'dice_race_lap':
      return {
        parts: [
          { type: 'key', value: 'dice_race.title' },
          { type: 'text', value: ' lap {{lap}} (simulation average approximation)' },
        ],
        params: { lap: source.lap },
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
    case 'location_schedule':
      return { parts: [{ type: 'text', value: `Schedule rank ${source.rank} · ${source.name} (${source.runs} runs)` }] };
  }
}

// ---------------------------------------------------------------------------
// Resource cost types used by the UI.
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
  // Internal: the mandatory-prefix stage clears (e.g. "stage 1-12 + story 1-11 once") a one-off contribution's
  // AP pays for — see PrefixClears. Two contributions drawing on overlapping clears share those clears' AP.
  prefixClears?: PrefixClears;
}

// Stage clear id (see stageClearIdOf) → AP of that one clear. A contribution's AP beyond the sum of its clears
// is its own extra cost; the clears themselves are charged only once across every contribution that uses them.
export type PrefixClears = Record<string, number>;

export interface OneTimeContribution {
  amount: number;
  apCost?: number;
  source: SourceRef;
  sourceLabel: SourceLabelKey;
  prefixClears?: PrefixClears;
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
  prefixClears?: PrefixClears;
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
      const isRepeatable = REPEATABLE_TAGS.has(r.RewardTagStr);
      // Event bonus only boosts repeatable-tag farming stages (mirrors FarmingPlanner.tsx eligibility). The game rounds
      // the bonus of a single drop up, so it is applied to the whole drop amount before the drop chance weights it.
      let perDrop = r.RewardAmount;
      if (isRepeatable && entry.bonusEligible && eventCurrencyIds.has(r.RewardId)) {
        const bonusPercent = ctx.totalBonus?.[r.RewardId] || 0;
        perDrop = applyRepeatableEventBonus(perDrop, bonusPercent);
      }
      const amount = perDrop * (r.RewardProb / 10000);
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

// Older event layouts keep some area stages (e.g. Hard stage 4/8/12) in the "else" group. They are part of the same
// 1..N clear order, so include them unless the area list already has that stage number.
function legacyAreaStages(ctx: Ctx): StageWithType[] {
  const have = new Set(ctx.allStages.filter((s) => s.type === 'stage').map((s) => stageNumberFromName(s.Name)));
  return (ctx.eventData.stage?.else ?? []).filter((s) => /_Hard_Main_Stage\d+$/.test(s.Name) && !have.has(stageNumberFromName(s.Name))).map((s) => ({ ...s, type: 'stage' as const }));
}

function extractStage(ctx: Ctx): Extracted {
  const entries = [...ctx.allStages, ...legacyAreaStages(ctx)].map((s) => ({
    source: { type: 'stage_like' as const, category: s.type, stageNumber: stageNumberFromName(s.Name), ...(s.type === 'story' && ctx.includeStoryClears ? { storyGate: true } : {}) },
    costKey: AP,
    costAmount: s.StageEnterCostAmount,
    rewards: s.EventContentStageReward,
    bonusEligible: s.type === 'stage',
  }));
  const extracted = extractStageLike(entries, ctx);
  if (!ctx.highAreaFirst) return extracted;
  // Outside areas 9-12 a stage is cleared once (prerequisite + first-clear bonuses) but never farmed, so its
  // single-run yield becomes a one-time contribution instead of a repeatable segment.
  const segments: RawSegment[] = [];
  const oneTime = [...extracted.oneTime];
  for (const seg of extracted.segments) {
    const area = seg.source.type === 'stage_like' && seg.source.category === 'stage' ? Number(seg.source.stageNumber) : NaN;
    if (seg.source.type !== 'stage_like' || Number.isNaN(area) || (area >= HIGH_AREA_FIRST && area <= HIGH_AREA_LAST)) {
      segments.push(seg);
      continue;
    }
    oneTime.push({
      producesKey: seg.producesKey,
      amount: seg.amount + (seg.firstRunBonusAmount ?? 0),
      costKey: seg.costKey,
      costAmount: seg.costAmount,
      source: { ...seg.source, oneTimeClear: true },
    });
  }
  return { segments, oneTime };
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

// minigame_tank stages: entry cost is per-stage CostParcel (event token), same FirstClear-vs-repeatable split.
// The time-attack stage has no cost and no rewards, so it is skipped.
function extractMinigameTank(ctx: Ctx): Extracted {
  const tank = ctx.eventData.minigame_tank;
  if (!tank) return { segments: [], oneTime: [] };
  const entries = tank.stage
    .filter((s: MinigameTankStage) => (s.EventContentStageReward?.length ?? 0) > 0)
    .map((s: MinigameTankStage) => ({
      source: { type: 'stage_like' as const, category: 'minigame_tank' as const, stageNumber: String(s.StageNumber) },
      costKey: keyOf(s.CostParcelTypeStr, s.CostParcelId),
      costAmount: s.CostParcelAmount,
      rewards: s.EventContentStageReward ?? [],
    }));
  return extractStageLike(entries, ctx);
}

// ---------------------------------------------------------------------------
// Extraction: shop (tiered pricing), card_shop (exact expectation), box_gacha (deterministic rounds).
// ---------------------------------------------------------------------------

function extractShop(ctx: Ctx): Extracted {
  const shop = ctx.eventData.shop;
  if (!shop) return { segments: [], oneTime: [] };
  const goals = ctx.shopGoals;
  const segments: RawSegment[] = [];
  // Currencies some shop item is bought with. An item that yields one is an exchange route the rate map needs
  // to price that currency in AP, so it stays available in full unless the user planned a count for it.
  const spentKeys = new Set<string>();
  if (goals) {
    for (const items of Object.values(shop)) {
      for (const item of items) for (const goods of item.Goods || []) spentKeys.add(keyOf(goods.ConsumeParcelTypeStr[0], goods.ConsumeParcelId[0]));
    }
  }
  for (const [shopId, items] of Object.entries(shop)) {
    for (const item of items) {
      // Purchases covered by this item: [start, end). Without goals it is the whole limit; unlimited items
      // (`PurchaseCountLimit === 0`, confirmed against live shop data) have no end.
      let start = 0;
      let end: number | undefined = item.PurchaseCountLimit || undefined;
      // Unlimited items are exchange routes (the rate map needs them), so goals only narrow finite ones.
      let goalLimited = false;
      if (goals && item.PurchaseCountLimit) {
        const goal = goals.purchaseCounts[item.Id] ?? 0;
        const isExchange = (item.Goods || []).some((g) => g.ParcelId.some((pid, i) => spentKeys.has(keyOf(g.ParcelTypeStr[i], pid))));
        if (goal > 0 || !isExchange) {
          start = goals.alreadyPurchasedCounts[item.Id] ?? 0;
          const count = Math.min(goal, item.PurchaseCountLimit - start);
          if (count <= 0) continue;
          end = start + count;
          goalLimited = true;
        }
      }
      const range = (from: number, to: number): ShopGoalRange | undefined => (goalLimited ? { itemId: item.Id, from: from + 1, to } : undefined);
      for (const goods of item.Goods || []) {
        const costKey = keyOf(goods.ConsumeParcelTypeStr[0], goods.ConsumeParcelId[0]);
        const baseAmount = goods.ConsumeParcelAmount[0];
        const extraStep = goods.ConsumeExtraStep || [];
        const extraAmount = goods.ConsumeExtraAmount || [];
        goods.ParcelId.forEach((pid, idx) => {
          const producesKey = keyOf(goods.ParcelTypeStr[idx], pid);
          const amount = goods.ParcelAmount[idx];
          if (amount <= 0) return;
          if (end === undefined) {
            const finalPrice = extraStep.length > 0 ? extraAmount[extraAmount.length - 1] : baseAmount;
            segments.push({ costKey, costAmount: finalPrice, producesKey, amount, source: { type: 'shop_unlimited', shopId, costKey }, repeatsForever: true });
            return;
          }
          if (extraStep.length === 0) {
            // Flat price for the whole range — one aggregated segment.
            const units = end - start;
            segments.push({
              costKey,
              costAmount: baseAmount * units,
              producesKey,
              amount: amount * units,
              source: { type: 'shop_flat_limit', shopId, limit: item.PurchaseCountLimit || units, goal: range(start, end), costKey },
            });
            return;
          }
          // Tiered price over [start, end) — one segment per tier (not per unit).
          let tierStart = 0;
          let covered = start;
          for (let i = 0; i < extraStep.length && covered < end; i++) {
            const tierEnd = tierStart + extraStep[i];
            const segEnd = Math.min(tierEnd, end);
            if (segEnd > covered) {
              const units = segEnd - covered;
              segments.push({
                costKey,
                costAmount: extraAmount[i] * units,
                producesKey,
                amount: amount * units,
                source: { type: 'shop_tier', shopId, tier: i + 1, goal: range(covered, segEnd), costKey },
              });
              covered = segEnd;
            }
            tierStart = tierEnd;
          }
          if (covered < end) {
            const units = end - covered;
            segments.push({
              costKey,
              costAmount: extraAmount[extraAmount.length - 1] * units,
              producesKey,
              amount: amount * units,
              source: { type: 'shop_tier', shopId, tier: extraStep.length + 1, goal: range(covered, end), costKey },
            });
          }
        });
      }
    }
  }
  return { segments, oneTime: [] };
}

/**
 * Currency spent by the planned shop purchases, keyed like segment cost keys (e.g. "Item_23").
 * Mirrors the planner's own shop totals: first goods entry, tiered pricing after already-bought items.
 */
export function computeShopGoalConsumption(eventData: EventData, goals: ShopGoals): Record<string, number> {
  const consumption: Record<string, number> = {};
  if (!eventData.shop) return consumption;
  for (const items of Object.values(eventData.shop)) {
    for (const item of items) {
      const goods = item.Goods?.[0];
      if (!goods) continue;
      const already = goals.alreadyPurchasedCounts[item.Id] ?? 0;
      const remaining = item.PurchaseCountLimit ? item.PurchaseCountLimit - already : Infinity;
      const count = Math.min(goals.purchaseCounts[item.Id] ?? 0, remaining);
      if (count <= 0) continue;
      const cost = calcTieredCost(already, count, goods.ConsumeExtraStep ?? [], goods.ConsumeExtraAmount ?? [], goods.ConsumeParcelAmount[0]);
      const costKey = keyOf(goods.ConsumeParcelTypeStr[0], goods.ConsumeParcelId[0]);
      consumption[costKey] = (consumption[costKey] ?? 0) + cost;
    }
  }
  return consumption;
}

function extractCardShop(ctx: Ctx): Extracted {
  const cardShop = ctx.eventData.card_shop;
  if (!cardShop || cardShop.length === 0) return { segments: [], oneTime: [] };
  const costGoods = cardShop[0].CostGoods;
  const costKey = keyOf('Item', costGoods.ConsumeParcelId[0]);
  // One play follows the "reset on SR" strategy: flip n draws from refresh group n, and the play ends at the first
  // SR or better (rarity >= 2). Flip n is reached only when every earlier flip was below SR, which gives the exact
  // expected cost and reward of a play without simulating it.
  const groupCount = Math.max(...cardShop.map((c) => c.RefreshGroup));
  let reach = 1;
  let expectedCost = 0;
  const expectedReward = new Map<string, number>();
  for (let flip = 0; flip < costGoods.ConsumeExtraAmount.length && flip < groupCount; flip++) {
    const pool = cardShop.filter((c) => c.RefreshGroup === flip + 1);
    const totalProb = pool.reduce((sum, c) => sum + c.Prob, 0);
    if (totalProb <= 0) continue;
    expectedCost += reach * costGoods.ConsumeExtraAmount[flip];
    for (const card of pool) {
      const weighted = card.RewardParcelAmount.map((a) => (a * reach * card.Prob) / totalProb);
      for (const { producesKey, amount } of parcelRewards(card.RewardParcelId, card.RewardParcelTypeStr, weighted, ctx.eventData)) {
        expectedReward.set(producesKey, (expectedReward.get(producesKey) ?? 0) + amount);
      }
    }
    reach *= 1 - pool.filter((c) => c.Rarity >= 2).reduce((sum, c) => sum + c.Prob, 0) / totalProb;
  }
  const segments: RawSegment[] = [];
  // A play can be repeated without end.
  emitSegments(
    segments,
    costKey,
    expectedCost,
    [...expectedReward].map(([producesKey, amount]) => ({ producesKey, amount })),
    { type: 'card_shop_round', round: 1 },
    { repeatsForever: true },
  );
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
  // A box can't be drawn selectively: one round costs every slot's draw (draw price x GroupElementAmount, summed)
  // and yields every slot's reward x its count — same whole-box unit as BoxGachaPlanner.tsx's boxContents.
  const byRound = new Map<number, { costKey: string; cost: number; rewards: Map<string, number> }>();
  for (const item of boxGacha.shop) {
    for (const g of item.Goods) {
      const costKey = keyOf(g.ConsumeParcelTypeStr[0], g.ConsumeParcelId[0]);
      const round = byRound.get(item.Round) ?? { costKey, cost: 0, rewards: new Map<string, number>() };
      byRound.set(item.Round, round);
      round.cost += g.ConsumeParcelAmount[0] * item.GroupElementAmount;
      const slotAmounts = g.ParcelAmount.map((amount) => amount * item.GroupElementAmount);
      for (const { producesKey, amount } of parcelRewards(g.ParcelId, g.ParcelTypeStr, slotAmounts, ctx.eventData)) {
        round.rewards.set(producesKey, (round.rewards.get(producesKey) ?? 0) + amount);
      }
    }
  }
  for (const [roundNum, { costKey, cost, rewards }] of byRound) {
    const repeatsForever = loopByRound.get(roundNum);
    const rewardList = [...rewards].map(([producesKey, amount]) => ({ producesKey, amount }));
    emitSegments(segments, costKey, cost, rewardList, { type: 'box_gacha_round', round: roundNum, repeat: repeatsForever }, { repeatsForever });
  }
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
  const validItems = ccg.reward_item.filter((item) => item.MinPoint > 0);
  if (validItems.length === 0) return { segments: [], oneTime: [] };

  // The entry fee is flat per run, not per point — a single run reaching a deep stage grants every
  // threshold reward up to that point cumulatively, and the whole run repeats indefinitely (farmable,
  // eventually sweepable once the max stage is cleared once). Model the full-clear run: merge every
  // threshold's reward by producesKey and charge one flat entry fee, repeating forever.
  const merged = new Map<string, number>();
  for (const item of validItems) {
    for (const { producesKey, amount } of expandGachaGroupReward(keyOf(item.RewardParcelTypeStr, item.RewardParcelId), item.RewardParcelAmount, ctx.eventData)) {
      merged.set(producesKey, (merged.get(producesKey) ?? 0) + amount);
    }
  }
  const maxPoint = Math.max(...validItems.map((item) => item.MinPoint));
  const segments: RawSegment[] = [];
  emitSegments(
    segments,
    costKey,
    info.CostParcelAmount,
    [...merged].map(([producesKey, amount]) => ({ producesKey, amount })),
    { type: 'minigame_ccg_point', point: maxPoint },
    { repeatsForever: true, isApproximated: true },
  );
  return { segments, oneTime: [] };
}

function extractClueSearch(ctx: Ctx): Extracted {
  const clue = ctx.eventData.clue;
  if (!clue) return { segments: [], oneTime: [] };
  const searchModel = getClueSearchCostModel(clue);
  if (searchModel) return extractClueSearchBySearch(ctx, clue, searchModel);
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

// Search-based clue events: fragments come from currency-priced searches (leftovers swap 1:1 via
// the shop token), so one round's fragments, its completion reward and every per-fragment reward
// are all bought by the same searches. Each round is charged the marginal searches it adds on top
// of the previous rounds, since deduction points (inspiration) carry over between rounds.
function extractClueSearchBySearch(ctx: Ctx, clue: ClueSearchData, model: ClueSearchCostModel): Extracted {
  const segments: RawSegment[] = [];
  let fragmentsSoFar = 0;
  let searchesSoFar = 0;
  for (const round of [...clue.round].sort((a, b) => a.Round - b.Round)) {
    fragmentsSoFar += round.ClueCostAmount.reduce((a, b) => a + b, 0);
    const searches = searchesForFragments(fragmentsSoFar, model.inspirationConvertCount);
    const roundSearches = searches - searchesSoFar;
    searchesSoFar = searches;

    const rewards = parcelRewards(round.Reward.RewardParcelId, round.Reward.RewardParcelTypeStr, round.Reward.RewardParcelAmount, ctx.eventData);
    round.ClueId.forEach((clueId, slotIdx) => {
      const clueDef = clue.clue.find((c) => c.ClueId === clueId);
      if (!clueDef) return;
      clueDef.RewardParcelId.forEach((pid, rewardIdx) => {
        rewards.push(...expandGachaGroupReward(keyOf(clueDef.RewardParcelTypeStr[rewardIdx], pid), clueDef.RewardParcelAmount[rewardIdx] * round.ClueCostAmount[slotIdx], ctx.eventData));
      });
    });
    const merged = new Map<string, number>();
    for (const { producesKey, amount } of rewards) merged.set(producesKey, (merged.get(producesKey) ?? 0) + amount);

    emitSegments(
      segments,
      model.costKey,
      roundSearches * model.costPerSearch,
      [...merged].map(([producesKey, amount]) => ({ producesKey, amount })),
      { type: 'clue_search_round', round: round.Round },
      { repeatsForever: round.IsLoop },
    );
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

// Laps simulated past the last total_reward milestone, to sample the post-completion steady-state rate.
const DICE_RACE_TAIL_LAPS = 200;

function extractDiceRace(ctx: Ctx): Extracted {
  const diceRace = ctx.eventData.dice_race;
  const currency = ctx.eventData.currency;
  if (!diceRace || !currency) return { segments: [], oneTime: [] };
  // Horizon is fixed by the event's own data (last total_reward milestone), never the user's personal
  // targetLap plan — this is an efficiency (ratio) calculator, not "how much do I get with my plan".
  const milestones = [...new Set(diceRace.total_reward.map((r) => r.RequiredLapFinishCount))].sort((a, b) => a - b);
  if (milestones.length === 0) return { segments: [], oneTime: [] };
  const maxLap = milestones[milestones.length - 1];
  const boardSize = diceRace.race_node.length;
  // Routing (which tile a fixed die targets) comes from the user's saved calculator-tab setting; unset
  // defaults to a currency-neutral "always advance as far as possible" strategy (every tile eligible).
  const routing = ctx.diceRaceRouting ?? { fixedDicePriority: Array.from({ length: boardSize }, (_, i) => i), ownedFixedDice: DefaultDiceRaceSimConfig.ownedFixedDice };
  const simConfig = { ...DefaultDiceRaceSimConfig, ...routing, simRuns: 300, startLap: 1, targetLap: maxLap + DICE_RACE_TAIL_LAPS };
  // Single continuous simulation (lap 1 -> maxLap + tail) so fixed-dice/position state carries naturally
  // from the completion phase into the tail phase, instead of resetting on a second simulation call.
  const result = runDiceRaceSimulation(diceRace, simConfig, { ...ctx.eventData, dice_race: diceRace, currency }, { checkpoints: milestones });
  const costEntries = Object.entries(result.avgCost);
  if (costEntries.length === 0) return { segments: [], oneTime: [] };
  const [costKey] = costEntries[0];

  // Baseline is tracked per producesKey (last lap THAT key actually increased at), not one shared baseline
  // across all keys — a key that's silent for several laps (e.g. only total_reward's lap 6, nothing at
  // laps 2-5) must still charge the full cumulative ticket cost since its last occurrence (lap 1 is
  // unreachable here, so that's cost since the very start): laps can't be skipped to reach a later one, so
  // the cost of passing through silent laps is a real, unavoidable part of getting that key's reward.
  const segments: RawSegment[] = [];
  const prevCostByKey = new Map<string, number>();
  const prevAmountByKey = new Map<string, number>();
  for (const lap of milestones) {
    const snapshot = result.checkpoints[lap];
    if (!snapshot) continue; // never reached within targetLap in any run (e.g. lap 1 itself, since currentLap starts there rather than being reached by increment)
    const cumulativeCost = snapshot.avgCost[costKey] ?? 0;
    for (const [producesKey, cumulativeAmount] of Object.entries(snapshot.avgRewards)) {
      const amount = cumulativeAmount - (prevAmountByKey.get(producesKey) ?? 0);
      if (amount > 0) {
        const costDelta = cumulativeCost - (prevCostByKey.get(producesKey) ?? 0);
        segments.push({ costKey, costAmount: costDelta, producesKey, amount, source: { type: 'dice_race_lap', lap }, isApproximated: true });
        prevCostByKey.set(producesKey, cumulativeCost);
        prevAmountByKey.set(producesKey, cumulativeAmount);
      }
    }
  }

  // Tail: steady per-roll rate for any budget beyond maxLap, sampled from the same continuous run.
  const finalSnapshot = result.checkpoints[maxLap];
  if (finalSnapshot) {
    const tailCost = (result.avgCost[costKey] ?? 0) - (finalSnapshot.avgCost[costKey] ?? 0);
    if (tailCost > 0) {
      for (const [producesKey, finalAmount] of Object.entries(result.avgRewards)) {
        const amount = (finalAmount - (finalSnapshot.avgRewards[producesKey] ?? 0)) / DICE_RACE_TAIL_LAPS;
        if (amount > 0) segments.push({ costKey, costAmount: tailCost / DICE_RACE_TAIL_LAPS, producesKey, amount, source: { type: 'dice_race' }, repeatsForever: true, isApproximated: true });
      }
    }
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

function extractLocation(ctx: Ctx): Extracted {
  const location = ctx.eventData.location;
  const info = location?.info[0];
  if (!location || !info || info.ScheduleEventPointCostParcelAmount <= 0) return EMPTY_EXTRACTED;
  const ranks = getLocationRows(location);
  const bestByRank = ranks.map((rank) => {
    const best = new Map<string, { amount: number; name: string }>();
    for (const row of rank.rows) {
      const rewards = expandGachaGroupRewards(
        row.rewards.map((reward) => ({ producesKey: reward.key, amount: reward.expected })),
        ctx.eventData,
      );
      for (const reward of rewards) {
        if (reward.amount > (best.get(reward.producesKey)?.amount ?? 0)) best.set(reward.producesKey, { amount: reward.amount, name: row.name });
      }
    }
    return best;
  });
  const costKey = keyOf(info.ScheduleEventPointCostParcelTypeStr, info.ScheduleEventPointCostParcelId);
  const costPerRun = info.ScheduleEventPointCostParcelAmount;
  const resourceKeys = new Set(bestByRank.flatMap((best) => [...best.keys()]));
  const segments: RawSegment[] = [];
  for (const producesKey of resourceKeys) {
    let pendingCost = 0;
    for (const [index, rank] of ranks.entries()) {
      const runs = rank.requiredRuns ?? 1;
      pendingCost += runs * costPerRun;
      const best = bestByRank[index].get(producesKey);
      if (!best) continue;
      const source: SourceRef = { type: 'location_schedule', rank: rank.rank, name: best.name, runs };
      segments.push({ costKey, costAmount: pendingCost, producesKey, amount: best.amount * runs, source });
      pendingCost = 0;
      if (rank.requiredRuns === null) {
        segments.push({ costKey, costAmount: costPerRun, producesKey, amount: best.amount, source: { ...source, runs: 1 }, repeatsForever: true });
      }
    }
  }
  return { segments, oneTime: [] };
}

// Opaque handle for the Monte-Carlo-based extraction result; depends on totalBonus + diceRaceRouting only.
export type SimulatedSources = Extracted;

export function computeSimulatedSources(ctx: Ctx): SimulatedSources {
  return merge(extractRoadPuzzle(ctx), extractDiceRace(ctx), extractTreasure(ctx), extractConcentration(ctx), extractMinigameDream(ctx), extractFortuneGacha(ctx));
}

function extractAll(ctx: Ctx): Extracted {
  // Monte-Carlo-simulation-based extractors only run when explicitly opted into (see Ctx.includeSimulations)
  // — road_puzzle alone measured ~2.3s per event, far too slow to run on every render/tab-open.
  const simulated = ctx.includeSimulations ? (ctx.simulatedSources ?? computeSimulatedSources(ctx)) : EMPTY_EXTRACTED;
  return merge(
    extractStage(ctx),
    extractMinigameDefense(ctx),
    extractShop(ctx),
    extractCardShop(ctx),
    extractBoxGacha(ctx),
    extractInteractiveWorldRaid(ctx),
    extractMinigameJanken(ctx),
    extractMinigameTank(ctx),
    extractMinigameCcg(ctx),
    extractClueSearch(ctx),
    simulated,
    extractMissions(ctx),
    extractField(ctx),
    extractLocation(ctx),
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
  if (o.costKey === undefined) return { amount: o.amount, source: o.source, sourceLabel, prefixClears: o.prefixClears };
  const rate = o.costKey === AP ? 1 : rateMap.get(o.costKey);
  if (rate === undefined) return null;
  const apCost = rate * (o.costAmount ?? 0);
  return { amount: o.amount, apCost, source: o.source, sourceLabel, prefixClears: o.prefixClears };
}

// Resolves one-time amounts at any chain depth, including recursive currency exchanges.
// Handles firstRunBonusAmount correctly via sequencedFamilyPrefix.
function sequencedFamilyPrefix(
  extracted: Extracted,
  chosenEdge: ReadonlyMap<string, RawSegment>,
  currencyKey: string,
): { amount: number; apCost: number; segMembers: Set<RawSegment>; oneTimeMembers: Set<RawOneTime>; bulkSource: SourceRef; prefixClears: PrefixClears | undefined } | null {
  const chosen = chosenEdge.get(currencyKey);
  if (!chosen) return null;
  // costAmount is summed below as if it were AP — only true for AP-costed chains (e.g. stage_like, whose
  // costKey is always AP). A family whose cost is itself another currency (e.g. minigame_ccg_point, paid
  // in its own event currency) would have that currency amount misread as an AP total.
  if (chosen.costKey !== AP) return null;
  const family = sequenceFamilyOf(chosen.source);
  const chosenOrder = sequenceOrderOf(chosen.source);
  if (family === null || chosenOrder === null) return null;

  const segMembers = extracted.segments.filter((s) => s.producesKey === currencyKey && sequenceFamilyOf(s.source) === family && (sequenceOrderOf(s.source) as number) <= chosenOrder);
  const oneTimeMembers = extracted.oneTime.filter((o) => o.producesKey === currencyKey && sequenceFamilyOf(o.source) === family && (sequenceOrderOf(o.source) as number) <= chosenOrder);
  const amount = segMembers.reduce((a, s) => a + s.amount + (s.firstRunBonusAmount ?? 0), 0) + oneTimeMembers.reduce((a, o) => a + o.amount, 0);
  const memberApCost = segMembers.reduce((a, s) => a + s.costAmount, 0) + oneTimeMembers.reduce((a, o) => a + (o.costAmount ?? 0), 0);

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
  // The exact stage clears this prefix investment consists of, so that other one-off bonuses drawing on the same
  // or overlapping clears (e.g. one via this currency, another via a shop chain funded by a different byproduct
  // currency of the same clears) share those clears' AP instead of each re-charging it — see PrefixClears.
  const prefixClears: PrefixClears = {};
  for (const m of [...segMembers, ...oneTimeMembers]) {
    const clearId = stageClearIdOf(m.source);
    if (clearId !== null) prefixClears[clearId] = m.costAmount ?? 0;
  }
  // Earlier clears that drop none of this currency are still required to reach the chosen stage — charge them too.
  let gapApCost = 0;
  for (const [clearId, info] of familyClearCosts(extracted, family)) {
    if (info.order >= chosenOrder || clearId in prefixClears) continue;
    prefixClears[clearId] = info.apCost;
    gapApCost += info.apCost;
  }

  return {
    amount,
    apCost: memberApCost + gapApCost,
    segMembers: new Set(segMembers),
    oneTimeMembers: new Set(oneTimeMembers),
    bulkSource,
    prefixClears: Object.keys(prefixClears).length > 0 ? prefixClears : undefined,
  };
}

function stageClearIdOf(source: SourceRef): string | null {
  return source.type === 'stage_like' && source.stageNumber !== undefined ? `${source.category}:${source.stageNumber}` : null;
}

// AP of every AP-costed clear in a sequenced family (any resource it drops), keyed by clear id. Clearing stage N
// requires clearing 1..N-1 whether or not those drop the resource being priced, so their AP is a real prerequisite.
function familyClearCosts(extracted: Extracted, family: string): Map<string, { order: number; apCost: number; source: StageLikeSourceRef }> {
  const costs = new Map<string, { order: number; apCost: number; source: StageLikeSourceRef }>();
  const consider = (source: SourceRef, costKey: string | undefined, costAmount: number | undefined): void => {
    if (source.type !== 'stage_like' || costKey !== AP || costAmount === undefined || sequenceFamilyOf(source) !== family) return;
    const clearId = stageClearIdOf(source);
    const order = sequenceOrderOf(source);
    if (clearId === null || order === null || costs.has(clearId)) return;
    costs.set(clearId, { order, apCost: costAmount, source: { type: 'stage_like', category: source.category, stageNumber: source.stageNumber, ...(source.storyGate ? { storyGate: true } : {}) } });
  };
  for (const s of extracted.segments) consider(s.source, s.costKey, s.costAmount);
  for (const o of extracted.oneTime) consider(o.source, o.costKey, o.costAmount);
  return costs;
}

const sumClears = (clears: PrefixClears | undefined): number => Object.values(clears ?? {}).reduce((a, v) => a + v, 0);

// AP of several one-off contributions done together: every distinct prefix clear is paid once, plus whatever AP
// each contribution carries beyond its own clears. A contribution holding only a share of its prefix's AP (a pool
// split across shop tiers) has no such extra, so it still costs its full prefix — the clears are all-or-nothing.
function combinePrefixCost(entries: { apCost?: number; prefixClears?: PrefixClears }[]): { apCost: number; prefixClears: PrefixClears | undefined } {
  const union: PrefixClears = {};
  let extra = 0;
  for (const e of entries) {
    extra += Math.max(0, (e.apCost ?? 0) - sumClears(e.prefixClears));
    Object.assign(union, e.prefixClears);
  }
  const hasClears = Object.keys(union).length > 0;
  return { apCost: extra + sumClears(union), prefixClears: hasClears ? union : undefined };
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
  const bulk: RawOneTime[] =
    !isTopLevel && prefix && prefix.amount > 0
      ? [{ producesKey: currencyKey, amount: prefix.amount, costKey: AP, costAmount: prefix.apCost, source: prefix.bulkSource, prefixClears: prefix.prefixClears }]
      : [];

  // Group by costKey (tiered shop items are several separate segments, one per tier — e.g.
  // shop_flat_limit). Skip skipCostKeys to avoid double-counting (already folded into target's own segments).
  const edgesByCostKey = new Map<string, RawSegment[]>();
  for (const s of extracted.segments) {
    if (s.producesKey !== currencyKey || s.costKey === AP || s.costAmount <= 0) continue;
    if (isTopLevel && skipCostKeys.has(s.costKey)) continue;
    const list = edgesByCostKey.get(s.costKey);
    if (list) list.push(s);
    else edgesByCostKey.set(s.costKey, [s]);
  }
  const chained: RawOneTime[] = [];
  for (const [costKey, edges] of edgesByCostKey) {
    // Best-rate tier first — an upstream one-time pool can only convert at a tier's rate up to that
    // tier's own capacity (its costAmount), then spills over into the next-best tier. Applying the best
    // tier's rate to the whole pool (as if that tier had unlimited capacity) overstates the conversion.
    const sortedEdges = [...edges].sort((a, b) => b.amount / b.costAmount - a.amount / a.costAmount);
    for (const upstream of collectCurrencyOneTime(extracted, chosenEdge, costKey, false, nextVisited)) {
      let remaining = upstream.amount;
      for (const edge of sortedEdges) {
        if (remaining <= 0) break;
        // A repeatsForever edge (e.g. a farmable stage) has no capacity cap — it alone absorbs the rest
        // of the pool at its rate, same as the old single-best-edge behavior. Only finite/limited edges
        // (e.g. a capped shop tier) are capped at their own costAmount before spilling to the next tier.
        const used = edge.repeatsForever ? remaining : Math.min(remaining, edge.costAmount);
        const share = used / upstream.amount;
        chained.push({
          producesKey: currencyKey,
          amount: used * (edge.amount / edge.costAmount),
          costKey: upstream.costKey,
          costAmount: upstream.costAmount !== undefined ? upstream.costAmount * share : undefined,
          source: upstream.source,
          prefixClears: upstream.prefixClears,
        });
        remaining -= used;
      }
      // Any pool amount beyond what the available tiers can absorb goes unconverted (left as unused stock).
    }
  }

  return [...direct, ...bundled, ...bulk, ...chained];
}

// Group segments by consumption order within families (never across different families, even with same SourceRef shape).
function sequenceFamilyOf(source: SourceRef): string | null {
  switch (source.type) {
    case 'stage_like':
      if (source.stageNumber === undefined) return null;
      // Story joins the stage family only when opted in as a prerequisite (storyGate); challenge is always separate.
      return source.category === 'story' && source.storyGate ? 'stage_like:stage' : `stage_like:${source.category}`;
    case 'clue_search_round':
    case 'clue_search_clue':
      return 'clue_search';
    case 'road_puzzle_round':
    case 'card_shop_round':
    case 'box_gacha_round':
    case 'minigame_ccg_point':
    case 'location_schedule':
    case 'dice_race_lap':
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
    case 'location_schedule':
      return source.rank;
    case 'dice_race_lap':
      return source.lap;
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
): { segments: ApSegment[]; freeOneTime: OneTimeContribution[]; nettedCostKeys: Set<string> } {
  const byCostKey = new Map<string, RawSegment[]>();
  for (const s of rawSegments) {
    if (s.costKey === AP) continue;
    if (!byCostKey.has(s.costKey)) byCostKey.set(s.costKey, []);
    byCostKey.get(s.costKey)?.push(s);
  }

  const discountedCostAmount = new Map<RawSegment, number>();
  const extraApCost = new Map<RawSegment, number>();
  const extraApClears = new Map<RawSegment, PrefixClears | undefined>();
  // Unordered (capacity-tiered) groups only: a segment fully covered by the pool has both its own cost AND
  // its share of the pool AP attributed elsewhere (see below), which would otherwise leave it at apCost 0
  // and drop it entirely — leftoverAmount/freeBonusSegments route its output through the merged bonus instead.
  const leftoverAmount = new Map<RawSegment, number>();
  const freeBonusSegments: ApSegment[] = [];
  // A pool made only of free (no-AP) entries — its converted output is free too, so it's a free one-time
  // contribution rather than a segment (a segment needs apCost > 0).
  const freeOneTime: OneTimeContribution[] = [];
  const nettedCostKeys = new Set<string>();
  for (const [costKey, group] of byCostKey) {
    // Ordered-family groups (e.g. stage_like) must net in natural progression order (stage 1 before 2, …).
    // Unordered groups (e.g. tiered shop items, no inherent sequence — sequenceFamilyOf returns null for
    // every member) net best-rate-first instead: capacity-limited tiers (shop_flat_limit's costAmount is
    // that tier's full purchase-limit cost) still cap the discount at their own costAmount and spill over
    // to the next tier, same as the tier-cascading in collectCurrencyOneTime's `chained` computation — this
    // is what keeps a shop's one-time byproduct-funded purchases and its AP-funded purchases sharing the
    // SAME finite stock instead of each seeing the tier as independently available.
    const families = new Set(group.map((s) => sequenceFamilyOf(s.source)));
    if (families.size !== 1) continue; // mixed families (some ordered, some not) — ambiguous, skip
    const isUnorderedGroup = families.has(null);

    // Only activate as much of the pool as the group's total demand needs, to avoid overcounting unused
    // amounts. Free contributors sort first, then best rate (amount/AP), until demand is covered.
    // An unordered group with a repeatable member (e.g. an unlimited shop exchange) has no real demand cap: it
    // keeps absorbing pool entries past one run's cost while they're cheaper per unit than farming costKey.
    const absorbsAll = isUnorderedGroup && group.some((s) => s.repeatsForever);
    const steadyRate = rateMap.get(costKey);
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
    const activated: OneTimeContribution[] = [];
    for (const o of pool) {
      if (remaining >= totalDemand) {
        if (!absorbsAll) break;
        const isFree = o.apCost === undefined || o.apCost <= 0;
        if (!isFree && (steadyRate === undefined || (o.apCost as number) / o.amount >= steadyRate)) break;
      }
      remaining += o.amount;
      activated.push(o);
    }
    // Overlapping prefix clears among the activated entries are charged once; the discounted segment keeps the
    // union so it can share those clears with other contributions downstream (see PrefixClears).
    const { apCost: combinedPoolApCost, prefixClears: poolClears } = combinePrefixCost(activated);
    let poolApCost = combinedPoolApCost;
    if (remaining <= 0) continue;
    nettedCostKeys.add(costKey);

    if (isUnorderedGroup) {
      // Best-rate tier first; a tier's discount is capped at its own costAmount then spills to the next —
      // same tier-cascading as collectCurrencyOneTime's `chained`. Every tier that gets any discount shares
      // ONE combined bonus entry (apCost = the pool's total AP, amount = the sum of their discounted output)
      // instead of the pool's AP being dumped entirely on the first tier alone (which would leave later
      // tiers' discounted amount attached to an apCost of 0 and silently dropped downstream).
      const ordered = [...group].sort((a, b) => b.amount / b.costAmount - a.amount / a.costAmount);
      let freeAmountTotal = 0;
      for (const s of ordered) {
        if (remaining <= 0) break;
        // A repeatable tier has no capacity cap, so it absorbs the rest of the pool (same as collectCurrencyOneTime).
        const discount = s.repeatsForever ? remaining : Math.min(remaining, s.costAmount);
        remaining -= discount;
        const discountedAmount = s.costAmount > 0 ? discount * (s.amount / s.costAmount) : 0;
        freeAmountTotal += discountedAmount;
        discountedCostAmount.set(s, Math.max(0, s.costAmount - discount));
        leftoverAmount.set(s, Math.max(0, s.amount - discountedAmount));
      }
      if (freeAmountTotal > 0 && poolApCost <= 0) {
        freeOneTime.push({ amount: freeAmountTotal, source: ordered[0].source, sourceLabel: formatSourceLabel(ordered[0].source) });
      } else if (freeAmountTotal > 0) {
        freeBonusSegments.push({
          apCost: poolApCost,
          amount: freeAmountTotal,
          source: ordered[0].source,
          sourceLabel: formatSourceLabel(ordered[0].source),
          prefixClears: poolClears,
        });
      }
    } else {
      const ordered = [...group].sort((a, b) => (sequenceOrderOf(a.source) as number) - (sequenceOrderOf(b.source) as number));
      for (const s of ordered) {
        if (remaining <= 0) break;
        const discount = Math.min(remaining, s.costAmount);
        remaining -= discount;
        discountedCostAmount.set(s, s.costAmount - discount);
        if (poolApCost > 0) {
          extraApCost.set(s, poolApCost);
          extraApClears.set(s, poolClears);
          poolApCost = 0;
        }
      }
    }
  }

  // Resolved inline rather than via resolveSegment: a fully-netted segment has costAmount 0, which
  // resolveSegment's apCost<=0 guard would drop — but the pool-unlock AP (`extra`) must be added first,
  // since it can still be non-zero.
  const segments = rawSegments.flatMap((s): ApSegment[] => {
    const discounted = discountedCostAmount.get(s);
    const costAmount = discounted ?? s.costAmount;
    const rate = s.costKey === AP ? 1 : rateMap.get(s.costKey);
    if (rate === undefined) return [];
    const extra = extraApCost.get(s) ?? 0;
    // Unordered groups route a discounted segment's freed-up output through freeBonusSegments instead —
    // this segment keeps only whatever output its own undiscounted (still-to-be-paid) cost still represents.
    const amount = leftoverAmount.get(s) ?? s.amount;
    const base = { amount, source: s.source, sourceLabel: formatSourceLabel(s.source), isApproximated: s.isApproximated };

    // A one-time currency pool discounting a repeating segment only pays for that first run — folding it
    // into the segment's steady-state costAmount would make every future repeat look free too. Split into
    // the (cheaper) first run and an undiscounted repeat at the segment's real per-run cost.
    if (s.repeatsForever && discounted !== undefined && discounted < s.costAmount) {
      const firstApCost = rate * costAmount + extra;
      const steadyApCost = rate * s.costAmount;
      const result: ApSegment[] = [];
      if (firstApCost > 0) result.push({ ...base, apCost: firstApCost, prefixClears: extraApClears.get(s) });
      // Repeats pay full price, so they yield the full undiscounted output (not the first run's leftover).
      if (steadyApCost > 0) result.push({ ...base, amount: s.amount, apCost: steadyApCost, repeatsForever: true });
      return result;
    }

    const apCost = rate * costAmount + extra;
    if (apCost <= 0) return [];
    return [{ ...base, apCost, repeatsForever: s.repeatsForever, firstRunBonusAmount: s.firstRunBonusAmount }];
  });
  return { segments: [...segments, ...freeBonusSegments], freeOneTime, nettedCostKeys };
}

// Two different one-off bonuses can both be funded by the same or overlapping mandatory-prefix clears (e.g. one
// resource discounted via that prefix's own currency, another via a shop chain running on a *different*
// byproduct currency of the same clears) — see PrefixClears. Left alone, the curve would charge those clears'
// AP once per bonus that happens to draw from them. Merge every group of bonuses linked by a shared clear into
// one entry: summed amount, AP from combinePrefixCost (each distinct clear once).
function mergeSharedPrefixContributions(segments: ApSegment[], oneTimeContributions: OneTimeContribution[]): { segments: ApSegment[]; oneTimeContributions: OneTimeContribution[] } {
  type Member = { amount: number; apCost?: number; source: SourceRef; sourceLabel: SourceLabelKey; isApproximated?: boolean; prefixClears?: PrefixClears };
  const members: Member[] = [...segments.filter((s) => !s.repeatsForever && s.prefixClears), ...oneTimeContributions.filter((o) => o.apCost !== undefined && o.prefixClears)];
  // Union-find over members, joined whenever two share any clear id.
  const parent = members.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ownerOfClear = new Map<string, number>();
  members.forEach((m, i) => {
    for (const clearId of Object.keys(m.prefixClears ?? {})) {
      const owner = ownerOfClear.get(clearId);
      if (owner === undefined) ownerOfClear.set(clearId, i);
      else parent[find(i)] = find(owner);
    }
  });
  const groups = new Map<number, Member[]>();
  members.forEach((m, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(m);
    else groups.set(root, [m]);
  });

  const mergeGroups = [...groups.values()].filter((list) => list.length > 1);
  if (mergeGroups.length === 0) return { segments, oneTimeContributions };
  const merged = new Set<Member>(mergeGroups.flat());

  const mergedSegments = segments.filter((s) => !merged.has(s));
  const mergedOneTime = oneTimeContributions.filter((o) => !merged.has(o));
  for (const list of mergeGroups) {
    const { apCost, prefixClears } = combinePrefixCost(list);
    const amount = list.reduce((a, m) => a + m.amount, 0);
    const rep = list[0];
    mergedSegments.push({ apCost, amount, source: rep.source, sourceLabel: rep.sourceLabel, isApproximated: list.some((m) => m.isApproximated), prefixClears });
  }

  return { segments: mergedSegments, oneTimeContributions: mergedOneTime };
}

function profileFromExtracted(extracted: Extracted, rateMap: Map<string, number>, chosenEdge: ReadonlyMap<string, RawSegment>, targetKey: string): ResourceApProfile {
  const rawSegments = extracted.segments.filter((s) => s.producesKey === targetKey);
  const { segments: nettedSegments, freeOneTime, nettedCostKeys } = netCurrencyPoolIntoSegments(extracted, rateMap, chosenEdge, rawSegments);

  const rawOneTimeContributions = [
    ...collectCurrencyOneTime(extracted, chosenEdge, targetKey, true, new Set(), nettedCostKeys)
      .map((o) => resolveOneTime(rateMap, o))
      .filter((o): o is OneTimeContribution => o !== null),
    ...freeOneTime,
  ];

  const merged = mergeSharedPrefixContributions(nettedSegments, rawOneTimeContributions);
  const segments = merged.segments.sort((a, b) => b.amount / b.apCost - a.amount / a.apCost);

  return { key: targetKey, segments: [...segments, ...unlockClearSegments(extracted, segments, merged.oneTimeContributions)], oneTimeContributions: merged.oneTimeContributions };
}

// The repeat stage needs every earlier stage of its sequence cleared once, even ones that drop none of the
// target. Those clears become zero-output finite segments (the curve runs sequenced finite segments first, in
// stage order, and charges each clear only once).
function unlockClearSegments(extracted: Extracted, segments: ApSegment[], oneTime: OneTimeContribution[]): ApSegment[] {
  let tail: ApSegment | undefined;
  for (const s of segments) {
    if (!s.repeatsForever || sequenceKeyOf(s) === null) continue;
    if (!tail || s.amount / s.apCost > tail.amount / tail.apCost) tail = s;
  }
  const key = tail ? sequenceKeyOf(tail) : null;
  if (!tail || !key) return [];

  const covered = new Set<string>();
  for (const e of [...segments, ...oneTime]) {
    const clearId = stageClearIdOf(e.source);
    if (clearId !== null) covered.add(clearId);
    for (const id of Object.keys(e.prefixClears ?? {})) covered.add(id);
  }
  const unlocks: ApSegment[] = [];
  for (const [clearId, info] of familyClearCosts(extracted, key.family)) {
    if (info.order >= key.order || covered.has(clearId)) continue;
    unlocks.push({ apCost: info.apCost, amount: 0, source: info.source, sourceLabel: formatSourceLabel(info.source) });
  }
  return unlocks;
}

// Re-groups extracted sources into the joint model: stage-like segments of one stage become one activity that
// co-produces everything the stage drops, and each stage's clear (first-clear bonuses, first-run bonuses) sits in
// its sequence chain so earlier clears are prerequisites of later ones.
function buildJointModel(extracted: Extracted, targetKey: string, owned: Record<string, number>, refs: JointRefLabel[] = [], cleared: ReadonlySet<string> = new Set()): JointModel {
  const refOf = (source: SourceRef, clearId?: string, costKey?: string): number => refs.push({ source, sourceLabel: formatSourceLabel(source), clearId, costKey }) - 1;
  interface StageGroup {
    source: StageLikeSourceRef;
    costKey: string;
    costAmount: number;
    repeatOut: Map<string, number>;
    clearOut: Map<string, number>;
  }
  const groups = new Map<string, StageGroup>();
  const groupOf = (source: StageLikeSourceRef, costKey: string, costAmount: number): StageGroup => {
    const id = `${source.category}:${source.stageNumber ?? ''}:${costKey}:${costAmount}`;
    let g = groups.get(id);
    if (!g) {
      g = { source, costKey, costAmount, repeatOut: new Map(), clearOut: new Map() };
      groups.set(id, g);
    }
    return g;
  };
  const addTo = (map: Map<string, number>, key: string, amount: number): void => {
    map.set(key, (map.get(key) ?? 0) + amount);
  };
  const columns: JointColumn[] = [];
  const fixed: JointModel['fixed'] = [];
  const goals: JointColumn[] = [];
  const constants = new Map<string, number>();
  for (const [key, amount] of Object.entries(owned)) if (amount > 0) constants.set(key, amount);

  for (const seg of extracted.segments) {
    if (seg.amount <= 0 || seg.costAmount <= 0) continue;
    if (seg.source.type === 'stage_like') {
      const g = groupOf(seg.source, seg.costKey, seg.costAmount);
      // A finite stage segment is a single clear's yield (see Ctx.highAreaFirst), not repeatable farming.
      if (seg.repeatsForever) addTo(g.repeatOut, seg.producesKey, seg.amount);
      else addTo(g.clearOut, seg.producesKey, seg.amount);
      if (seg.firstRunBonusAmount) addTo(g.clearOut, seg.producesKey, seg.firstRunBonusAmount);
      continue;
    }
    const inFlow = new Map([[seg.costKey, seg.costAmount]]);
    const outFlow = new Map([[seg.producesKey, seg.amount]]);
    const isGoalPurchase = (seg.source.type === 'shop_tier' || seg.source.type === 'shop_flat_limit') && seg.source.goal !== undefined;
    // A purchase the plan aims for is bought first as far as the budget allows; everything else is optional.
    if (isGoalPurchase) goals.push({ in: inFlow, out: outFlow, cap: 1, ref: refOf(seg.source, undefined, seg.costKey) });
    else columns.push({ in: inFlow, out: outFlow, cap: seg.repeatsForever ? Infinity : 1, ref: refOf(seg.source), divisible: seg.isApproximated });
  }
  for (const one of extracted.oneTime) {
    if (one.amount <= 0) continue;
    if (one.source.type === 'stage_like' && one.costKey !== undefined && one.costAmount !== undefined && one.costAmount > 0) {
      addTo(groupOf(one.source, one.costKey, one.costAmount).clearOut, one.producesKey, one.amount);
    } else if (one.costKey === undefined || one.costAmount === undefined) {
      addTo(constants, one.producesKey, one.amount);
    } else {
      columns.push({ in: new Map([[one.costKey, one.costAmount]]), out: new Map([[one.producesKey, one.amount]]), cap: 1, ref: refOf(one.source) });
    }
  }

  const chainMap = new Map<string, { order: number; clear: JointClear }[]>();
  let standalone = 0;
  for (const g of groups.values()) {
    const inFlow = new Map([[g.costKey, g.costAmount]]);
    const clearOut = new Map(g.repeatOut);
    for (const [key, amount] of g.clearOut) addTo(clearOut, key, amount);
    // A clear step is labelled by the stage alone, not by the "one-time reward" wording of its first-clear source.
    const ref = refOf({ ...g.source, oneTimeClear: false }, `${g.source.category}:${g.source.stageNumber ?? ''}`);
    const family = sequenceFamilyOf(g.source) ?? `standalone:${standalone++}`;
    const order = sequenceOrderOf(g.source) ?? 0;
    // Equally efficient stages are resolved in favour of the higher area: its runs get a hair cheaper (far below
    // any real difference), so the solver no longer picks between exact ties arbitrarily.
    const repeatIn = new Map(inFlow);
    for (const [key, amount] of repeatIn) repeatIn.set(key, amount * (1 - Math.max(0, order) * AREA_TIE_BREAK));
    const clear: JointClear = { in: inFlow, out: clearOut, repeat: g.repeatOut.size > 0 ? { in: repeatIn, out: new Map(g.repeatOut), cap: Infinity, ref } : null, ref };
    const entries = chainMap.get(family) ?? [];
    entries.push({ order, clear });
    chainMap.set(family, entries);
  }
  const chains: JointClear[][] = [];
  for (const entries of chainMap.values()) {
    const sorted = entries.sort((a, b) => a.order - b.order).map((e) => e.clear);
    // A cleared stage implies every earlier stage of its chain is cleared too. Cleared stages cost nothing and give
    // no first-clear bonus, but their repeat farming is available from the start.
    let lastCleared = -1;
    sorted.forEach((clear, j) => {
      const id = clear.ref !== undefined ? refs[clear.ref]?.clearId : undefined;
      if (id !== undefined && cleared.has(id)) lastCleared = j;
    });
    for (let j = 0; j <= lastCleared; j++) {
      const repeat = sorted[j].repeat;
      if (repeat) columns.push(repeat);
    }
    const rest = sorted.slice(lastCleared + 1);
    if (rest.length > 0) chains.push(rest);
  }
  return { apKey: AP, targetKey, columns, chains, fixed, goals, constants };
}

export interface JointRefLabel {
  source: SourceRef;
  sourceLabel: SourceLabelKey;
  /** Stage clear id (see stageClearIdOf) for a stage clear; undefined for other activities. */
  clearId?: string;
  /** Currency a shop purchase is paid with, so purchases can be grouped by currency. */
  costKey?: string;
}

export interface JointGoalPlan {
  steps: JointStep[];
  target: number;
  startTarget: number;
  apUsed: number;
  /** Label table the steps' `ref` indexes into. */
  labels: JointRefLabel[];
}

export interface ResourceApIndex {
  resourceKeys: string[];
  resolveProfile: (targetKey: string) => ResourceApProfile;
  buildSankey: (targetKey: string, targetAmount: number) => SankeyFlow;
  buildFarmingPlan: (targetKey: string) => FarmingPlanEntry[];
  // Target amount per AP once the shop purchases the plan commits to compete for the same AP (see jointGoalCurve.ts).
  buildJointGoalCurve: (targetKey: string, owned: Record<string, number>, maxAp: number, points?: number, cleared?: ReadonlySet<string>) => JointCurvePoint[];
  buildJointGoalPlan: (targetKey: string, owned: Record<string, number>, cleared?: ReadonlySet<string>, stopAtGoals?: boolean) => JointGoalPlan | null;
  /** Stage chains in clear order, for the "already cleared" checklist. */
  listJointClearChains: (targetKey: string, owned: Record<string, number>) => { id: string; sourceLabel: SourceLabelKey }[][];
}

// Relative AP discount per area step that breaks ties between equally efficient stages.
const AREA_TIE_BREAK = 1e-8;

// Budget standing in for "unlimited AP" when laying out the farming plan.
const OPEN_PLAN_AP = 1_000_000;

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
    buildJointGoalCurve: (targetKey, owned, maxAp, points, cleared) => buildJointCurve(buildJointModel(extracted, targetKey, owned, [], cleared), maxAp, points),
    buildJointGoalPlan: (targetKey, owned, cleared, stopAtGoals) => {
      const labels: JointRefLabel[] = [];
      const model = buildJointModel(extracted, targetKey, owned, labels, cleared);
      const goalCount = model.goals?.length ?? 0;
      if (stopAtGoals && goalCount > 0) {
        // Cheapest budget that still buys every goal purchase: the target is not farmed any further than that.
        const solveAt = (ap: number) => {
          const ks = buildJointCurve(model, ap, 2)[1]?.ks;
          return ks ? { ks, done: (solveJointDetail(model, ks, ap)?.goal ?? 0) >= goalCount - 1e-6 } : null;
        };
        let hi = 1000;
        while (hi < OPEN_PLAN_AP && !solveAt(hi)?.done) hi *= 2;
        let lo = hi / 2;
        // A 0.25% window is far below what the chart can show and halves the number of solves.
        while (hi - lo > Math.max(1, hi * 0.0025)) {
          const mid = (lo + hi) / 2;
          if (solveAt(mid)?.done) hi = mid;
          else lo = mid;
        }
        const found = solveAt(hi);
        const plan = found ? planJointAtAp(model, found.ks, hi, { integerRuns: true }) : null;
        if (plan) return { ...plan, labels };
      }
      // Unlimited AP: the plan at a very large budget is (finite prerequisites) + (one stage repeated without end).
      // Planning at two budgets and extrapolating each repeat count linearly separates the two parts.
      const plans = [OPEN_PLAN_AP, OPEN_PLAN_AP * 2].map((ap) => {
        const last = buildJointCurve(model, ap, 2)[1];
        return last?.ks ? planJointAtAp(model, last.ks, ap) : null;
      });
      const [near, far] = plans;
      if (!near || !far) return null;
      const stepKey = (st: JointStep) => `${st.kind}|${st.ref}|${st.chain}|${st.index}`;
      const farCount = new Map(far.steps.map((st) => [stepKey(st), st.count]));
      const steps: JointStep[] = [];
      const forever: JointStep[] = [];
      let cum = 0;
      for (const st of near.steps) {
        const growth = (farCount.get(stepKey(st)) ?? st.count) - st.count;
        const grows = growth > 0.5;
        const isForever = st.kind === 'repeat' && grows;
        const count = isForever ? Math.max(0, st.count - growth) : st.count;
        // Whatever scales with the budget (the repeat itself and the exchanges its output feeds) is open-ended: only the
        // part present without extra AP belongs to the finite stretch, the rest is the per-AP rate below.
        const finiteShare = grows && st.count > 0 ? Math.max(0, st.count - growth) / st.count : 1;
        if (isForever) forever.push({ ...st, count: Infinity, ap: 0, forever: true, runAp: st.count > 0 ? st.ap / st.count : 0, targetDelta: 0 });
        if (isForever && count < 0.5) continue;
        const stepAp = isForever && st.count > 0 ? (st.ap * count) / st.count : st.ap;
        steps.push({ ...st, count, ap: stepAp, targetDelta: st.targetDelta * finiteShare, apStart: cum, apEnd: cum + stepAp });
        cum += stepAp;
      }
      // Beyond the finite stretch the target keeps rising at the slope between the two budgets.
      if (forever.length > 0) forever[0].targetPerAp = (far.target - near.target) / OPEN_PLAN_AP;
      // Steps that spend only currency were paced along the (huge) near budget; keep them inside the finite stretch.
      const clampAp = (ap: number) => Math.min(ap, cum);
      for (const st of steps) {
        if (st.ap > 0) continue;
        st.apStart = clampAp(st.apStart);
        st.apEnd = clampAp(st.apEnd);
        st.progress = st.progress?.map(([ap, share]): [number, number] => [clampAp(ap), share]);
      }
      for (const st of forever) steps.push({ ...st, apStart: cum, apEnd: cum });
      return { steps, target: near.target, startTarget: near.startTarget, apUsed: cum, labels };
    },
    listJointClearChains: (targetKey, owned) => {
      const labels: JointRefLabel[] = [];
      const model = buildJointModel(extracted, targetKey, owned, labels);
      return model.chains.map((chain) =>
        chain.flatMap((clear) => {
          const label = clear.ref !== undefined ? labels[clear.ref] : undefined;
          return label?.clearId !== undefined ? [{ id: label.clearId, sourceLabel: label.sourceLabel }] : [];
        }),
      );
    },
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
    case 'location_schedule':
      return `Schedule rank ${source.rank} · ${source.name}`;
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

// True when every clear is one the tail stage itself requires first (same family, at or before it). A tail that
// isn't a stage (e.g. a shop/minigame chain) has no known prerequisite clears, so its bonuses keep efficiency order.
function clearsPrecedeTail(prefixClears: PrefixClears, tail: ApSegment): boolean {
  const tailFamily = sequenceFamilyOf(tail.source);
  const tailOrder = sequenceOrderOf(tail.source);
  if (tail.source.type !== 'stage_like' || tailFamily === null || tailOrder === null) return false;
  return Object.keys(prefixClears).every((clearId) => {
    const sep = clearId.indexOf(':');
    const source = { type: 'stage_like', category: clearId.slice(0, sep), stageNumber: clearId.slice(sep + 1) } as StageLikeSourceRef;
    const order = sequenceOrderOf(source);
    return sequenceFamilyOf(source) === tailFamily && order !== null && order <= tailOrder;
  });
}

// A prefix-funded bonus (see PrefixClears) whose clears the repeat stage needs anyway must land before the
// repeating tail — the tail runs to maxAp, so anything sorted after it would never be counted.
function pullPrefixBonusesBeforeTail(segments: ApSegment[]): ApSegment[] {
  const tailIndex = segments.findIndex((s) => s.repeatsForever);
  if (tailIndex < 0) return segments;
  const tail = segments[tailIndex];
  const late = segments.slice(tailIndex).filter((s) => !s.repeatsForever && s.prefixClears && clearsPrecedeTail(s.prefixClears, tail));
  if (late.length === 0) return segments;
  const lateSet = new Set(late);
  return [...segments.slice(0, tailIndex), ...late, ...segments.slice(tailIndex).filter((s) => !lateSet.has(s))];
}

export function buildCumulativeCurve(
  rawSegments: ApSegment[],
  maxAp: number,
  // Reports the cumulative-AP span each finite segment occupies on the curve (e.g. to highlight it on a chart).
  onFiniteSegment?: (seg: ApSegment, fromAp: number, toAp: number) => void,
): { ap: number; amount: number }[] {
  const segments = pullPrefixBonusesBeforeTail(pullSequencedOneTimeToFront(foldSequencedFamilies(rawSegments)));
  const points: { ap: number; amount: number }[] = [{ ap: 0, amount: 0 }];
  let ap = 0;
  let amount = 0;
  // Stage clears already paid for by an earlier segment (a mandatory stage run or another prefix bonus) — a
  // later prefix bonus only pays for its clears not in here (see PrefixClears).
  const paidClears = new Set<string>();
  const finiteApCost = (seg: ApSegment): number => {
    const ownClear = stageClearIdOf(seg.source);
    if (!seg.prefixClears) {
      if (ownClear !== null) paidClears.add(ownClear);
      return seg.apCost;
    }
    let cost = Math.max(0, seg.apCost - sumClears(seg.prefixClears));
    for (const [clearId, clearAp] of Object.entries(seg.prefixClears)) {
      if (paidClears.has(clearId)) continue;
      paidClears.add(clearId);
      cost += clearAp;
    }
    return cost;
  };
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
    const fromAp = ap;
    ap += finiteApCost(seg);
    onFiniteSegment?.(seg, fromAp, Math.min(ap, maxAp));
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
    has(d.minigame_tank) ||
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
    has(d.field?.FieldContentStageReward) ||
    has(d.location?.reward)
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
    { source: 'minigame_tank (stage clear reward)', existsInData: has(d.minigame_tank?.stage), status: 'modeled' },
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
