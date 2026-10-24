interface JfdCoinThreshold {
  minScore: number;
  coins: number;
}

const JFD_COIN_THRESHOLDS: JfdCoinThreshold[] = [
  { minScore: 241500, coins: 140 },
  { minScore: 239000, coins: 135 },
  { minScore: 236500, coins: 130 },
  { minScore: 227500, coins: 125 },
  { minScore: 212700, coins: 120 },
  { minScore: 197900, coins: 115 },
  { minScore: 170250, coins: 110 },
  { minScore: 167570, coins: 105 },
  { minScore: 153500, coins: 100 },
  { minScore: 138700, coins: 95 },
  { minScore: 123900, coins: 90 },
  { minScore: 104950, coins: 85 },
  { minScore: 94300, coins: 80 },
  { minScore: 79500, coins: 75 },
  { minScore: 64700, coins: 70 },
  { minScore: 49900, coins: 65 },
  { minScore: 35100, coins: 60 },
  { minScore: 20300, coins: 55 },
  { minScore: 5500, coins: 50 },
  { minScore: 0, coins: 40 },
];

export function getJfdCoinReward(score: number | undefined): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return null;
  const threshold = JFD_COIN_THRESHOLDS.find((item) => score >= item.minScore);
  return threshold?.coins ?? null;
}

export function formatJfdCoinReward(score: number | undefined, coinLabel: string): string | null {
  const reward = getJfdCoinReward(score);
  return reward === null ? null : `${reward}${coinLabel}`;
}
