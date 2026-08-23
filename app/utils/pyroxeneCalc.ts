import type { DistributionData } from './gachaEngine';
import { getEraidTicketExpiry, getEraidTicketAvailableFrom } from './gachaRules';

export const PYROXENE_PER_EVENT: Record<number, number> = {
  850: 1860,
  851: 1870,
  10839: 1905,
  852: 2180,
  10841: 1860,
  853: 2310,
  10840: 1905,
  854: 6280 + 1200,
  100854: 0,
  200854: 1200 + 1200,
  855: 2040,
  10842: 1900,
  856: 2100,
  10843: 1250,
  857: 2120,
  10845: 2270, //pray-ball
  858: 2120, // lore v2
  10847: 1920, //
  859: 1980, // kisaki
  10846: 2390, //highlander
  860: 1870, // makoto
  10844: 2080, //
};

export function getEventPyroxeneReward(eventSeason: number): number {
  // Balancing Schale's Books events (600xx) do not award Pyroxenes.
  if (eventSeason >= 60000 && eventSeason < 60100) return 0;
  return PYROXENE_PER_EVENT[eventSeason] ?? 1800;
}

export const PYROXENE_PER_MAIN_STORY: Record<string, number> = {
  vol6_ch1: 60 * 12,
  vol6_ch2: 60 * 11,
  vol6_ch3: 60 * 10,
  ex_deca_ch2_part1: 540,
  ex_deca_ch2_part2: 60,
  ex_deca_ch2_part3: 60,
  ex_deca_ch2_part4: 900,
  part2_prologue: 60 * 4,
  part2_vol0_ch1: 60 * 10,
  part2_ex_lore_ch1: 60 * 11,
  part2_ex_lore_ch2: 60 * 11,
  part2_vol1_ch1: 60 * 17,
  part2_vol1_ch2: 60 * 21,
};

export const PYROXENE_PER_MINI_STORY: Record<number, number> = {
  // 100 Pyroxenes Schedule: Direct Rewards (40) + Limited-Time Achievement Rewards (60)
  8: 40 * 3 + (30 + 30 + 40),
  9: (40 + 50) * 2,
  10: (40 + 50) * 2,
  11: (40 + 50) * 2,
  12: (40 + 50) * 2,
  13: (40 + 20) * 5,
  14: 40 * 6 + (15 + 15 + 15 + 15 + 15 + 25),
  15: 40 * 3 + 100,
};
// --- Types ---
export interface PlannerSchedule {
  id: string;
  name: string;
  start: string;
  end: string;
  type: 'Event' | 'Raid' | 'Elimination' | 'Multifloor' | 'Campaign' | 'JointFiringDrill' | 'MainStory' | 'MiniStory' | 'Momotalk' | 'Maintenance';
  amount?: number;
  campaignType?: string;
  multiplier?: number;
  isApEvent?: boolean; // true only for 8xx / 108xx event IDs
}

// Extended interface for Gantt chart rendering
export interface PackedSchedule extends PlannerSchedule {
  rowIndex: number; // Assigned row number
}

/**
 * A pool of term-limited 10-pull tickets, normalized to "pull units" (1-pull ticket = 1 unit,
 * 10-pull ticket = 10 units) so the gacha engine can spend them against any 10-pull action
 * regardless of which ticket denomination originally funded it.
 */
export interface TicketBatch {
  id: string;
  pullUnits: number;
  /** Unix ms timestamp the batch stops being usable, or null for a batch that never expires. */
  expiresAt: number | null;
  /** Unix ms timestamp the batch starts being usable (0 = already held, usable from the very start). */
  availableFrom: number;
  source: 'eraid' | 'manual';
  label?: string;
}

/** User-entered ticket batch, before normalization into a TicketBatch. */
export interface ManualTicketBatchInput {
  id: string;
  /** Date string (YYYY-MM-DD), or null/empty for a batch that never expires. */
  expiresAt: string | null;
  ticket1Count: number;
  ticket10Count: number;
}

export interface PyroxeneConfig {
  currentPyroxene: number;
  monthlyCard: boolean;
  halfMonthlyCard: boolean;
  monthlyPackCost: number; // Can be removed if unused
  monthlyExtraGem: number;

