// app/data/elephSources.ts
// Coin legend: 7=Total Assault, 8=Tactical Challenge, 9=Rare Total Assault, 60=Joint Firing
// Drill, 70=Grand Assault, 71=Rare Grand Assault, 23=Eligma, Currency_18=Expert Permit.
export type CoinItemId = 'Item_7' | 'Item_8' | 'Item_9' | 'Item_60' | 'Item_70' | 'Item_71' | 'Item_23' | 'Currency_18';

// BD item ID pattern: 3000 + school*10 + grade; Note items: 4000 + school*10 + grade
// (grade: 0=basic, 1=normal, 2=advanced, 3=premium; school 0–10)
export type ItemGrade = 'basic' | 'normal' | 'advanced' | 'premium';

const GRADE_LABELS: ItemGrade[] = ['basic', 'normal', 'advanced', 'premium'];

export function getBdGrade(itemKey: string): ItemGrade | null {
  if (!itemKey.startsWith('Item_')) return null;
  const id = Number(itemKey.slice(5));
  if (isNaN(id) || id < 3000 || id > 3103) return null;
  return GRADE_LABELS[(id - 3000) % 10] ?? null;
}

export function getNoteGrade(itemKey: string): ItemGrade | null {
  if (!itemKey.startsWith('Item_')) return null;
  const id = Number(itemKey.slice(5));
  if (isNaN(id) || id < 4000 || id > 4103) return null;
  return GRADE_LABELS[(id - 4000) % 10] ?? null;
}

// Canonical representative keys (subject 0) — used as gainItemKey in shop definitions
export const BD_GRADE_KEYS = {
  basic: 'Item_3000',
  normal: 'Item_3001',
  advanced: 'Item_3002',
  premium: 'Item_3003',
} as const;

export const NOTE_GRADE_KEYS = {
  basic: 'Item_4000',
  normal: 'Item_4001',
  advanced: 'Item_4002',
  premium: 'Item_4003',
} as const;

export interface CoinShopItem {
  gainItemKey: string;
  gainAmount: number;
  costPerBundle: number;
  tierCostAfterFirst?: number; // second+ purchase costs this instead (e.g. AP refills: 45 first, 55 after)
  monthlyLimit: number | null; // null = no monthly cap (refresh-dependent or unlimited)
  dailyLimit?: number;
  refreshCost?: number;
}

export interface CoinShopDef {
  coinKey: CoinItemId;
  canRefresh: boolean;
  refreshCost?: number; // coin cost per full shop refresh (when canRefresh is true)
  items: CoinShopItem[];
}

const BD_SCHOOL_COUNT = 11; // schools 0–10

function genBdNoteItems(bdLimits: [number, number, number, number], noteLimits: [number, number, number, number]): CoinShopItem[] {
  const items: CoinShopItem[] = [];
  const bdCosts = [10, 20, 50, 100] as const;
  const noteCosts = [3, 5, 10, 25] as const;
  for (let school = 0; school < BD_SCHOOL_COUNT; school++) {
    for (let grade = 0; grade < 4; grade++) {
      items.push({ gainItemKey: `Item_${3000 + school * 10 + grade}`, gainAmount: 1, costPerBundle: bdCosts[grade], monthlyLimit: bdLimits[grade] });
    }
  }
  for (let school = 0; school < BD_SCHOOL_COUNT; school++) {
    for (let grade = 0; grade < 4; grade++) {
      items.push({ gainItemKey: `Item_${4000 + school * 10 + grade}`, gainAmount: 1, costPerBundle: noteCosts[grade], monthlyLimit: noteLimits[grade] });
    }
  }
  return items;
}

// BD + Note items for standard difficulty shops (Item_7, Item_70)
// TODO: verify exact limits per shop from in-game data
const BD_NOTE_STANDARD: CoinShopItem[] = genBdNoteItems([40, 30, 25, 6], [50, 40, 30, 20]);

