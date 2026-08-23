// app/utils/resourceEventAdapters.ts
/**
 * Adapter functions: convert planner store state → ResourceEvent[].
 *
 * Each adapter handles exactly one source type.
 * ResourcesPanel merges all adapter outputs before building timelines.
 *
 * Adding a new income/spend source:
 *   1. Add an adapter function here.
 *   2. Call it from ResourcesPanel.
 *   3. If it's a new daily source, add it to RESOURCE_SOURCES in resourceSources.ts.
 */

import { getResourceDistributionMean, getResourceDistributionPercentile } from '~/utils/resourceTimeline';
import type { ResourceDistributionEntry, ResourceEvent, ResourcePlanEvent } from '~/utils/resourceTimeline';
import { RESOURCE_SOURCES, type ResourceSource } from '~/data/resourceSources';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import type { DistributionData, GlobalAggregatedResult } from '~/utils/gachaEngine';
import type { EventPlan } from '~/types/eventPlan';
import type { StageFarmingPlan } from '~/types/resourcePlan';
import type { CampaignData } from '~/types/plannerData';
import { isoAddDays } from '~/utils/dateUtils';
import { calcRaidCoins, rankToDailyCoins } from '~/data/raidCoinData';
import type { RaidDetailConfig } from '~/data/raidCoinData';
import { normalizeBluprintToEquipment } from './blueprintUtils';

// ---------------------------------------------------------------------------
// SPEND + GAIN adapters
// ---------------------------------------------------------------------------

/**
 * Convert user-authored purchase/exchange events into ResourceEvent[].
 * Each ResourcePlanEvent may have a spend side (negative delta) and/or
 * a gain side (positive delta), emitted as separate ResourceEvents.
 */
export function eventsFromPurchaseEvents(events: ResourcePlanEvent[], startDate: string): ResourceEvent[] {
  const result: ResourceEvent[] = [];

  // Track the maximum purchaseUnits for each date and coinKey (used to calculate refresh costs)
  const refreshMap: Record<string, { coinKey: string; maxUnits: number; refreshCost: number }> = {};

  for (const ev of events) {
    if (ev.date < startDate) continue;

    if (ev.spendItemKey && ev.spendAmount && ev.spendAmount > 0) {
      // On the coin timeline: show what was purchased
      result.push({ itemKey: ev.spendItemKey, delta: -ev.spendAmount, date: ev.date, source: ev.sourceType, ...(ev.gainItemKey ? { labelKey: ev.gainItemKey } : {}) });
    }
    if (ev.gainItemKey && ev.gainAmount && ev.gainAmount > 0) {
      // On the item timeline: show which currency was used for the purchase (itemKey is converted by resolveItemLabel at render time)
      result.push({
        itemKey: ev.gainItemKey,
        delta: ev.gainAmount,
        date: ev.date,
        source: ev.sourceType,
        ...(ev.spendItemKey ? { labelKey: 'resources:eventLabels.purchaseFrom', labelParams: { itemKey: ev.spendItemKey } } : {}),
      });
    }

    // Calculate refresh costs
    if (ev.purchaseUnits && ev.spendItemKey && ev.refreshCost) {
      const key = `${ev.date}:${ev.spendItemKey}`;
      const prev = refreshMap[key];
      if (!prev || ev.purchaseUnits > prev.maxUnits) {
        refreshMap[key] = { coinKey: ev.spendItemKey, maxUnits: ev.purchaseUnits, refreshCost: ev.refreshCost };
      }
    }
  }
  // Add refresh-cost events
  for (const [key, { coinKey, maxUnits, refreshCost }] of Object.entries(refreshMap)) {
    const date = key.split(':')[0];
    const refreshCount = Math.max(0, maxUnits - 1);
    if (refreshCount <= 0) continue;
    result.push({ itemKey: coinKey, delta: -(refreshCount * refreshCost), date, source: 'shop_refresh', labelKey: 'resources:eventLabels.shopRefresh', labelParams: { count: refreshCount } });
  }

  return result;
}

// ---------------------------------------------------------------------------
// INCOME adapters
// ---------------------------------------------------------------------------

/**
 * Daily per-date income sources (calendar UI input).
 * Handles:
 *   - dailySourceAmounts for each RESOURCE_SOURCES entry with triggerType 'daily-per-date'
 *   - weeklyIncomeLimit: rolling 7-day window cap
 */
