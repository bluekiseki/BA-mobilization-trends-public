import { apCalculatorConfigSchema, type ApCalculatorConfig } from '~/types/minigame/apCalculator';

export { apCalculatorConfigSchema, type ApCalculatorConfig };

export const getDefaultApConfig = (startTime: string, endTime: string): ApCalculatorConfig => ({
  startDate: startTime.slice(0, 16),
  endDate: endTime.slice(0, 16),
  cafeRank: 10,
  gemRefills: 3,
  pvpRefills: 0,
  hardStages: 3,
  exchangeRuns: 0,
  exchangeCost: 15,
  miscDailySpend: 0,
  attendanceStartDate: new Date().toISOString().slice(0, 10),
  attendanceStartDay: 1,
  bonusAp: 0,
  apPackageDates: [],
});

/** Saved settings with empty dates filled from the event window; defaults when nothing is saved. */
export const resolveApConfig = (saved: ApCalculatorConfig | undefined, startTime: string, endTime: string): ApCalculatorConfig => {
  const defaults = getDefaultApConfig(startTime, endTime);
  return saved ? { ...saved, startDate: saved.startDate || defaults.startDate, endDate: saved.endDate || defaults.endDate } : defaults;
};
