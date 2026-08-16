// Resolves "AP cost to obtain 1 unit of resource X" for a single event.
//
// Architecture: extraction is fully separated from cost resolution.
//   1. EXTRACTION (extract*): ~15 small per-source functions, one per event data shape (stage, shop,
//      each minigame, missions, field). Each is pure data-reading — it declares "this source costs
//      {costAmount} of {costKey} and produces {amount} of {producesKey}", for EVERY resource the source
//      can produce, in one pass over the whole event (not filtered to a single target key). No recursion,
//      no cycle guard, no currency-chaining logic lives here at all.
//   2. RESOLUTION (computeApRateMap / resolveResourceApProfile): a single generic Dijkstra pass turns the
//      combined edge list into "AP cost per unit" for every currency in the event, then looks up whichever
//      edges produce the requested target key. This replaces what used to be a `resolveApCostForCurrency`
//      recursive call (with a `visited` cycle guard threaded through all 15 extractors) with one textbook
//      shortest-path algorithm, written once.
//
// See project memory `project_resource_efficiency_tab` for the source-by-source coverage table and the
// correctness rules this file must keep (no proportional AP-splitting across co-rewards, event bonus only
// on repeatable-tag stage rewards, road-puzzle cost via real pathfinding, no fabricated formulas for
// mechanics the game data doesn't expose).
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
  // Gates every Monte-Carlo-simulation-based extractor (dice_race, treasure, concentration, minigame_dream,
  // fortune_gacha, minigame_road_puzzle) — measured at ~1.5-3s+ per event for road_puzzle alone, these are
  // too expensive to run on every render/tab-open. Defaults to false (fast, deterministic sources only);
  // the UI opts in explicitly (a button click), matching the "run simulation" pattern every other minigame
  // planner in this app already uses instead of running Monte Carlo automatically on mount.
  includeSimulations?: boolean;
}

// ---------------------------------------------------------------------------
// Source identity: every extractor tags its output with a structured SourceRef (raw fields, no display
// text) instead of a pre-formatted string. `formatSourceLabel` is the ONLY place that turns a SourceRef
// into human-readable text, called once at the very end (resolveSegment/resolveOneTime) — so nothing
// upstream (extraction, resolution, tests) ever matches against display prose.
// ---------------------------------------------------------------------------

// Every "enter cost, get a FirstClear-vs-repeatable reward table" source (regular stages, minigame_defense,
// minigame_janken stages) collapses to this one shape instead of three near-identical variants + three
// near-identical formatSourceLabel cases — `category` picks the display prefix, `stageNumber` is the parsed
// trailing number from the source's raw `Name` (omitted entirely for janken's Challenge stage, which the
// game itself never numbers).
type StageLikeCategory = 'stage' | 'story' | 'challenge' | 'minigame_defense' | 'janken_story' | 'janken_normal' | 'janken_challenge';

export type SourceRef =
  // `oneTimeClear` covers both FirstClear- and ThreeStar-tagged rows: both are one-time, both cost the same
  // entry AP, so they're tracked and labeled as one bucket — splitting them changes no computed AP/amount,
  // only which of two near-identical labels gets shown.
  | { type: 'stage_like'; category: StageLikeCategory; stageNumber?: string; oneTimeClear?: boolean }
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
  story: 'common.story',
  challenge: 'common.challenge',
  minigame_defense: 'minigame.minigame_defense',
  janken_story: 'common.story',
  janken_normal: 'minigame_janken.normal',
  janken_challenge: 'common.challenge',
};

// Raw internal `Name` fields (e.g. "EVENT_845_Normal_MainGround_Stage02", "Minigame_Janken_Normal_Stage_01")
// aren't fit for user-facing display, so every stage-shaped SourceRef carries just the parsed trailing
// stage number instead, and this is the only place that formats it — same trailing-number-only convention
// RepeatableTab.tsx/OnetimeTab.tsx/MissionPlanner.tsx already use (`Name.split('_').pop().replace('Stage', '')`).
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
  // Extra one-time amount of this SAME producesKey granted alongside this segment's very first run (e.g. a
  // stage's FirstClear-tagged reward for a resource that's also given by that same stage's Default/Rare/
  // Event-tagged reward row) — folded in here instead of emitted as an independent RawOneTime, because it
  // costs no additional AP beyond the segment's own cost: the first clear already pays for both at once.
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