export function eventsFromDailySources(dailySourceAmounts: Record<string, Record<string, number>>, startDate: string, days: number): ResourceEvent[] {
  const result: ResourceEvent[] = [];

  for (const source of RESOURCE_SOURCES) {
    if (source.triggerType !== 'daily-per-date') continue;
    const amounts = dailySourceAmounts[source.id];
    if (!amounts || Object.keys(amounts).length === 0) continue;

    if (source.weeklyIncomeLimit) {
      result.push(...buildWeeklyCappedEvents(source, amounts, startDate, days));
    } else {
      for (const [date, amount] of Object.entries(amounts)) {
        if (amount > 0 && date >= startDate) {
          result.push({
            itemKey: source.itemKey,
            delta: amount,
            date,
            source: source.id,
            ...(source.labelKey ? { labelKey: source.labelKey } : {}),
          });
        }
      }
    }
  }

  return result;
}

/** Emit daily events with a 7-day rolling cumulative cap. */
function buildWeeklyCappedEvents(source: ResourceSource, amounts: Record<string, number>, startDate: string, days: number): ResourceEvent[] {
  const limit = source.weeklyIncomeLimit ?? Infinity;
  const events: ResourceEvent[] = [];

  // Track the last 7 day amounts to enforce a rolling-window cap
  const window: number[] = Array<number>(7).fill(0);
  let windowSum = 0;

  for (let i = 0; i < days; i++) {
    const date = isoAddDays(startDate, i);
    const raw = amounts[date] ?? 0;

    // Drop oldest day from window
    const slot = i % 7;
    windowSum -= window[slot];

    const allowed = Math.max(0, Math.min(raw, limit - windowSum));
    window[slot] = allowed;
    windowSum += allowed;

    if (allowed > 0) {
      events.push({
        itemKey: source.itemKey,
        delta: allowed,
        date,
        source: source.id,
        ...(source.labelKey ? { labelKey: source.labelKey } : {}),
      });
    }
  }

  return events;
}

/**
 * Content-end lump sum income.
 * For each ScheduleItem whose id prefix matches a 'on-content-end' source,
 * emit a ResourceEvent on the content's endTime date with the user-configured yield.
 */
export function eventsFromContentYields(
  contentEventYields: Record<string, number>,
  schedule: ScheduleItemV2[],
  startDate: string,
  getScheduleTitle: (item: ScheduleItemV2) => string,
): ResourceEvent[] {
  const result: ResourceEvent[] = [];

  const sourceByContentType = new Map<string, ResourceSource>(
    RESOURCE_SOURCES.filter((s): s is ResourceSource & { contentType: string } => s.triggerType === 'on-content-end' && s.contentType != null).map((s) => [s.contentType, s]),
  );
  const contentTypeLabelKey: Record<string, string> = {
    raid: 'resources:eventLabels.raidBoss',
    eraid: 'resources:eventLabels.eraidBoss',
    multifloor: 'resources:eventLabels.mfBoss',
  };

  for (const item of schedule) {
    const endDate = item.endTime?.slice(0, 10);
    if (!endDate || endDate < startDate) continue;

    const amount = contentEventYields[item.id];
    if (!amount || amount <= 0) continue;

    const prefix = item.id.split('-')[0];
    const source = sourceByContentType.get(prefix);
    if (!source) continue;

    result.push({
      itemKey: source.itemKey,
      delta: amount,
      date: endDate,
      source: source.id,
      labelKey: contentTypeLabelKey[prefix] ?? 'resources:eventLabels.title',
      labelParams: { boss: getScheduleTitle(item) },
    });
  }

  return result;
}

/** Merge any number of ResourceEvent[] arrays into one. */
export function mergeResourceEvents(...groups: ResourceEvent[][]): ResourceEvent[] {
  return groups.flat();
}

// ---------------------------------------------------------------------------
// GACHA + EVENT income adapters (eligma & student eleph)
// ---------------------------------------------------------------------------

function distributionDataToPmf(dist: DistributionData[]): ResourceDistributionEntry[] {
  return dist
    .filter((bin) => bin.pdf > 0)
    .map((bin) => ({
      amount: bin.binStart,
      probability: bin.pdf,
    }));
}