  apRefreshes_normal: number;
  apRefreshes_event: number;
  apRefreshes_campaigns?: Record<string, number>; // key: "{CampaignType}_{multiplier}", e.g. "Normal_2"

  raidRank: 'platinum' | 'gold' | 'silver' | 'bronze';
  pvpRankTier: number;
  selectedMainStoryIds?: string[];
  momotalkCount?: number;

  /** Term-limited ticket batches the player manually recorded (see ManualTicketBatchInput). */
  manualTicketBatches?: ManualTicketBatchInput[];
  /** IDs of past eraid  PlannerSchedule items the player is still holding an unspent ticket from. */
  selectedEraidTicketIds?: string[];
  /** Global policy: force-drain a ticket batch's remaining pull units at its last usable banner before it expires, instead of letting it expire unused. */
  consumeExpiringTickets?: boolean;
}

/* Normalize manual + eraid tickets into engine-ready TicketBatch[] */
export function buildInitialTicketBatches(config: Pick<PyroxeneConfig, 'manualTicketBatches' | 'selectedEraidTicketIds'>, schedules: PlannerSchedule[]): TicketBatch[] {
  const batches: TicketBatch[] = [];
  const now = new Date();
  const todayYMD = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((v, i) => (i === 0 ? String(v) : String(v).padStart(2, '0'))).join('-');

  for (const m of config.manualTicketBatches ?? []) {
    const pullUnits = (m.ticket1Count || 0) + (m.ticket10Count || 0) * 10;
    if (pullUnits <= 0) continue;
    let expiresAt: number | null = null;
    if (m.expiresAt) {
      const d = new Date(m.expiresAt);
      d.setHours(23, 59, 0, 0);
      expiresAt = d.getTime();
    }
    batches.push({ id: m.id, pullUnits, expiresAt, availableFrom: 0, source: 'manual' });
  }

  const selected = new Set(config.selectedEraidTicketIds ?? []);
  for (const s of schedules) {
    if (s.type !== 'Elimination') continue;
    if (s.end <= todayYMD) {
      if (!selected.has(s.id)) continue;
      batches.push({ id: s.id, pullUnits: 10, expiresAt: getEraidTicketExpiry(s.end), availableFrom: 0, source: 'eraid', label: s.name });
    } else {
      batches.push({ id: s.id, pullUnits: 10, expiresAt: getEraidTicketExpiry(s.end), availableFrom: getEraidTicketAvailableFrom(s.end), source: 'eraid', label: s.name });
    }
  }

  return batches;
}

// export interface SimulationResult {
//   date: string;
//   dateObj: Date;
//   pyroxene: number; // Cumulative net income (excluding gacha)
//   income: number;
//   expense: number; // Fixed expenses (AP, etc.)
//   events: string[];
// }

export interface SimulationStats {
  income: {
    dailyMission: number;
    weeklyMission: number;
    arona: number;
    pvp: number;
    monthlyCard: number;
    raid: number;
    elimination: number;
    multifloor: number;
    jfd: number;
    event: number;
    miniStory: number;
    maintenance: number;
    extra: number;
    mainstory: number;
  };
  expense: {
    ap: number;
    gacha: number;
  };
  totalIncome: number;
  totalExpense: number;
}

// --- Constants ---
export const PVP_REWARDS = [
  { rank: 1, reward: 45 },
  { rank: 2, reward: 40 },
  { rank: 10, reward: 35 },
  { rank: 100, reward: 30 },
  { rank: 200, reward: 25 },
  { rank: 500, reward: 20 },
  { rank: 1000, reward: 18 },
  { rank: 2000, reward: 16 },
  { rank: 99999, reward: 10 },
];

const RAID_REWARDS = {
  platinum: 1200 + 650,
  gold: 1000 + 650,
  silver: 800 + 650,
  bronze: 600 + 650,
};

// --- Helpers ---

// Calculate AP purchase cost
const getApCost = (count: number) => {
  let cost = 0;
  for (let i = 1; i <= count; i++) {
    if (i <= 3) cost += 30;
    else if (i <= 6) cost += 60;
    else if (i <= 9) cost += 90;
    else if (i <= 12) cost += 120;
    else if (i <= 15) cost += 150;
    else if (i <= 18) cost += 180;
    else cost += 210;
  }
  return cost;
};