// GachaGroup rewards are opaque "boxes", not real farmable currencies — reuse the exact same expected-value
// decomposition Icon.tsx's GachaGroup tooltip already computes (`calculateExpectedContents`) so a box reward
// chains into the resource graph as its real contents instead of an unusable "GachaGroup_500000" resource.
// `iconData`/`locale` only affect display fields (icon src) this call site never reads, so a stub suffices.
function expandGachaGroupReward(producesKey: string, amount: number, eventData: EventData): { producesKey: string; amount: number }[] {
  if (!producesKey.startsWith('GachaGroup_') || amount <= 0) return [{ producesKey, amount }];
  const groupId = producesKey.slice('GachaGroup_'.length);
  const contents = calculateExpectedContents(groupId, amount, eventData.icons, {}, 'en');
  return Object.values(contents)
    .filter((c) => c.expectedAmount > 0)
    .map((c) => ({ producesKey: keyOf(c.type, Number(c.id)), amount: c.expectedAmount }));
}

// Decomposes every GachaGroup box in the list, then re-merges by producesKey — a box can unpack into the
// same real item another row in the same reward table already awards directly, and those must be summed
// into one segment rather than left as duplicate same-cost rows (see the co-reward summing rule this file
// keeps everywhere else, e.g. extractStageLike's repeatableByKey/oneTimeByKey grouping).
function expandGachaGroupRewards(rewards: { producesKey: string; amount: number }[], eventData: EventData): { producesKey: string; amount: number }[] {
  const merged = new Map<string, number>();
  for (const r of rewards) {
    for (const expanded of expandGachaGroupReward(r.producesKey, r.amount, eventData)) {
      merged.set(expanded.producesKey, (merged.get(expanded.producesKey) ?? 0) + expanded.amount);
    }
  }
  return [...merged].map(([producesKey, amount]) => ({ producesKey, amount }));
}

// Converts parallel ParcelId/ParcelTypeStr/ParcelAmount arrays (the near-universal reward-table shape
// across this event data) into {producesKey, amount} pairs, decomposing any GachaGroup box into its
// expected real contents.
function parcelRewards(ids: number[], types: string[], amounts: number[], eventData: EventData): { producesKey: string; amount: number }[] {
  return expandGachaGroupRewards(
    ids.map((id, i) => ({ producesKey: keyOf(types[i], id), amount: amounts[i] })),
    eventData,
  );
}

// Pushes one segment per {producesKey, amount} pair, all sharing the same (costKey, costAmount) — the
// other half of the pattern repeated across every round/tier-based source (card_shop, box_gacha,
// minigame_ccg, interactive_world_raid, and the round-completion halves of clue_search/road_puzzle).
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

// ---------------------------------------------------------------------------
// Extraction: stage-shaped sources (regular stages + minigame_defense + minigame_janken stages all
// share this exact reward shape: entry cost + reward array with FirstClear-vs-repeatable tag split).
// ---------------------------------------------------------------------------