function binomialDistribution(trials: number, probability: number, amount: number): ResourceDistributionEntry[] {
  const n = Math.max(0, Math.floor(trials));
  const p = Math.max(0, Math.min(1, probability));
  if (n === 0 || amount === 0) return [{ amount: 0, probability: 1 }];
  if (p === 0) return [{ amount: 0, probability: 1 }];
  if (p === 1) return [{ amount: n * amount, probability: 1 }];

  const q = 1 - p;
  const entries: ResourceDistributionEntry[] = [];
  let probK = q ** n;
  for (let k = 0; k <= n; k++) {
    entries.push({ amount: k * amount, probability: probK });
    if (k < n) probK *= ((n - k) / (k + 1)) * (p / q);
  }
  return entries;
}

type GachaItemDistributionMap = Record<string, Record<string, ResourceDistributionEntry[]>>;

function buildGachaItemDistributionMap(gachaResult: GlobalAggregatedResult, studentIds: number[], includeEligma: boolean): GachaItemDistributionMap {
  const byBanner: GachaItemDistributionMap = {};

  if (includeEligma) {
    for (const bannerId of gachaResult.eligmaIncremental.keys()) {
      const entries = distributionDataToPmf(gachaResult.eligmaIncremental.dist(bannerId));
      if (entries.length > 0) byBanner[bannerId] = { ...(byBanner[bannerId] ?? {}), Item_23: entries };
    }
  }

  for (const studentId of studentIds) {
    let hasBannerDistribution = false;
    for (const [bannerId, studentDists] of Object.entries(gachaResult.distStudentElephMap ?? {})) {
      const entries = studentDists[studentId];
      if (!entries?.length) continue;
      hasBannerDistribution = true;
      byBanner[bannerId] = { ...(byBanner[bannerId] ?? {}), [`Item_${studentId}`]: entries };
    }
    if (!hasBannerDistribution) {
      const entries = gachaResult.studentStats?.[studentId]?.elephDistribution;
      const firstBannerId = gachaResult.bannerStats[0]?.bannerId;
      if (entries?.length && firstBannerId) {
        byBanner[firstBannerId] = { ...(byBanner[firstBannerId] ?? {}), [`Item_${studentId}`]: entries };
      }
    }
  }

  return byBanner;
}

function eventFromGachaDistribution(itemKey: string, entries: ResourceDistributionEntry[], date: string): ResourceEvent | null {
  const p10 = getResourceDistributionPercentile(entries, 10);
  const p50 = getResourceDistributionPercentile(entries, 50);
  const p90 = getResourceDistributionPercentile(entries, 90);
  if (getResourceDistributionMean(entries) <= 0) return null;
  return {
    itemKey,
    band: { p10, p50, p90 },
    dist: {
      entries,
      getAtPercentile: (pct: number) => getResourceDistributionPercentile(entries, pct),
      getMean: () => getResourceDistributionMean(entries),
    },
    date,
    source: 'gacha',
  };
}

/**
 * Gacha simulation → item distribution events on banner start dates.
 * Eligma (`Item_23`) and student eleph (`Item_${studentId}`) share the same path.
 */
export function eventsFromGachaItems(gachaResult: GlobalAggregatedResult | null | undefined, startDate: string, studentIds: number[] = [], options?: { includeEligma?: boolean }): ResourceEvent[] {
  if (!gachaResult?.bannerStats.length) return [];
  const result: ResourceEvent[] = [];
  const distributions = buildGachaItemDistributionMap(gachaResult, studentIds, options?.includeEligma ?? true);

  for (const banner of gachaResult.bannerStats) {
    const bannerDist = distributions[banner.bannerId];
    if (!bannerDist) continue;
    const date = banner.startTime.slice(0, 10) < startDate ? startDate : banner.startTime.slice(0, 10);

    for (const [itemKey, entries] of Object.entries(bannerDist)) {
      const event = eventFromGachaDistribution(itemKey, entries, date);
      if (event) result.push(event);
    }
  }
  return result;
}

/**
 * Event planner → student eleph deterministic lump sums on event end dates.
 * Only emits for students in `studentIds`.
 */
