import type { DistributionData } from './gachaEngine';

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
};

export const PYROXENE_PER_MAIN_STORY: Record<string, number> = {
  'Vol.6 Ch.2': 660,
  'Vol.6 Ch.3': 600,
  'Vol.Ex Ch.3 Pt.1': 540,
  'Vol.Ex Ch.3 Pt.2': 60,
  'Vol.Ex Ch.3 Pt.3': 60,
  'Vol.Ex Ch.3 Pt.4': 900,
};

// --- Types ---
export interface PlannerSchedule {
  id: string;
  name: string;
  start: string;
  end: string;
  type: 'Event' | 'Raid' | 'Elimination' | 'Multifloor' | 'Campaign' | 'JointFiringDrill' | 'MainStory';
  amount?: number;
}

// Extended interface for Gantt chart rendering
export interface PackedSchedule extends PlannerSchedule {
  rowIndex: number; // Assigned row number
}

export interface PyroxeneConfig {
  currentPyroxene: number;
  currentTicket1: number;
  currentTicket10: number;
  monthlyCard: boolean;
  halfMonthlyCard: boolean;
  monthlyPackCost: number; // Can be removed if unused
  monthlyExtraGem: number;

  apRefreshes_normal: number;
  apRefreshes_event: number;

  raidRank: 'platinum' | 'gold' | 'silver' | 'bronze';
  pvpRankTier: number;
}

export interface SimulationResult {
  date: string;
  dateObj: Date;
  pyroxene: number; // Cumulative net income (excluding gacha)
  income: number;
  expense: number; // Fixed expenses (AP, etc.)
  events: string[];
}

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
): { timeline: any[]; stats: SimulationStats } {
  const { simulationDays = 180, customApOverrides = {}, customIncomes = [] } = options;
  const timeline: any[] = [];

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

  for (let d = 0; d < simulationDays; d++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + d);
    const dateStr = currentDate.toISOString().split('T')[0];

    let dailyIncome = 0;
    let dailyExpense = 0;

    const logs: { title?: string; i18nKey?: string; params?: any; amount: number }[] = [];

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
    const startingSchedules = schedules.filter((s) => s.start === dateStr);
    let isEventPeriod = false;

    const activeSchedules = schedules.filter((s) => s.start <= dateStr && s.end >= dateStr);
    const activeEvent = activeSchedules.find((s) => s.type === 'Event' || s.type === 'Campaign');
    if (activeEvent) isEventPeriod = true;

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
          reward = 650 + 1200 + 70;
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
          reward = Number(sch.amount || 0);
          stats.income.event += reward;
          logKey = 'log.event';
          break;
        case 'Multifloor':
          reward = 60;
          stats.income.multifloor += reward;
          logKey = 'log.multifloor';
          break;
        case 'MainStory':
          reward = Number(sch.amount || 0);
          stats.income.mainstory += reward;
          logKey = 'log.mainstory';
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
    let apCount = isEventPeriod ? config.apRefreshes_event : config.apRefreshes_normal;

    if (activeEvent && customApOverrides[activeEvent.id] !== undefined && customApOverrides[activeEvent.id] !== -1) {
      apCount = customApOverrides[activeEvent.id];
    }

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
