export type TotalRewardResult = {
  cost: { key: string; amount: number } | null;
  rewards: Record<string, number>;
};

export type MissionResult = {
  rewards: Record<string, number>;
};

export type ShopResult = {
  costs: Record<string, number>;
  rewards: Record<string, number>;
};

export type TotalBonusMap = { [itemUniqueId: number]: number };