export function eventsFromEventEleph(eventPlans: Record<string, Partial<EventPlan>>, eventScheduleMap: Record<number, { date: string }>, studentIds: number[]): ResourceEvent[] {
  const studentIdSet = new Set(studentIds);
  const result: ResourceEvent[] = [];
  for (const [idStr, plan] of Object.entries(eventPlans)) {
    const gained = plan.cachedTotalItems?.gained;
    if (!gained) continue;
    const schedInfo = eventScheduleMap[Number(idStr)];
    if (!schedInfo?.date) continue;
    for (const [key, val] of Object.entries(gained)) {
      if (!key.startsWith('Item_')) continue;
      const id = Number(key.slice(5));
      if (!studentIdSet.has(id)) continue;
      const amount = val.amount ?? 0;
      if (amount <= 0) continue;
      result.push({
        itemKey: key,
        delta: amount,
        date: schedInfo.date,
        source: 'event_eleph',
      });
    }
  }
  return result;
}

/**
 * Event planner → eligma deterministic lump sums on event dates.
 * `eventItems` is already filtered and dated by the caller.
 */
export function eventsFromEventEligma(eventItems: { date: string; eligma: number }[]): ResourceEvent[] {
  return eventItems
    .filter((e) => e.date && e.eligma > 0)
    .map((e) => ({
      itemKey: 'Item_23',
      delta: e.eligma,
      date: e.date,
      source: 'event_eligma',
    }));
}

// ---------------------------------------------------------------------------
// HARD STAGE FARMING adapter
// ---------------------------------------------------------------------------

/**
 * Hard stage farming plans → per-student eleph P-band events + AP spend events.
 *
 * P-band uses a normal approximation of the binomial distribution:
 *   p50 = n × prob × (amount × mult)
 *   σ   = sqrt(n × prob × (1 − prob)) × (amount × mult)
 *
 * StageRewardProb is on a 0–10000 scale (divide by 10000 for probability).
 * hardEventSchedule carries 2x/3x campaign events; multiplier applies to drop amount.
 */
