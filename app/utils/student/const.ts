// --- Helper constants and components ---
export const uwMaxLevelMap: Record<number, number> = {
  0: 1,
  1: 30,
  2: 40,
  3: 50,
  4: 60,
  5: 70,
};
export const TIER_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);
export const TIER_TO_LEVEL: Record<number, number> = {
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 45,
  6: 50,
  7: 55,
  8: 60,
  9: 65,
  10: 70,
};

export const MAX_LEVEL = 90;
export const MAX_TIER = 10;

// --- Constants ---
export const HighFlowerBouquetItemIds = [5996, 5997];
export const LowFlowerBouquetItemIds = [5998, 5999];

// Gift conversion (crafting) cost per craft: one high-grade stone, credits and crafting time.
export const CRAFT_STONE_COST = 1;
export const CRAFT_CREDIT_COST = 12000;
export const CRAFT_HOURS = 3;
// Inventory key of the stone used for gift conversion (Advanced Fusion Keystone, yellow).
export const CRAFT_STONE_ITEM_KEY = 'Item_82';
