// Treasure type colors, indexed by the type's position in the round's RewardId list.
const TREASURE_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#737373', '#3b82f6'];

export const treasureColor = (typeIndex: number) => TREASURE_COLORS[typeIndex % TREASURE_COLORS.length];