export interface CustomIncome {
  id: string;
  date: string;
  title: string;
  amount: number;
}

export interface TimelineLog {
  title?: string;
  i18nKey?: string;
  params?: Record<string, string | number>;
  amount: number;
}

export interface TimelineEntry {
  date: string;
  dateObj: Date;
  pyroxene: number;
  income: number;
  expense: number;
  logs: TimelineLog[];
}

// Find the value corresponding to a specific percentile in the distribution data (interpolation)
export function getBinStartByCdf(data: DistributionData[], targetCdf: number): number {
  if (!data || data.length === 0) return 0;
  if (targetCdf <= data[0].cdf) return data[0].binStart;
  if (targetCdf >= data[data.length - 1].cdf) return data[data.length - 1].binStart;

  for (let i = 0; i < data.length - 1; i++) {
    const current = data[i];
    const next = data[i + 1];
    if (targetCdf >= current.cdf && targetCdf <= next.cdf) {
      const fraction = (targetCdf - current.cdf) / (next.cdf - current.cdf);
      return current.binStart + fraction * (next.binStart - current.binStart);
    }
  }
  return data[data.length - 1].binStart;
}

// Find the cumulative probability (CDF) for a specific cost spent
export function getCdfByBinValue(data: DistributionData[], targetBin: number): number {
  if (!data || data.length === 0) return 0;
  if (targetBin <= data[0].binStart) return data[0].cdf;
  if (targetBin >= data[data.length - 1].binStart) return data[data.length - 1].cdf;

  for (let i = 0; i < data.length - 1; i++) {
    const current = data[i];
    const next = data[i + 1];
    if (targetBin >= current.binStart && targetBin <= next.binStart) {
      const fraction = (targetBin - current.binStart) / (next.binStart - current.binStart);
      return current.cdf + fraction * (next.cdf - current.cdf);
    }
  }
  return data[data.length - 1].cdf;
}

// Gantt chart Row Packing algorithm
export function packScheduleRows(schedules: PlannerSchedule[]): PackedSchedule[] {
  // Sort by start date
  const sorted = [...schedules].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Array storing the 'last end date' of each row
  const lanes: number[] = [];
  const packed: PackedSchedule[] = [];

  for (const item of sorted) {
    const itemStart = new Date(item.start).getTime();
    const itemEnd = new Date(item.end).getTime();

    // Find the topmost row available (current row end date < my start date)
    let rowIndex = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] < itemStart) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex !== -1) {
      // Add to existing row and update end date
      lanes[rowIndex] = itemEnd;
    } else {
      // Create a new row
      lanes.push(itemEnd);
      rowIndex = lanes.length - 1;
    }

    packed.push({ ...item, rowIndex });
  }

  return packed;
}