export function eventsFromHardStage(
  plans: Record<string, StageFarmingPlan>,
  campaigns: { jp: CampaignData; kr: CampaignData },
  startDate: string,
  hardEventSchedule?: { kr: ScheduleItemV2[]; jp: ScheduleItemV2[] },
): ResourceEvent[] {
  const multMap: Record<'kr' | 'jp', Record<string, number>> = { kr: {}, jp: {} };
  if (hardEventSchedule) {
    for (const srv of ['kr', 'jp'] as const) {
      for (const item of hardEventSchedule[srv]) {
        if (item.details?.campaignType !== 'Hard') continue;
        const mult = item.details.multiplier ?? 1;
        if (mult <= 1) continue;
        const toGameDate = (ms: number) => new Date(ms + 5 * 3600_000).toISOString().slice(0, 10);
        const start = toGameDate(new Date(item.startTime).getTime());
        const end = toGameDate(new Date(item.endTime ?? item.startTime).getTime() - 1);
        let cur = start;
        while (cur <= end) {
          multMap[srv][cur] = Math.max(multMap[srv][cur] ?? 1, mult);
          cur = isoAddDays(cur, 1);
        }
      }
    }
  }

  const result: ResourceEvent[] = [];

  for (const [key, plan] of Object.entries(plans)) {
    const planServer = (key.includes(':') ? key.split(':')[0] : 'kr') as 'kr' | 'jp';
    const rawStageId = key.includes(':') ? key.split(':')[1] : key;
    const stage = campaigns[planServer][rawStageId];
    if (!stage) continue;

    for (const [date, n] of Object.entries(plan.dailyRuns)) {
      if (date < startDate || n <= 0) continue;

      const mult = multMap[planServer][date] ?? 1;

      for (const reward of stage.Reward.map((v) => {
        if (v.StageRewardParcelTypeStr == 'Equipment') {
          return { ...v, StageRewardId: normalizeBluprintToEquipment(v.StageRewardId) };
        }
        return { ...v };
      })) {
        // if (!reward.IsDisplayed) continue;
        const prob = reward.StageRewardProb / 10000;
        const baseAmount = reward.StageRewardAmount;
        const itemMult = reward.StageRewardParcelTypeStr === 'Item' ? mult : 1;
        const amount = baseAmount * itemMult;
        const entries = binomialDistribution(n, prob, amount);
        const p10 = getResourceDistributionPercentile(entries, 10);
        const p50 = getResourceDistributionPercentile(entries, 50);
        const p90 = getResourceDistributionPercentile(entries, 90);

        if (p50 > 0 || p90 > 0) {
          result.push({
            itemKey: `${reward.StageRewardParcelTypeStr}_${reward.StageRewardId}`,
            band: { p10, p50, p90 },
            dist: {
              entries,
              getAtPercentile: (pct: number) => getResourceDistributionPercentile(entries, pct),
              getMean: () => n * prob * amount,
            },
            date,
            source: 'hard_farm',
          });
        }
      }

      result.push({
        itemKey: 'Currency_1',
        delta: -(n * stage.AP),
        date,
        source: 'hard_farm',
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// PvP TACTICAL (Item_8) adapters
// ---------------------------------------------------------------------------

export function eventsFromPvpIncome(pvpAverageRank: number, pvpDailyDefenseWins: number, pvpExtraWeeklyIncome: number, startDate: string, days: number): ResourceEvent[] {
  const result: ResourceEvent[] = [];
  const dailyBase = rankToDailyCoins(pvpAverageRank) + Math.min(pvpDailyDefenseWins * 3, 30);

  for (let d = 0; d < days; d++) {
    const date = isoAddDays(startDate, d);
    const isMonday = new Date(date + 'T00:00:00Z').getUTCDay() === 1;
    const total = dailyBase + (isMonday ? pvpExtraWeeklyIncome : 0);
    if (total > 0) result.push({ itemKey: 'Item_8', delta: total, date, source: 'pvp_income', labelKey: 'Item_8' });
  }

  // PvP shop purchases (AP, elephs, misc) are tracked via purchaseEvents (eventsFromPurchaseEvents).
  return result;
}

// ---------------------------------------------------------------------------
// JOINT FIRING DRILL (Item_60) adapter
// ---------------------------------------------------------------------------

export function eventsFromJfdCoins(jfdItems: ScheduleItemV2[], defaultDailyCoins: number, perPeriodCoins: Record<string, number>, startDate: string): ResourceEvent[] {
  const result: ResourceEvent[] = [];
  for (const item of jfdItems) {
    const dailyCoins = perPeriodCoins[item.id] ?? defaultDailyCoins;
    if (dailyCoins <= 0) continue;
    const periodStart = item.startTime.slice(0, 10);
    const periodEnd = item.endTime ? item.endTime.slice(0, 10) : periodStart;
    let cur = periodStart < startDate ? startDate : periodStart;
    const season = item.id.replace('jfd-', '');
    while (cur <= periodEnd) {
      result.push({ itemKey: 'Item_60', delta: dailyCoins, date: cur, source: 'jfd_daily', labelKey: 'resources:eventLabels.jfdSeason', labelParams: { season } });
      cur = isoAddDays(cur, 1);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// RAID / ELIMINATION period-end rewards adapter
// ---------------------------------------------------------------------------

export function eventsFromRaidRewards(
  raidItems: ScheduleItemV2[],
  globalRaidConfig: RaidDetailConfig | null,
  globalEraidConfig: RaidDetailConfig | null,
  detailConfigs: Record<string, RaidDetailConfig>,
  startDate: string,
  getScheduleTitle: (item: ScheduleItemV2) => string,
): ResourceEvent[] {
  const result: ResourceEvent[] = [];
  for (const item of raidItems) {
    const isRaid = item.id.startsWith('raid-');
    if (!isRaid && !item.id.startsWith('eraid-')) continue;
    const config = detailConfigs[item.id] ?? (isRaid ? globalRaidConfig : globalEraidConfig);
    if (!config) continue;
    const endDate = item.endTime ? item.endTime.slice(0, 10) : item.startTime.slice(0, 10);
    if (endDate < startDate) continue;
    const { normalCoin, premiumCoin, eligma } = calcRaidCoins(config, isRaid);
    const normalKey = isRaid ? 'Item_7' : 'Item_70';
    const premKey = isRaid ? 'Item_9' : 'Item_71';
    const raidLabelKey = isRaid ? 'resources:eventLabels.raidBoss' : 'resources:eventLabels.eraidBoss';
    const bossTitle = getScheduleTitle(item);
    result.push({ itemKey: normalKey, delta: normalCoin, date: endDate, source: 'raid_reward', labelKey: raidLabelKey, labelParams: { boss: bossTitle } });
    if (premiumCoin > 0) result.push({ itemKey: premKey, delta: premiumCoin, date: endDate, source: 'raid_reward_premium', labelKey: raidLabelKey, labelParams: { boss: bossTitle } });
    result.push({ itemKey: 'Item_23', delta: eligma, date: endDate, source: 'raid_eligma', labelKey: raidLabelKey, labelParams: { boss: bossTitle } });
  }
  return result;
}

// ---------------------------------------------------------------------------
// EXPERT PERMIT (Currency_18) adapter
// 12,000/week system cap applies to daily mode — resets Monday (UTC)
// ---------------------------------------------------------------------------

export function eventsFromExpertPermit(mode: 'weekly_max' | 'daily', weeklyMax: number, dailyAmounts: Record<string, number>, startDate: string, days: number): ResourceEvent[] {
  const result: ResourceEvent[] = [];

  if (mode === 'weekly_max' && weeklyMax > 0) {
    for (let d = 0; d < days; d++) {
      const date = isoAddDays(startDate, d);
      if (new Date(date + 'T00:00:00Z').getUTCDay() === 1) result.push({ itemKey: 'Currency_18', delta: weeklyMax, date, source: 'expert_permit', labelKey: 'Currency_18' });
    }
  } else if (mode === 'daily') {
    let weeklyTotal = 0;
    for (let d = 0; d < days; d++) {
      const date = isoAddDays(startDate, d);
      if (new Date(date + 'T00:00:00Z').getUTCDay() === 1) weeklyTotal = 0;
      const amount = dailyAmounts[date] ?? 0;
      if (amount <= 0) continue;
      const allowed = Math.min(amount, 12000 - weeklyTotal);
      if (allowed <= 0) continue;
      weeklyTotal += allowed;
      result.push({ itemKey: 'Currency_18', delta: allowed, date, source: 'expert_permit', labelKey: 'Currency_18' });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// MULTIFLOOR WB (Item_2000/2001/2002) adapter
// Floor 14+ cycles HP/ATK/Healing WB every 3 floors; amount scales with floor (1/2/3).
// ---------------------------------------------------------------------------

export const MULTIFLOOR_WB_KEYS = ['Item_2000', 'Item_2001', 'Item_2002'] as const;

export function calcMultifloorWBs(maxFloor: number): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  for (let f = 14; f <= Math.min(maxFloor, 97); f++) {
    const typeIdx = (f - 14) % 3;
    const amount = f <= 28 ? 1 : f <= 34 ? 2 : 3;
    counts[typeIdx] += amount;
  }
  return counts;
}

export function eventsFromMultifloorWBs(
  multifloorItems: ScheduleItemV2[],
  maxFloors: Record<string, number>,
  startDate: string,
  getScheduleTitle: (item: ScheduleItemV2) => string,
  defaultMaxFloor = 0,
): ResourceEvent[] {
  const result: ResourceEvent[] = [];
  for (const item of multifloorItems) {
    const maxFloor = maxFloors[item.id] ?? defaultMaxFloor;
    if (!maxFloor || maxFloor < 14) continue;
    const endDate = item.endTime ? item.endTime.slice(0, 10) : item.startTime.slice(0, 10);
    if (endDate < startDate) continue;
    const [wb0, wb1, wb2] = calcMultifloorWBs(maxFloor);
    const bossTitle = getScheduleTitle(item);
    if (wb0 > 0) result.push({ itemKey: 'Item_2000', delta: wb0, date: endDate, source: 'multifloor_wb', labelKey: 'resources:eventLabels.mfBoss', labelParams: { boss: bossTitle } });
    if (wb1 > 0) result.push({ itemKey: 'Item_2001', delta: wb1, date: endDate, source: 'multifloor_wb', labelKey: 'resources:eventLabels.mfBoss', labelParams: { boss: bossTitle } });
    if (wb2 > 0) result.push({ itemKey: 'Item_2002', delta: wb2, date: endDate, source: 'multifloor_wb', labelKey: 'resources:eventLabels.mfBoss', labelParams: { boss: bossTitle } });
  }
  return result;
}