// BD + Note items for advanced difficulty shops (Item_9, Item_71)
// TODO: verify exact limits from in-game data
const BD_NOTE_ADVANCED: CoinShopItem[] = genBdNoteItems([12, 10, 8, 2], [16, 12, 10, 6]);

export const COIN_SHOP_DEFS: CoinShopDef[] = [
  // Total Assault Shop (Item_7) — standard
  {
    coinKey: 'Item_7',
    canRefresh: false,
    items: [
      { gainItemKey: 'Item_20009', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Cherino (Hot Spring)
      { gainItemKey: 'Item_23007', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Hanako
      { gainItemKey: 'Item_13011', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Momoi
      { gainItemKey: 'Item_26001', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Kotama
      { gainItemKey: 'Item_23002', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Hanae
      { gainItemKey: 'Item_10007', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Maki
      { gainItemKey: 'Item_13000', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Akane
      { gainItemKey: 'Item_26000', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Chinatsu
      ...BD_NOTE_STANDARD,
    ],
  },

  // Rare Total Assault Shop (Item_9) — advanced
  {
    coinKey: 'Item_9',
    canRefresh: false,
    items: [
      { gainItemKey: 'Item_20013', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Chihiro
      { gainItemKey: 'Item_10020', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Koharu
      { gainItemKey: 'Item_10019', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Azusa
      { gainItemKey: 'Item_10016', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Midori
      ...BD_NOTE_ADVANCED,
    ],
  },

  // Grand Assault Shop (Item_70) — standard
  {
    coinKey: 'Item_70',
    canRefresh: false,
    items: [
      { gainItemKey: 'Item_10018', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Yuzu
      { gainItemKey: 'Item_10034', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Mimori
      { gainItemKey: 'Item_20011', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Serika (New Year)
      { gainItemKey: 'Item_10029', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Natsu
      { gainItemKey: 'Item_10024', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Shiroko (Riding)
      { gainItemKey: 'Item_20017', gainAmount: 5, costPerBundle: 50, monthlyLimit: 20 }, // Hiyori
      ...BD_NOTE_STANDARD,
    ],
  },

  // Rare Grand Assault Shop (Item_71) — advanced
  {
    coinKey: 'Item_71',
    canRefresh: false,
    items: [
      { gainItemKey: 'Item_20012', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Sena
      { gainItemKey: 'Item_10028', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Asuna (Bunny Girl)
      { gainItemKey: 'Item_20015', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Kaede
      { gainItemKey: 'Item_10043', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Wakamo (Swimsuit)
      ...BD_NOTE_ADVANCED,
    ],
  },

  // Tactical Challenge Shop (Item_8) — refreshable (1 free + 3 paid = 4 views/day for misc items)
  {
    coinKey: 'Item_8',
    canRefresh: true,
    refreshCost: 10,
    items: [
      // AP (Currency_5): 45 coins first, 55 after; 4/day (1 free + 3 paid refreshes)
      { gainItemKey: 'Currency_5', gainAmount: 90, costPerBundle: 45, monthlyLimit: null, dailyLimit: 4 },
      { gainItemKey: 'Item_10039', gainAmount: 5, costPerBundle: 50, monthlyLimit: null, dailyLimit: 4 },
      { gainItemKey: 'Item_10038', gainAmount: 5, costPerBundle: 50, monthlyLimit: null, dailyLimit: 4 }, // Miyako
      { gainItemKey: 'Item_23006', gainAmount: 5, costPerBundle: 50, monthlyLimit: null, dailyLimit: 4 }, // Shizuko
      { gainItemKey: 'Item_20003', gainAmount: 5, costPerBundle: 50, monthlyLimit: null, dailyLimit: 4 }, // Mashiro
      { gainItemKey: 'Item_20002', gainAmount: 5, costPerBundle: 50, monthlyLimit: null, dailyLimit: 4 }, // Saya
      { gainItemKey: 'Item_23001', gainAmount: 5, costPerBundle: 50, monthlyLimit: null, dailyLimit: 4 }, // Fuuka
      { gainItemKey: 'Item_23004', gainAmount: 5, costPerBundle: 50, monthlyLimit: null, dailyLimit: 4 }, // Utaha
      // Misc items — 4/day (1 initial + 3 paid refreshes)
      { gainItemKey: 'Item_10', gainAmount: 10, costPerBundle: 5, monthlyLimit: null, dailyLimit: 4 },
      { gainItemKey: 'Item_11', gainAmount: 5, costPerBundle: 25, monthlyLimit: null, dailyLimit: 4 },
      { gainItemKey: 'Item_12', gainAmount: 3, costPerBundle: 60, monthlyLimit: null, dailyLimit: 4 },
      { gainItemKey: 'Item_13', gainAmount: 1, costPerBundle: 100, monthlyLimit: null, dailyLimit: 4 },
      // Credit bundles (Currency_1) — 4/day
      { gainItemKey: 'Currency_1', gainAmount: 5000, costPerBundle: 4, monthlyLimit: null, dailyLimit: 4 },
      { gainItemKey: 'Currency_1', gainAmount: 25000, costPerBundle: 20, monthlyLimit: null, dailyLimit: 4 },
      { gainItemKey: 'Currency_1', gainAmount: 75000, costPerBundle: 60, monthlyLimit: null, dailyLimit: 4 },
      { gainItemKey: 'Currency_1', gainAmount: 125000, costPerBundle: 100, monthlyLimit: null, dailyLimit: 4 },
    ],
  },

  // Joint Firing Drill Shop (Item_60) — JFD
  {
    coinKey: 'Item_60',
    canRefresh: false,
    items: [
      { gainItemKey: 'Item_20010', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Nodoka (Hot Spring)
      { gainItemKey: 'Item_10013', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Tsurugi
      { gainItemKey: 'Item_10001', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Eimi
      { gainItemKey: 'Item_10012', gainAmount: 5, costPerBundle: 50, monthlyLimit: 10 }, // Sumire
    ],
  },

  // Expert Permit Shop (Currency_18)
  {
    coinKey: 'Currency_18',
    canRefresh: false,
    items: [
      { gainItemKey: 'Item_23', gainAmount: 5, costPerBundle: 600, monthlyLimit: 6 }, // Eligma
    ],
  },
];

// Lookup: coinKey → shop definition
export const COIN_SHOP_BY_COIN_KEY: Record<CoinItemId, CoinShopDef> = Object.fromEntries(COIN_SHOP_DEFS.map((def) => [def.coinKey, def])) as Record<CoinItemId, CoinShopDef>;

// ---------------------------------------------------------------------------
// Expert Permit — Currency_18
// ---------------------------------------------------------------------------

export type ExpertPermitStudentType = 'pass_limited' | 'limited' | 'distributed';

export const EXPERT_PERMIT_ELEPH_COST: Record<ExpertPermitStudentType, { expertPermitPer5Eleph: number; monthlyMaxPurchases: number }> = {
  pass_limited: { expertPermitPer5Eleph: 2400, monthlyMaxPurchases: 2 },
  limited: { expertPermitPer5Eleph: 1800, monthlyMaxPurchases: 2 },
  distributed: { expertPermitPer5Eleph: 1800, monthlyMaxPurchases: 6 },
};

// Eligma exchange: 5 Eligma for 600 Expert Permits, up to 6 times per month
export const EXPERT_PERMIT_ELIGMA = { expertPermitPer5: 600, monthlyMax: 6 } as const;

// Item-to-purchase-currency mapping (e.g., Item_23 is purchased from the Currency_18 shop)
export const GAIN_ITEM_TO_COIN_KEY: Record<string, CoinItemId> = {
  Item_23: 'Currency_18',
};

// Collab students who cannot use the Expert Permit shop
export const EXPERT_PERMIT_SHOP_EXCLUDED_IDS = new Set<number>([
  20007, // Hatsune Miku
  10079, // Misaka Mikoto
  10080, // Shokuhou Misaki
  26011, // Saten Ruiko
  10099, // Exclude the Expert Permit Shop
]);