// --- Main Calculation ---
export function calculatePyroxeneTimeline(
  config: PyroxeneConfig,
  schedules: PlannerSchedule[],
  options: {
    simulationDays?: number;
    customApOverrides?: Record<string, number>;
    customIncomes?: CustomIncome[];
  } = {},
): { timeline: TimelineEntry[]; stats: SimulationStats } {
  const { simulationDays = 180, customApOverrides = {}, customIncomes = [] } = options;
  const timeline: TimelineEntry[] = [];

  const stats: SimulationStats = {
    income: {
      dailyMission: 0,
      weeklyMission: 0,
      arona: 0,
      pvp: 0,
      monthlyCard: 0,
      raid: 0,
      elimination: 0,
      multifloor: 0,
      jfd: 0,
      event: 0,
      miniStory: 0,
      maintenance: 0,
      extra: 0,
      mainstory: 0,
    },
    expense: { ap: 0, gacha: 0 },
    totalIncome: 0,
    totalExpense: 0,
  };

  let currentPyro = config.currentPyroxene;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Track ticket grant/expiry dates in viewer's local time (not KST).
  const ticketBatches = buildInitialTicketBatches(config, schedules);
  const toLocalDateStr = (ms: number): string => {
    const d = new Date(ms);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((v, i) => (i === 0 ? String(v) : String(v).padStart(2, '0'))).join('-');
  };

  for (let d = 0; d < simulationDays; d++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + d);
    const dateStr = [currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate()].map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, '0'))).join('-');

    let dailyIncome = 0;
    let dailyExpense = 0;

    const logs: TimelineLog[] = [];

    for (const batch of ticketBatches) {
      if (batch.availableFrom > 0 && toLocalDateStr(batch.availableFrom) === dateStr) {
        if (batch.expiresAt !== null) {
          logs.push({ i18nKey: 'log.term_ticket_acquired_expiry', params: { count: batch.pullUnits, date: new Date(batch.expiresAt).toLocaleString() }, amount: 0 });
        } else {
          logs.push({ i18nKey: 'log.term_ticket_acquired', params: { count: batch.pullUnits }, amount: 0 });
        }
      }
      if (batch.expiresAt !== null && toLocalDateStr(batch.expiresAt) === dateStr) {
        logs.push({ i18nKey: 'log.term_ticket_expired', params: { count: batch.pullUnits, date: new Date(batch.expiresAt).toLocaleString() }, amount: 0 });
      }
    }

    // ==========================================
    // 1. Daily / Monthly Fixed Income
    // ==========================================
    let fixedDailyIncome = 0;
    const isSunday = currentDate.getDay() === 0;
    const isFriday = currentDate.getDay() === 5;

    const dailyBase = 20;
    const aronaDailyAvg = d % 10 == 4 ? 50 : d % 10 == 9 ? 100 : 0;
    stats.income.dailyMission += dailyBase;
    stats.income.arona += aronaDailyAvg;
    fixedDailyIncome += dailyBase + aronaDailyAvg;

    if (isFriday) {
      fixedDailyIncome += 120;
      stats.income.weeklyMission += 120;
    }

    const pvpReward = PVP_REWARDS.find((r) => r.rank >= config.pvpRankTier)?.reward || 10;
    fixedDailyIncome += pvpReward;
    stats.income.pvp += pvpReward;

    if (config.monthlyCard) {
      const monthlyIncome = 40 + (d % 30 ? 0 : 400);
      fixedDailyIncome += monthlyIncome;
      stats.income.monthlyCard += monthlyIncome;
    }
    if (config.halfMonthlyCard) {
      const monthlyIncome = 20 + (d % 30 ? 0 : 192);
      fixedDailyIncome += monthlyIncome;
      stats.income.monthlyCard += monthlyIncome;
    }

    dailyIncome += fixedDailyIncome;

    logs.push({
      i18nKey: isSunday ? 'log.fixed_daily_sunday' : 'log.fixed_daily',
      amount: fixedDailyIncome,
    });

    if (currentDate.getDate() === 1 && config.monthlyExtraGem > 0) {
      dailyIncome += config.monthlyExtraGem;
      stats.income.extra += config.monthlyExtraGem;
      logs.push({ i18nKey: 'log.monthly_extra', amount: config.monthlyExtraGem });
    }

    // ==========================================
    // 2. Schedule Events Check
    // ==========================================
    const endingSchedules = schedules.filter((s) => s.end === dateStr);
    const savedSelectedMainStoryIds = config.selectedMainStoryIds;
    const selectedMainStoryIdList: string[] = Array.isArray(savedSelectedMainStoryIds) ? savedSelectedMainStoryIds.filter((id): id is string => typeof id === 'string') : [];
    const selectedMainStoryIds = new Set<string>(selectedMainStoryIdList);
    const startingSchedules = schedules.filter((schedule) => schedule.start === dateStr && schedule.type !== 'MainStory');
    if (d === 0) {
      startingSchedules.push(...schedules.filter((schedule) => schedule.type === 'MainStory' && schedule.start <= dateStr && selectedMainStoryIds.has(schedule.id)));
      if ((config.momotalkCount || 0) > 0) startingSchedules.push({ id: 'momotalk-bulk', name: 'Momotalk', start: dateStr, end: dateStr, type: 'Momotalk', amount: (config.momotalkCount || 0) * 200 });
    } else {
      startingSchedules.push(...schedules.filter((schedule) => schedule.type === 'MainStory' && schedule.start === dateStr));
    }
    const activeSchedules = schedules.filter((s) => s.start <= dateStr && s.end >= dateStr);
    const activeEvt = activeSchedules.find((s) => s.type === 'Event');
    const activeCampaign = activeSchedules.find((s) => s.type === 'Campaign');

    endingSchedules.forEach((sch) => {
      let reward = 0;
      let logKey = '';

      switch (sch.type) {
        case 'Raid':
          reward = RAID_REWARDS[config.raidRank] || 600 + 650 + 70;
          stats.income.raid += reward;
          logKey = 'log.raid';
          break;
        case 'Elimination':
          reward = 650 + /*1200 +*/ 70;
          stats.income.elimination += reward;
          logKey = 'log.elimination';
          break;
        case 'JointFiringDrill':
          reward = 70;
          stats.income.jfd += reward;
          logKey = 'log.jfd';
          break;
      }

      if (reward > 0) {
        dailyIncome += reward;
        logs.push({ i18nKey: logKey, params: { name: sch.name }, amount: reward });
      }
    });

    startingSchedules.forEach((sch) => {
      let reward = 0;
      let logKey = '';

      switch (sch.type) {
        case 'Event':
          reward = sch.amount || 0;
          stats.income.event += reward;
          logKey = 'log.event';
          break;
        case 'MiniStory':
          reward = sch.amount || (10 + 20 + 40) * 2;
          stats.income.miniStory += reward;
          logKey = 'log.ministory';
          break;
        case 'Maintenance':
          reward = sch.amount || 360;
          stats.income.maintenance += reward;
          logKey = 'log.event';
          break;
        case 'Multifloor':
          reward = 10;
          stats.income.multifloor += reward;
          logKey = 'log.multifloor';
          break;
        case 'MainStory':
          reward = sch.amount || 0;
          stats.income.mainstory += reward;
          logKey = 'log.mainstory';
          break;
        case 'Momotalk':
          reward = sch.amount || 0;
          stats.income.extra += reward;
          logKey = 'log.momotalk';
          break;
      }

      if (reward > 0) {
        dailyIncome += reward;
        logs.push({ i18nKey: logKey, params: { name: sch.name }, amount: reward });
      }
    });

    // ==========================================
    // 3. Custom Incomes Check
    // ==========================================
    const todaysCustoms = customIncomes.filter((c) => c.date === dateStr);
    todaysCustoms.forEach((custom) => {
      dailyIncome += custom.amount;
      stats.income.extra += custom.amount;
      // User-defined value, passed directly as title without i18nKey
      logs.push({ title: custom.title, amount: custom.amount });
    });

    // ==========================================
    // 4. Expense (AP Refresh)
    // ==========================================
    let apCount = config.apRefreshes_normal;

    // Apply bulk defaults: only AP-eligible events (8xx / 108xx) use apRefreshes_event
    if (activeEvt?.isApEvent) apCount = Math.max(apCount, config.apRefreshes_event);
    if (activeCampaign) {
      const campKey = activeCampaign.campaignType && activeCampaign.multiplier ? `${activeCampaign.campaignType}_${activeCampaign.multiplier}` : null;
      const campDefault = campKey ? (config.apRefreshes_campaigns?.[campKey] ?? config.apRefreshes_normal) : config.apRefreshes_normal;
      apCount = Math.max(apCount, campDefault);
    }

    // Per-schedule overrides: event override takes priority, then campaign override
    const evtOverride = activeEvt ? customApOverrides[activeEvt.id] : undefined;
    const campOverride = activeCampaign ? customApOverrides[activeCampaign.id] : undefined;
    if (evtOverride !== undefined && evtOverride !== -1) apCount = evtOverride;
    else if (campOverride !== undefined && campOverride !== -1) apCount = campOverride;

    // Assuming getApCost function exists
    const apCost = getApCost(apCount);

    if (apCost > 0) {
      dailyExpense += apCost;
      stats.expense.ap += apCost;
      logs.push({ i18nKey: 'log.ap_refresh', amount: -apCost });
    }

    // ==========================================
    // 5. Calculate Final Balance for the Day
    // ==========================================
    currentPyro = currentPyro + dailyIncome - dailyExpense;
    stats.totalIncome += dailyIncome;
    stats.totalExpense += dailyExpense;

    timeline.push({
      date: dateStr,
      dateObj: currentDate,
      pyroxene: currentPyro,
      income: dailyIncome,
      expense: dailyExpense,
      logs,
    });
  }

  return { timeline, stats };
}
