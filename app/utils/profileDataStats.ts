export interface ProfileStats {
  inventoryTypes: number;
  inventoryTotal: number;
  students: number;
  equipmentPlans: number;
  resourceGoals: number;
  gachaStrategies: number;
  gachaRecords: number;
  eventPlans: number;
  raidRecords: number;
  syncedAt: Record<string, number>;
}

export const EMPTY_PROFILE_STATS: ProfileStats = {
  inventoryTypes: 0,
  inventoryTotal: 0,
  students: 0,
  equipmentPlans: 0,
  resourceGoals: 0,
  gachaStrategies: 0,
  gachaRecords: 0,
  eventPlans: 0,
  raidRecords: 0,
  syncedAt: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entryCount(value: unknown): number {
  return isRecord(value) && Array.isArray(value.entries) ? value.entries.length : 0;
}

export function getProfileStats(rows: Array<{ key: string; value: unknown; updatedAt?: number }>): ProfileStats {
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const growthValue = rowsByKey.get('growthPlans')?.value;
  const growthPlans = isRecord(growthValue) && Array.isArray(growthValue.growthPlans) ? growthValue.growthPlans : [];
  const inventory = isRecord(growthValue) && isRecord(growthValue.materialInventory) ? growthValue.materialInventory : {};
  const inventoryAmounts = Object.values(inventory).filter((amount): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount > 0);

  const equipmentValue = rowsByKey.get('equipmentPlan')?.value;
  const runCounts = isRecord(equipmentValue) && isRecord(equipmentValue.runCounts) ? equipmentValue.runCounts : {};

  const resourceValue = rowsByKey.get('resourcePlan')?.value;
  const resourceGoalStudentIds = new Set<string>();
  for (const plan of isRecord(resourceValue) ? [resourceValue.kr, resourceValue.jp, resourceValue] : []) {
    if (!isRecord(plan) || !isRecord(plan.targetGoals)) continue;
    for (const [studentId, goals] of Object.entries(plan.targetGoals)) {
      if (Array.isArray(goals) && goals.length > 0) resourceGoalStudentIds.add(studentId);
    }
  }

  const eventRows = rows.filter((row) => row.key.startsWith('eventPlans:'));
  const syncedAt: Record<string, number> = {};
  const setUpdatedAt = (tile: string, key: string) => {
    const seconds = rowsByKey.get(key)?.updatedAt;
    if (seconds) syncedAt[tile] = seconds * 1000;
  };
  setUpdatedAt('inventory', 'growthPlans');
  setUpdatedAt('students', 'growthPlans');
  setUpdatedAt('equipmentPlans', 'equipmentPlan');
  setUpdatedAt('resourceGoals', 'resourcePlan');
  setUpdatedAt('gachaStrategies', 'gacha_strategies');
  setUpdatedAt('raidRecords', 'raidHistory');
  setUpdatedAt('gachaRecords', 'gachaHistory');
  const eventUpdatedAt = eventRows.reduce((latest, row) => Math.max(latest, row.updatedAt ?? 0), 0);
  if (eventUpdatedAt > 0) syncedAt.eventPlans = eventUpdatedAt * 1000;

  const strategies = rowsByKey.get('gacha_strategies')?.value;
  return {
    inventoryTypes: inventoryAmounts.length,
    inventoryTotal: inventoryAmounts.reduce((total, amount) => total + amount, 0),
    students: growthPlans.filter((plan) => isRecord(plan) && typeof plan.studentId === 'number').length,
    equipmentPlans: Object.values(runCounts).filter((count) => typeof count === 'number' && count > 0).length,
    resourceGoals: resourceGoalStudentIds.size,
    gachaStrategies: isRecord(strategies) ? Object.keys(strategies).length : 0,
    gachaRecords: entryCount(rowsByKey.get('gachaHistory')?.value),
    eventPlans: eventRows.length,
    raidRecords: entryCount(rowsByKey.get('raidHistory')?.value),
    syncedAt,
  };
}

export type ConflictStatKey = Exclude<keyof ProfileStats, 'inventoryTypes' | 'syncedAt'>;

const CONFLICT_STATS_BY_KEY: Record<string, ConflictStatKey[]> = {
  growthPlans: ['students', 'inventoryTotal'],
  equipmentPlan: ['equipmentPlans'],
  resourcePlan: ['resourceGoals'],
  gacha_strategies: ['gachaStrategies'],
  raidHistory: ['raidRecords'],
  gachaHistory: ['gachaRecords'],
};

export function getConflictStats(key: string, value: unknown): Array<{ key: ConflictStatKey; value: number }> {
  const stats = getProfileStats([{ key, value }]);
  const statKeys = key.startsWith('eventPlans:') ? (['eventPlans'] as const) : (CONFLICT_STATS_BY_KEY[key] ?? []);
  return statKeys.map((statKey) => ({ key: statKey, value: stats[statKey] }));
}
