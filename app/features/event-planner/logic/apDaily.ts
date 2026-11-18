// Pure AP supply model shared by the AP calculator tab and the resource efficiency chart.
import type { ApCalculatorConfig } from '~/types/minigame/apCalculator';

// AP generation per hour by cafe rank
const CAFE_AP_PER_HOUR = [0, 0, 0, 0, 0, 0, 19.49, 22.32, 25.15, 27.97, 30.8]; // Ranks 0 to 10
const AP_PER_MINUTE = 1 / 6;

export interface DailyBreakdown {
  natural: number;
  dailyQuests: number;
  cafe: number;
  gem: number;
  pvp: number;
  weekly: number;
  attendance: number;
  spendHard: number;
  spendExchange: number;
  spendMisc: number;
  total: number;
  apPackage: number;
}

export const toLocalISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface DailyApResult {
  daily: Record<string, DailyBreakdown>;
  total: number;
}

export function computeDailyAp(config: ApCalculatorConfig): DailyApResult {
  const dailyBreakdown: Record<string, DailyBreakdown> = {};
  let totalAp = 0;
  const start = new Date(config.startDate);
  const end = new Date(config.endDate);
  const attendanceBaseDate = new Date(config.attendanceStartDate);

  const apPackageEffectiveDays = new Set<string>();
  const sortedPackageDates = [...config.apPackageDates].sort();
  let lastPackageEndDate: Date | null = null;

  sortedPackageDates.forEach((startDateStr) => {
    const packageStartDate = new Date(startDateStr);
    // Adjust start date because a new package cannot be started before the previous package ends
    if (lastPackageEndDate && packageStartDate <= lastPackageEndDate) {
      packageStartDate.setTime(lastPackageEndDate.getTime() + 24 * 60 * 60 * 1000); // Start from the next day
    }

    for (let i = 0; i < 14; i++) {
      const effectiveDate = new Date(packageStartDate);
      effectiveDate.setDate(effectiveDate.getDate() + i);
      apPackageEffectiveDays.add(toLocalISOString(effectiveDate));
    }
    // Record the end date (14 days later) of the current package
    lastPackageEndDate = new Date(packageStartDate);
    lastPackageEndDate.setDate(lastPackageEndDate.getDate() + 13);
  });

  // const totalDurationMinutes = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));
  // totalAp += totalDurationMinutes * AP_PER_MINUTE;

  totalAp = Object.values(dailyBreakdown).reduce((sum, daily) => sum + daily.total, 0);
  totalAp += config.bonusAp;

  const loopStartDate = new Date(start);
  loopStartDate.setHours(0, 0, 0, 0);

  for (let d = new Date(loopStartDate); d <= end; d.setDate(d.getDate() + 1)) {
    // const dateString = d.toISOString().slice(0, 10);
    const dateString = toLocalISOString(d);
    const isFirstDay = dateString === toLocalISOString(start);
    const isLastDay = dateString === toLocalISOString(end);

    const daily: DailyBreakdown = {
      natural: 0,
      dailyQuests: 170,
      cafe: 0,
      gem: config.gemRefills * 120,
      pvp: config.pvpRefills * 90,
      weekly: 0,
      attendance: 0,
      spendHard: config.hardStages * 20,
      spendExchange: config.exchangeRuns * config.exchangeCost,
      spendMisc: config.miscDailySpend,
      total: 0,
      apPackage: apPackageEffectiveDays.has(dateString) ? 150 : 0,
    };

    if (isFirstDay && isLastDay) {
      // If the event ends within a day
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      daily.natural = durationMinutes * AP_PER_MINUTE;
      const startHour = start.getHours();
      const endHour = end.getHours();
      daily.cafe = Math.max(0, endHour - (startHour + 1) + 1) * CAFE_AP_PER_HOUR[config.cafeRank];
      daily.spendHard = 0;
      daily.spendExchange = 0;
      daily.spendMisc = 0;
    } else if (isFirstDay) {
      // First day
      const minutesInDay = 24 * 60 - (start.getHours() * 60 + start.getMinutes());
      daily.natural = minutesInDay * AP_PER_MINUTE;
      daily.cafe = (24 - (start.getHours() + 1)) * CAFE_AP_PER_HOUR[config.cafeRank];
      daily.spendHard = 0;
      daily.spendExchange = 0;
      daily.spendMisc = 0;
    } else if (isLastDay) {
      // Last day
      const minutesInDay = end.getHours() * 60 + end.getMinutes();
      daily.natural = minutesInDay * AP_PER_MINUTE;
      daily.cafe = end.getHours() * CAFE_AP_PER_HOUR[config.cafeRank];
      daily.spendHard = 0;
      daily.spendExchange = 0;
      daily.spendMisc = 0;
    } else {
      // Middle day
      daily.natural = 24 * 60 * AP_PER_MINUTE;
      daily.cafe = 24 * CAFE_AP_PER_HOUR[config.cafeRank];
    }

    const dayOfWeek = d.getDay();
    if (dayOfWeek === 2) daily.weekly = 150;
    else if (dayOfWeek === 5) daily.weekly = 200;

    const diffTime = d.getTime() - attendanceBaseDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const currentAttendanceDay = config.attendanceStartDay + diffDays;

    if (currentAttendanceDay > 0) {
      const cycleDay = (currentAttendanceDay - 1) % 10;
      if (cycleDay === 3) daily.attendance = 50;
      else if (cycleDay === 8) daily.attendance = 100;
    }

    const gains = daily.natural + daily.dailyQuests + daily.cafe + daily.gem + daily.pvp + daily.weekly + daily.attendance + daily.apPackage;
    const spends = daily.spendHard + daily.spendExchange + daily.spendMisc;
    daily.total = Math.round(gains - spends);

    dailyBreakdown[dateString] = daily;
    totalAp += daily.total;
  }

  return { daily: dailyBreakdown, total: Math.round(totalAp) };
}

export interface ApTimelineEntry {
  date: string;
  dailyAp: number;
  cumulativeAp: number;
}

/** Day-by-day net AP with a running total; `bonusAp` is counted up front, matching the calculator's total. */
export function buildApTimeline(result: DailyApResult, bonusAp: number): ApTimelineEntry[] {
  let cumulativeAp = bonusAp;
  return Object.entries(result.daily).map(([date, d]) => {
    cumulativeAp += d.total;
    return { date, dailyAp: d.total, cumulativeAp };
  });
}

/** First date by whose end `ap` has been accumulated, or null if the supply never reaches it. */
export function dateReachingAp(timeline: ApTimelineEntry[], ap: number): string | null {
  return timeline.find((e) => e.cumulativeAp >= ap)?.date ?? null;
}
