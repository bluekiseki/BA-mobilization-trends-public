import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { IconInfos, StudentData } from '~/types/plannerData';
import type { SummaryPoolStat } from '~/features/inventory/types';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import { compactPoolNet, compactPoolOwned, compactSubPool, computeSubPoolXp, FUNGIBLE_POOLS, type FungibleSubPool } from '~/utils/groupMaterialNeeds';
import { applyUniversalBlueprints } from '~/utils/blueprintUtils';
import { buildUwDemandFromPlans, calcUwMaterialXp } from '~/utils/uwMaterialXp';

export interface DisplayInventoryInput {
  materialInventory: Record<string, number>;
  ownedGifts: Record<string, number>;
  draftInventory: Record<string, number>;
  iconInfos: IconInfos | null;
}

/** The stored inventory with owned gifts and not-yet-committed edits overlaid on top. */
export function buildDisplayInventory({ materialInventory, ownedGifts, draftInventory, iconInfos }: DisplayInventoryInput): Record<string, number> {
  const base = { ...materialInventory };
  if (iconInfos?.Item) {
    for (const [id, info] of Object.entries(iconInfos.Item)) {
      if (info.ItemCategory === 6) base[`Item_${id}`] = ownedGifts[id] ?? 0;
    }
  }
  return { ...base, ...draftInventory };
}

export interface NeededInput {
  showTarget: boolean;
  growthPlans: GrowthPlan[];
  students: StudentData;
}

/** Materials the selected growth plans still require (empty while goal comparison is off). */
export function calcNeeded({ showTarget, growthPlans, students }: NeededInput): Record<string, number> {
  if (!showTarget) return {};
  const activePlans = growthPlans.filter((p) => p.isSelected);
  return calculatedGrowthNeeds(activePlans, students);
}

export interface FungiblePoolInput {
  showTarget: boolean;
  displayInventory: Record<string, number>;
  needed: Record<string, number>;
  growthPlans: GrowthPlan[];
  students: StudentData;
}

