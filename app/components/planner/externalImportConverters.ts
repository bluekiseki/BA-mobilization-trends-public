// app/components/planner/externalImportConverters.ts
import { equipmentBlueprintId, equipmentReinforcementExp, reportExp, reportItemIds } from '~/data/growthData';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Locale } from '~/utils/i18n/config';

const makeUuid = (id: string | number) => `import-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const n = (v: unknown, fallback = 0): number => {
  const num = Number(v);
  return isNaN(num) ? fallback : num;
};

// ── Equipment blueprint reverse map: "Equipment_103006" -> "T7_Shoes" ──────────────────────
const OUR_BP_TO_JUSTIN163: Record<string, string> = {};
for (const [typeName, ids] of Object.entries(equipmentBlueprintId)) {
  ids.forEach((bpId, idx) => {
    if (bpId) OUR_BP_TO_JUSTIN163[`Equipment_${bpId}`] = `T${idx + 1}_${typeName}`;
  });
}

// justin163 part name -> our system equipment type
const JUSTIN163_PART_MAP: Partial<Record<string, keyof typeof equipmentBlueprintId>> = {
  Hat: 'Hat',
  Gloves: 'Gloves',
  Shoes: 'Shoes',
  Bag: 'Bag',
  Badge: 'Badge',
  Hairpin: 'Hairpin',
  Charm: 'Charm',
  Watch: 'Watch',
  Necklace: 'Necklace',
};

function parseBlueprintKey(tierStr: string, partName: string): string | null {
  const tier = parseInt(tierStr);
  const ourType = JUSTIN163_PART_MAP[partName];
  if (!ourType) return null;
  const bpId = equipmentBlueprintId[ourType][tier - 1];
  return bpId ? `Equipment_${bpId}` : null;
}

// ── XP / Enhancement stone conversion helper ────────────────────────────────────────────────────
const REPORT_IDS = reportItemIds as Record<number, number>;
const REPORT_EXP = reportExp as Record<number, number>;
const EQUIP_EXP = equipmentReinforcementExp as Record<number, number>;

function xpToReports(totalXp: number): Record<string, number> {
  const result: Record<string, number> = {};
  let remaining = totalXp;
  for (let grade = 4; grade >= 1; grade--) {
    const count = Math.floor(remaining / REPORT_EXP[grade]);
    if (count > 0) {
      result[`Item_${REPORT_IDS[grade]}`] = count;
      remaining -= count * REPORT_EXP[grade];
    }
  }
  if (remaining > 0) result[`Item_${REPORT_IDS[1]}`] = (result[`Item_${REPORT_IDS[1]}`] ?? 0) + 1;
  return result;
}

function gearXpToStones(totalXp: number): Record<string, number> {
  const result: Record<string, number> = {};
  let remaining = totalXp;
  for (let i = 3; i >= 0; i--) {
    const count = Math.floor(remaining / EQUIP_EXP[i]);
    if (count > 0) {
      result[`Equipment_${i + 1}`] = count;
      remaining -= count * EQUIP_EXP[i];
    }
  }
  if (remaining > 0) result[`Equipment_1`] = (result[`Equipment_1`] ?? 0) + 1;
  return result;
}

// ── Parsing justin163 owned_materials ───────────────────────────────────────────
function parseJustin163Materials(owned: Record<string, string | number>): {
  materials: Record<string, number>;
  gifts: Record<string, number>;
} {
  const materials: Record<string, number> = {};
  const gifts: Record<string, number> = {};
  let hasGradeXpKey = false;
  let hasGradeGxpKey = false;

  for (const [key, rawVal] of Object.entries(owned)) {
    const val = Number(rawVal);
    if (!val || isNaN(val) || val <= 0) continue;

    // XP_N: Report quantity per tier
    const xpGradeMatch = key.match(/^XP_(\d)$/);
    if (xpGradeMatch) {
      hasGradeXpKey = true;
      const grade = parseInt(xpGradeMatch[1]);
      const reportId = REPORT_IDS[grade];
      if (reportId) materials[`Item_${reportId}`] = (materials[`Item_${reportId}`] ?? 0) + val;
      continue;
    }

    if (key === 'Xp') continue; // Skip because it is processed by XP_N

    // GXP_N: Enhancement stone quantity per tier (Equipment_1~4)
    const gxpGradeMatch = key.match(/^GXP_(\d)$/);
    if (gxpGradeMatch) {
      hasGradeGxpKey = true;
      const grade = parseInt(gxpGradeMatch[1]); // 1~4 → Equipment_1~4
      materials[`Equipment_${grade}`] = (materials[`Equipment_${grade}`] ?? 0) + val;
      continue;
    }

    // GearXp: Total XP -> Convert to enhancement stones only when GXP_N is absent
    if (key === 'GearXp') continue;

    // T{tier}_{type}: Equipment blueprint
    const bpMatch = key.match(/^T(\d+)_(.+)$/);
    if (bpMatch) {
      const bpKey = parseBlueprintKey(bpMatch[1], bpMatch[2]);
      if (bpKey) materials[bpKey] = (materials[bpKey] ?? 0) + val;
      continue;
    }

    // Pure numeric ID: 5xxx -> Gift, the rest -> Item_
    if (/^\d+$/.test(key)) {
      const id = parseInt(key);
      if (id >= 5000 && id < 6000) {
        gifts[key] = val;
      } else {
        materials[`Item_${id}`] = val;
      }
    }
  }

  // If no XP_N, distribute reports by total Xp
  if (!hasGradeXpKey && owned['Xp']) {
    const totalXp = Number(owned['Xp']);
    if (totalXp > 0) {
      for (const [k, v] of Object.entries(xpToReports(totalXp))) {
        materials[k] = (materials[k] ?? 0) + v;
      }
    }
  }

  // If no GXP_N, distribute enhancement stones by total GearXp
  if (!hasGradeGxpKey && owned['GearXp']) {
    const totalGearXp = Number(owned['GearXp']);
    if (totalGearXp > 0) {
      for (const [k, v] of Object.entries(gearXpToStones(totalGearXp))) {
        materials[k] = (materials[k] ?? 0) + v;
      }
    }
  }

  return { materials, gifts };
}

// ── Public types & functions ──────────────────────────────────────────────────────────
export type ImportFormat = 'justin163' | 'schaledb' | 'unknown';

export interface ConvertResult {
  format: ImportFormat;
  plans: GrowthPlan[] | null;
  materials: Record<string, number> | null;
  gifts: Record<string, number> | null;
}

/** Parse JSON or Base64 string (SchaleDB export is Base64) */
export function tryParseInput(input: string): unknown {
  const trimmed = input.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return JSON.parse(atob(trimmed));
    } catch {
      throw new Error('error.cannotParseInput');
    }
  }
}

export function detectAndConvert(json: unknown): ConvertResult {
  const none: ConvertResult = { format: 'unknown', plans: null, materials: null, gifts: null };
  if (typeof json !== 'object' || json === null) return none;

  // justin163: has "characters" array
  if ('characters' in json && Array.isArray((json as any).characters)) {
    const { plans, materials, gifts } = fromJustin163(json as any);
    return { format: 'justin163', plans, materials, gifts };
  }

  // SchaleDB: all keys are numeric IDs and have {s, l, ...} structure
  const keys = Object.keys(json as object);
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    const sample = (json as any)[keys[0]];
    if (sample && typeof sample === 'object' && 's' in sample && 'l' in sample) {
      return { format: 'schaledb', plans: fromSchaleDB(json as any), materials: null, gifts: null };
    }
  }

  return none;
}

// ── Import: justin163 ───────────────────────────────────────────────────────
function fromJustin163(json: any): {
  plans: GrowthPlan[];
  materials: Record<string, number>;
  gifts: Record<string, number>;
} {
  const plans = (json.characters as any[])
    .filter((c) => c.enabled !== false)
    .map((char): GrowthPlan => {
      const cur = char.current ?? {};
      const tgt = char.target ?? {};
      const el = char.eleph ?? {};

      return {
        uuid: makeUuid(char.id),
        studentId: n(char.id),
        current: {
          level: n(cur.level, 1),
          star: n(cur.star, 1),
          uw: n(cur.ue),
          uwLevel: n(cur.ue_level),
          ex: n(cur.ex, 1),
          normal: n(cur.basic, 1),
          passive: n(cur.passive, 1),
          sub: n(cur.sub),
          eleph: n(el.owned),
          affection: n(cur.bond, 1),
          affectionExp: 0,
          equipment: [n(cur.gear1), n(cur.gear2), n(cur.gear3)],
          gear: n(cur.bond_gear),
          potential: { hp: n(cur.book_hp), atk: n(cur.book_atk), heal: n(cur.book_heal) },
        },
        target: {
          level: n(tgt.level, 1),
          star: n(tgt.star, 1),
          uw: n(tgt.ue),
          uwLevel: n(tgt.ue_level),
          ex: n(tgt.ex, 1),
          normal: n(tgt.basic, 1),
          passive: n(tgt.passive, 1),
          sub: n(tgt.sub),
          affection: n(tgt.bond, 1),
          equipment: [n(tgt.gear1), n(tgt.gear2), n(tgt.gear3)],
          gear: n(tgt.bond_gear),
          potential: { hp: n(tgt.book_hp), atk: n(tgt.book_atk), heal: n(tgt.book_heal) },
        },
        includedInEvents: [],
        useEligmaForStar: el.use_eligma ?? false,
        eligmaInfo: { price: n(el.cost, 1), stock: n(el.purchasable, 20) },
        isSelected: true,
      };
    });

  const { materials, gifts } = json.owned_materials ? parseJustin163Materials(json.owned_materials) : { materials: {}, gifts: {} };

  // eleph.owned -> Item_{studentId} (also reflected in inventory)
  for (const plan of plans) {
    if (plan.studentId && plan.current.eleph > 0) {
      materials[`Item_${plan.studentId}`] = plan.current.eleph;
    }
  }

  return { plans, materials, gifts };
}

// ── Import: SchaleDB ────────────────────────────────────────────────────────
function fromSchaleDB(json: any): GrowthPlan[] {
  return Object.entries(json).map(([id, data]: [string, any]): GrowthPlan => {
    const current = {
      level: n(data.l, 1),
      star: n(data.s, 1),
      uw: n(data.ws),
      uwLevel: n(data.wl),
      ex: n(data.s1, 1),
      normal: n(data.s2, 1),
      passive: n(data.s3, 1),
      sub: n(data.s4),
      eleph: 0,
      affection: n(data.b, 1),
      affectionExp: 0,
      equipment: [n(data.e1), n(data.e2), n(data.e3)] as [number, number, number],
      gear: n(data.e4),
      potential: { hp: n(data.pm), atk: n(data.pa), heal: n(data.ph) },
    };

    return {
      uuid: makeUuid(id),
      studentId: Number(id),
      current,
      // SchaleDB tracks only the current state -> target = current
      target: {
        level: current.level,
        star: current.star,
        uw: current.uw,
        uwLevel: current.uwLevel,
        ex: current.ex,
        normal: current.normal,
        passive: current.passive,
        sub: current.sub,
        affection: current.affection,
        equipment: [...current.equipment],
        gear: current.gear,
        potential: { ...current.potential },
      },
      includedInEvents: [],
      useEligmaForStar: false,
      eligmaInfo: { price: 1, stock: 20 },
      isSelected: true,
    };
  });
}

// ── Export: justin163 ───────────────────────────────────────────────────────
function buildJustin163Materials(materials: Record<string, number>, gifts: Record<string, number>): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  const reportItemSet = new Set(Object.values(REPORT_IDS).map((id) => `Item_${id}`));

  // Report -> XP_N + total Xp
  let totalXp = 0;
  for (let grade = 1; grade <= 4; grade++) {
    const count = materials[`Item_${REPORT_IDS[grade]}`] ?? 0;
    if (count > 0) {
      result[`XP_${grade}`] = count;
      totalXp += count * REPORT_EXP[grade];
    }
  }
  if (totalXp > 0) result['Xp'] = totalXp;

  // Enhancement stone -> GXP_N count + total GearXp
  let gearXp = 0;
  for (let i = 0; i < 4; i++) {
    const count = materials[`Equipment_${i + 1}`] ?? 0;
    if (count > 0) {
      result[`GXP_${i + 1}`] = count;
      gearXp += count * EQUIP_EXP[i];
    }
  }
  if (gearXp > 0) result['GearXp'] = gearXp;

  // Equipment blueprint -> T{tier}_{type}
  for (const [key, val] of Object.entries(materials)) {
    if (!key.startsWith('Equipment_') || val <= 0) continue;
    const j163Key = OUR_BP_TO_JUSTIN163[key];
    if (j163Key) result[j163Key] = val;
  }

  // Remaining Item_ -> numeric ID (Eleph items 1xxxx/2xxxx are handled as character.eleph.owned)
  for (const [key, val] of Object.entries(materials)) {
    if (!key.startsWith('Item_') || val <= 0 || reportItemSet.has(key)) continue;
    const id = parseInt(key.slice(5));
    if (id >= 10000 && id < 30000) continue;
    result[String(id)] = val;
  }

  // Gift (5xxx)
  for (const [key, val] of Object.entries(gifts)) {
    if (val > 0) result[key] = val;
  }

  return result;
}

export function toJustin163(plans: GrowthPlan[], materials: Record<string, number>, gifts: Record<string, number>, locale: Locale = 'en'): object {
  const characters = plans
    .filter((p) => p.studentId !== null)
    .map((p) => ({
      id: String(p.studentId),
      name: String(p.studentId),
      current: {
        level: p.current.level,
        bond: p.current.affection,
        star: p.current.star,
        ue: p.current.uw,
        ue_level: p.current.uwLevel,
        ex: p.current.ex,
        basic: p.current.normal,
        passive: p.current.passive,
        sub: p.current.sub,
        gear1: p.current.equipment[0],
        gear2: p.current.equipment[1],
        gear3: p.current.equipment[2],
        bond_gear: p.current.gear,
        book_hp: p.current.potential.hp,
        book_atk: p.current.potential.atk,
        book_heal: p.current.potential.heal,
      },
      target: {
        level: p.target.level,
        bond: p.target.affection,
        star: p.target.star,
        ue: p.target.uw,
        ue_level: p.target.uwLevel,
        ex: p.target.ex,
        basic: p.target.normal,
        passive: p.target.passive,
        sub: p.target.sub,
        gear1: p.target.equipment[0],
        gear2: p.target.equipment[1],
        gear3: p.target.equipment[2],
        bond_gear: p.target.gear,
        book_hp: p.target.potential.hp,
        book_atk: p.target.potential.atk,
        book_heal: p.target.potential.heal,
      },
      eleph: {
        owned: materials[`Item_${p.studentId}`] ?? p.current.eleph,
        unlocked: true,
        cost: p.eligmaInfo.price,
        purchasable: p.eligmaInfo.stock,
        farm_nodes: 0,
        node_refresh: false,
        use_eligma: p.useEligmaForStar,
        use_shop: false,
      },
      enabled: true,
      hasBondGear: p.current.gear > 0 || p.target.gear > 0,
    }));

  return {
    exportVersion: 2,
    characters,
    character_order: [],
    disabled_characters: [],
    owned_materials: buildJustin163Materials(materials, gifts),
    groups: {},
    language: { en: 'En', ko: 'Kr', ja: 'Jp', 'zh-Hant': 'Tw' }[locale] || 'En',
    level_cap: 90,
    server: 'Global',
    site_version: '1.4.20.convert.2.0.0',
  };
}

export const FORMAT_LABEL: Record<string, string> = {
  justin163: 'justin163',
  schaledb: 'SchaleDB',
};

export const AI_CONVERT_PROMPT = `Please convert data from another Blue Archive planner site into the JSON format below.
You can save the result as a .json file and import it using the site's "Import" feature.
Output JSON only, without any explanation.