function extractStageLike(entries: { source: StageLikeSourceRef; costKey: string; costAmount: number; rewards: StageReward[]; bonusEligible?: boolean }[], ctx: Ctx): Extracted {
  const segments: RawSegment[] = [];
  const oneTime: RawOneTime[] = [];
  const eventCurrencyIds = new Set(ctx.eventData.currency?.map((c) => c.ItemUniqueId) ?? []);
  for (const entry of entries) {
    if (entry.costAmount <= 0) continue;
    // A single run can match the same target via more than one reward-table row (e.g. a "Default" roll
    // and a separate "Rare" bonus roll for the same item) — group by produced key and sum, since they're
    // all paid for by the same run's cost, not separate alternative routes. FirstClear and ThreeStar rows
    // are merged into this same one-time bucket too: both cost the same entry AP and both are one-time,
    // so splitting them would change no computed AP/amount, only which of two near-identical labels shows.
    const repeatableByKey = new Map<string, number>();
    const oneTimeClearByKey = new Map<string, number>();
    for (const r of entry.rewards) {
      const rawKey = keyOf(r.RewardParcelTypeStr, r.RewardId);
      let amount = r.RewardAmount * (r.RewardProb / 10000);
      const isRepeatable = REPEATABLE_TAGS.has(r.RewardTagStr);
      // Event bonus (BonusSelector) only ever boosts the repeatable-tag branch, and only for regular farming
      // stages, and only against the reward row's own id (mirrors FarmingPlanner.tsx's exact eligibility
      // check) — applied here, before any GachaGroup decomposition below, since a box is never itself a
      // registered event currency.
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
      // If this same run's FirstClear/ThreeStar rows ALSO grant this exact resource, that's obtained
      // alongside this repeating segment's first run — no separate AP purchase exists for it, so it's
      // folded in here (and NOT also emitted below as an independent RawOneTime row) instead of
      // double-charging AP for what is actually a single stage clear.
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

// minigame_defense reuses the exact Stage reward shape; entry cost is a single global currency
// (MinigameDefensePlanner.tsx reads `gameInfo.DefenseBattleParcelId/DefenseBattleParcelTypeStr`, NOT the
// per-stage `StageEnterCostId/Type` fields — confirmed by reading that component directly).
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

// minigame_janken stages give a direct EventContentStageReward, same FirstClear-vs-repeatable split as
// regular stages; entry cost is a single global currency from `info.CostParcelId/CostParcelTypeStr`.
// The score-ladder reward (reward_score/reward_score_item) isn't modeled: no score-per-win formula exists
// anywhere in this codebase or the exported data (MinigameJankenPlanner.tsx takes score as plain manual
// input), so it's surfaced as an undetermined-cost one-time contribution instead of guessed.
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
  // `manage[]` carries per-round loop metadata only, matched by `Round` — its own `Goods` has no
  // ParcelId/ParcelAmount/ParcelTypeStr at all in real event data (confirmed directly against JSON), so
  // it never produces a reward itself; it's purely a lookup for whether a `shop` round repeats forever.
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

// ---------------------------------------------------------------------------
// Extraction: interactive_world_raid, minigame_ccg, clue_search — exact math. minigame_road_puzzle is
// defined further below, alongside the other Monte-Carlo-simulation-based extractors it now belongs with.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Extraction: genuinely path-dependent random minigames — reuse each one's existing simulation/Monte
// Carlo function rather than re-deriving new math (a from-scratch assumption was already proven wrong
// once: treasure hunt does NOT require opening every cell, players stop once they find the treasure).
// All of these (plus road_puzzle below) are gated behind Ctx.includeSimulations — see extractAll.
// ---------------------------------------------------------------------------

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
  // Reuses RoadPuzzlePlanner.tsx's own round/map/reward normalization AND its actual draw simulation: tiles
  // are drawn WITHOUT replacement from each map's fixed pool (not freely chosen), so the true expected AP
  // cost is the simulated draw count, not the map's unconstrained minimum-tiles pathfinding solve (which
  // would undercount, since a free-choice lower bound ignores the random draw order players are stuck with).
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

// fortune_gacha (Omikuji): a soft-pity weighted draw table (FortuneGachaPlanner.tsx's own `runSimulation`
// already implements the exact pity-shift/normalize/reset logic against `modify`), reused as-is rather than
// re-derived. Some draws land on a `GachaGroup` box rather than a real item directly — decomposed into its
// expected real contents (same as every other reward table here) instead of being dropped.
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

// Field quests + mastery levels are free (no AP cost modeled anywhere in FieldEventPlanner.tsx either).
// FieldContentStageReward is stage-shaped and DOES cost AP, via `getStageCost(eventId, stageId)` — a
// hardcoded per-event/per-stage lookup table (FieldEventPlanner.tsx uses the exact same helper), paid in
// the event's first registered currency (`eventData.currency[0]`), matching that component's own logic.
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
      // Same co-reward summing + FirstClear/ThreeStar-vs-repeatable split as extractStageLike: multiple
      // rows can target the same resource, and FirstClear/ThreeStar rows are merged into one bucket since
      // both are one-time and cost the same stage AP — folded into that segment's first-run bonus when a
      // repeatable row also grants the same resource, rather than double-charging the stage's AP cost.
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

/**
 * Dijkstra over the currency graph: `segments` are edges "costKey -costAmount-> producesKey (amount)".
 * Returns the minimum AP needed for 1 unit of every currency reachable from AP, choosing the cheapest
 * route at each step — this is what used to be a recursive `resolveApCostForCurrency` call (with a
 * `visited` cycle guard threaded through every extractor); cycles and "no route exists" are both handled
 * naturally by Dijkstra's finalized-node set instead of bespoke per-call bookkeeping.
 */
function computeApRateMap(segments: RawSegment[]): Map<string, number> {
  const edgesByCost = new Map<string, RawSegment[]>();
  for (const s of segments) {
    if (s.amount <= 0 || s.costAmount <= 0) continue;
    if (!edgesByCost.has(s.costKey)) edgesByCost.set(s.costKey, []);
    edgesByCost.get(s.costKey)?.push(s);
  }

  const apCostPerUnit = new Map<string, number>([[AP, 1]]);
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
      if (existing === undefined || candidate < existing) apCostPerUnit.set(edge.producesKey, candidate);
    }
  }
  return apCostPerUnit;
}

function resolveSegment(rateMap: Map<string, number>, s: RawSegment): ApSegment | null {
  const rate = s.costKey === AP ? 1 : rateMap.get(s.costKey);
  if (rate === undefined) return null;
  const apCost = rate * s.costAmount;
  if (apCost <= 0) return null;
  const sourceLabel = formatSourceLabel(s.source);
  return {
    apCost,
    amount: s.amount,
    source: s.source,
    sourceLabel,
    repeatsForever: s.repeatsForever,
    isApproximated: s.isApproximated,
    firstRunBonusAmount: s.firstRunBonusAmount,
  };
}

function resolveOneTime(rateMap: Map<string, number>, o: RawOneTime): OneTimeContribution | null {
  const sourceLabel = formatSourceLabel(o.source);
  if (o.costKey === undefined) return { amount: o.amount, source: o.source, sourceLabel };
  const rate = o.costKey === AP ? 1 : rateMap.get(o.costKey);
  if (rate === undefined) return null;
  const apCost = rate * (o.costAmount ?? 0);
  return { amount: o.amount, apCost, source: o.source, sourceLabel };
}

function profileFromExtracted(extracted: Extracted, rateMap: Map<string, number>, targetKey: string): ResourceApProfile {
  const segments = extracted.segments
    .filter((s) => s.producesKey === targetKey)
    .map((s) => resolveSegment(rateMap, s))
    .filter((s): s is ApSegment => s !== null)
    .sort((a, b) => b.amount / b.apCost - a.amount / a.apCost);

  const oneTimeContributions = extracted.oneTime
    .filter((o) => o.producesKey === targetKey)
    .map((o) => resolveOneTime(rateMap, o))
    .filter((o): o is OneTimeContribution => o !== null);

  return { key: targetKey, segments, oneTimeContributions };
}

export interface ResourceApIndex {
  resourceKeys: string[];
  resolveProfile: (targetKey: string) => ResourceApProfile;
}

/**
 * Runs extraction + rate resolution EXACTLY ONCE, then lets the caller resolve as many profiles / list the
 * resource keys as it needs from that single cached pass — `resolveResourceApProfile` and
 * `listSelectableResourceKeys` each used to run `extractAll` fresh on every call, which is fine for a single
 * lookup but compounds badly when a caller (e.g. ResourceEfficiencyPanel.tsx's default-resource probing)
 * calls into this module several times per render: with `includeSimulations` on, that meant re-running the
 * ~2.3s road-puzzle simulation once per probe instead of once total.
 */
export function buildResourceApIndex(ctx: Ctx): ResourceApIndex {
  const extracted = extractAll(ctx);
  const rateMap = computeApRateMap(extracted.segments);
  const resourceKeys = [...new Set([...extracted.segments.map((s) => s.producesKey), ...extracted.oneTime.map((o) => o.producesKey)])];
  return { resourceKeys, resolveProfile: (targetKey) => profileFromExtracted(extracted, rateMap, targetKey) };
}

export function resolveResourceApProfile(targetKey: string, ctx: Ctx): ResourceApProfile {
  return buildResourceApIndex(ctx).resolveProfile(targetKey);
}

/** Every resource key producible anywhere in this event (stage/shop/minigame/mission/field). */
export function listSelectableResourceKeys(ctx: Ctx): string[] {
  return buildResourceApIndex(ctx).resourceKeys;
}

// ---------------------------------------------------------------------------
// Cumulative curve builder — unchanged: consume segments best-efficiency-first, extending the last
// repeatsForever segment to maxAp with intermediate sample points for consistent chart granularity.
// ---------------------------------------------------------------------------

const REPEATING_TAIL_SAMPLE_POINTS = 24;

export function buildCumulativeCurve(segments: ApSegment[], maxAp: number): { ap: number; amount: number }[] {
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
    amount += seg.amount;
    points.push({ ap: Math.min(ap, maxAp), amount });
  }
  if (ap < maxAp) points.push({ ap: maxAp, amount });
  return points;
}

const has = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : Object.keys(v ?? {}).length > 0 || !!v);

// Cheap presence check — does this event have ANY data shape resourceApCost.ts knows how to read at all?
// Deliberately does NOT call extractAll/listSelectableResourceKeys: several extractors (dice_race, treasure,
// concentration, fortune_gacha, minigame_road_puzzle) run a real Monte Carlo simulation, which is far too
// expensive to run just to decide whether to show a tab button — that decision only needs "is there
// anything here at all", not the actual resolved resource list (which stays deferred to when the Resource
// Efficiency panel itself mounts, i.e. only once the user actually opens that tab).
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

// Cheap presence check for whether any Monte-Carlo-gated source (see Ctx.includeSimulations) exists in this
// event at all — lets the UI skip showing an "include simulations" prompt entirely when there's nothing
// for it to affect.
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