/** Fungible-pool accounting shared by the goal summary row, the item grid deficits and the pool-visibility filter. */
export function calcFungiblePoolData({ showTarget, displayInventory, needed, growthPlans, students }: FungiblePoolInput) {
  const deficitByKey: Record<string, number> = {};
  const diffByKey: Record<string, number> = {};
  const poolVisibleKeys = new Set<string>();
  const summaryPools: SummaryPoolStat[] = [];

  if (!showTarget) return { fungibleDeficitByKey: deficitByKey, fungibleDiffByKey: diffByKey, poolVisibleKeys, goalSummaryPools: summaryPools };

  // Nets one sub-pool's owned XP against its needed XP, keeps all its tiers together in
  // poolVisibleKeys ("Show with 1+ Items"), and records the pool-corrected
  // deficit/diff. Shared by reports/equipment stones AND each unique-weapon material series
  // below, so none of them drop a 0-owned tier out of an otherwise-relevant set.
  const applyPoolVisibility = (pool: FungibleSubPool) => {
    const ownedXp = computeSubPoolXp(pool, displayInventory);
    const requiredXp = computeSubPoolXp(pool, needed);
    if (requiredXp <= 0 && ownedXp <= 0) return { ownedXp, requiredXp, included: false };
    for (const k of pool.keys) poolVisibleKeys.add(k);

    const net = compactPoolNet(pool, displayInventory, needed);
    for (const k of pool.keys) {
      deficitByKey[k] = 0;
      diffByKey[k] = 0;
    }
    if (net) {
      for (const { key, amount } of net.breakdown) {
        if (net.sign < 0) deficitByKey[key] = amount;
        diffByKey[key] = net.sign < 0 ? -amount : amount;
      }
    }
    return { ownedXp, requiredXp, included: true };
  };

  // Reports / equipment enhancement stones: simple 1:1 fungible pools, no weapon-type bonus.
  const REPORT_POOL = FUNGIBLE_POOLS.xpReports[0];
  const EQUIP_POOL = FUNGIBLE_POOLS.equipEnh[0];
  for (const [labelKey, pool] of [
    ['game:report', REPORT_POOL],
    ['game:equipEnh', EQUIP_POOL],
  ] as const) {
    const { ownedXp, requiredXp, included } = applyPoolVisibility(pool);
    if (included) summaryPools.push({ labelKey, ownedXp, requiredXp, iconKey: pool.keys[pool.keys.length - 1] });
  }

  // Unique weapon growth materials summary row: bonus-aware cross-series aggregate. Computed
  // first so the firing-pin pool's individual-tile numbers below can reuse it.
  const activePlans = growthPlans.filter((p) => p.isSelected);
  const uwDemand = buildUwDemandFromPlans(activePlans, students);
  const uw = calcUwMaterialXp(displayInventory, uwDemand);

  // Spring/hammer/barrel: `needed` (via calculatedGrowthNeeds -> calcUWLevelNeeds) now
  // attributes each student's UW XP demand to their own weapon-type's matching series instead
  // of always firing pins, so applyPoolVisibility's per-tier netting is exact for these three —
  // no cross-series competition, since each series only ever answers its own weapon types.
  for (const pool of FUNGIBLE_POOLS.uwGrowth.slice(0, 3)) {
    applyPoolVisibility(pool);
    // A series short on its own is still covered when leftovers of other series and firing pins fill the gap, so no tile may read as short.
    if (uw.required > 0 && uw.deficit <= 0) {
      for (const k of pool.keys) {
        if (k in deficitByKey) deficitByKey[k] = 0;
        if ((diffByKey[k] ?? 0) < 0) diffByKey[k] = 0;
      }
    }
  }

  // Firing pins have no demand of their own (any series' leftover can fall back to them), so
  // `needed` never attributes anything to their keys and applyPoolVisibility always leaves
  // their deficit/diff at 0. Their one well-defined number is the aggregate deficit above —
  // "buy this many firing pins to close the remaining gap across every series" — so fill that
  // in specifically, on top of applyPoolVisibility's own visibility gating.
  const FIRING_PIN_POOL = FUNGIBLE_POOLS.uwGrowth[3];
  applyPoolVisibility(FIRING_PIN_POOL);
  if (uw.deficit > 0) {
    for (const k of FIRING_PIN_POOL.keys) {
      poolVisibleKeys.add(k);
      deficitByKey[k] = 0;
      diffByKey[k] = 0;
    }
    const breakdown = compactSubPool(FIRING_PIN_POOL, [{ key: FIRING_PIN_POOL.keys[0], amount: uw.deficit / FIRING_PIN_POOL.xpPer[0] }]);
    for (const { key, amount } of breakdown) {
      deficitByKey[key] = amount;
      diffByKey[key] = -amount;
    }
  }

  if (uw.required > 0) {
    summaryPools.push({
      labelKey: 'planner:label.uwEnh',
      ownedXp: uw.effectiveOwned + uw.surplus,
      requiredXp: uw.required,
      tooltipKey: 'planner:inventory.uwSummaryTooltip',
      iconKey: FIRING_PIN_POOL.keys[FIRING_PIN_POOL.keys.length - 1],
    });
  }

  applyUniversalBlueprints(displayInventory, needed, deficitByKey, diffByKey);

  return { fungibleDeficitByKey: deficitByKey, fungibleDiffByKey: diffByKey, poolVisibleKeys, goalSummaryPools: summaryPools };
}

/** Every fungible pool's owned count re-expressed as the fewest highest-denomination items. */
export function calcFungibleOwnedByKey(displayInventory: Record<string, number>): Record<string, number> {
  const byKey: Record<string, number> = {};
  for (const pools of Object.values(FUNGIBLE_POOLS)) {
    for (const pool of pools) Object.assign(byKey, compactPoolOwned(pool, displayInventory));
  }
  return byKey;
}
