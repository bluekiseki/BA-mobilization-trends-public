export type StagePrio = 'include' | 'exclude' | 'priority';
export type FarmingTab = 'repeatable' | 'onetime';
export type FarmingResult = {
  totalItems: Record<string, { amount: number; isBonusApplied: boolean }>;
  totalApUsed: number;
};
