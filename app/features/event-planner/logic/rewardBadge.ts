// Corner badge shown on reward icons, shared so every planner uses the same label and color per reward tag.
export interface RewardBadge {
  label: string | null;
  labelColor: string;
}

const BADGES: Record<string, RewardBadge> = {
  Rare: { label: 'Rare', labelColor: 'bg-[#2f4e73]' },
  FirstClear: { label: 'First', labelColor: 'bg-yellow-500' },
  ThreeStar: { label: '３★', labelColor: 'bg-amber-400' },
};

const NO_BADGE: RewardBadge = { label: null, labelColor: 'bg-neutral-700' };

export const getRewardBadge = (rewardTagStr: string): RewardBadge => BADGES[rewardTagStr] ?? NO_BADGE;