[Output Format]
{
  "version": "2.0.0",
  "eventPlans": {},
  "globalPlans": [
    {
      "uuid": "{random string}",
      "studentId": number,
      "current": {
        "level": number,       "star": number,
        "uw": number,          "uwLevel": number,
        "ex": number,          "normal": number,
        "passive": number,     "sub": number,
        "eleph": number,       "affection": number,
        "affectionExp": 0,
        "equipment": [number, number, number],
        "gear": number, // bond gear. 0 if not exist
        "potential": { "hp": number, "atk": number, "heal": number }
      },
      "target": { /* same structure as current, no affectionExp */ },
      "includedInEvents": [],
      "useEligmaForStar": false,
      "eligmaInfo": { "price": 1, "stock": 20 },
      "isSelected": true
    }
  ],
  "materialInventory": {
    "Item_10": number,        // Novice activity report
    "Item_11": number,        // Normal activity report
    "Item_12": number,        // Advanced activity report
    "Item_13": number,        // Superior activity report
    "Equipment_1": number,    // Lesser enhancement stone (90 XP)
    "Equipment_2": number,    // Normal enhancement stone (360 XP)
    "Equipment_3": number,    // Advanced enhancement stone (1440 XP)
    "Equipment_4": number,    // Superior enhancement stone (5760 XP)
    "Item_{Student_ID}": number,    // Student eleph (e.g. Aru (Student_ID: 10000) → "Item_10000")
    "Item_{Item_id}": number     // Other materials (skill materials, potential materials, etc.)
  },
  "ownedGifts": {
    "{Item_id}": number        // Gifts (e.g. "5001": 20). Gift IDs fall in the 5xxx range.
  }
}

[Data to Convert]
(Paste here)`;
