import { apCalculatorConfigSchema, type ApCalculatorConfig } from '~/types/minigame/apCalculator';

export { apCalculatorConfigSchema, type ApCalculatorConfig };

export const getDefaultApConfig = (startTime: string, endTime: string): ApCalculatorConfig => ({
  startDate: startTime.slice(0, 16),
  endDate: endTime.slice(0, 16),
  cafeRank: 10,
  gemRefills: 3,
  pvpRefills: 1,
  hardStages: 3,
  exchangeRuns: 0,
  exchangeCost: 15,
  miscDailySpend: 0,
  attendanceStartDate: new Date().toISOString().slice(0, 10),
  attendanceStartDay: 1,
  bonusAp: 0,
  apPackageDates: [],
});
