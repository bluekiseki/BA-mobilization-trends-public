import { equipmentBlueprintId, equipmentId } from '~/data/growthData';
import { solveOptimalRuns } from './solveFarmingHeuristic';

// Local interface to avoid circular dependency (common.tsx imports from this file)
interface FarmingStage {
  id: number;
  type: 'Normal' | 'Hard';
  chapter: number;
  stageNum: number;
  ap: number;
  drops: Record<string, number>;
}

export const blueprintIdToType: Record<number, string> = {
  501000: 'Hat',
  502000: 'Gloves',
  503000: 'Shoes',
  504000: 'Bag',
  505000: 'Badge',
  506000: 'Hairpin',
  507000: 'Charm',
  508000: 'Watch',
  509000: 'Necklace',
};

export const equipmentTypeToBlueprint: Record<string, number> = {
  Hat: 501000,
  Gloves: 502000,
  Shoes: 503000,
  Bag: 504000,
  Badge: 505000,
  Hairpin: 506000,
  Charm: 507000,
  Watch: 508000,
  Necklace: 509000,
};

export const tierReplacementCosts = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50];

export const getTierFromEquipmentId = (id: number): number => {
  for (const [, ids] of Object.entries(equipmentBlueprintId)) {
    const index = ids.indexOf(id);
    if (index !== -1) return index + 1;
  }

  for (const [, ids] of Object.entries(equipmentId)) {
    const index = ids.indexOf(id);
    if (index !== -1) return index + 1;
  }
  // Universal blueprint ID (e.g., 501000->1000)
  const iconId = id % 10000;
  if (iconId !== id) {
    for (const [, ids] of Object.entries(equipmentBlueprintId)) {
      const index = ids.indexOf(iconId);
      if (index !== -1) return index + 1;
    }
  }
  return 0;
};

export const getEquipmentType = (id: number): string | null => {
  for (const [type, ids] of Object.entries(equipmentBlueprintId)) {
    if (ids.includes(id)) return type;
  }
  for (const [type, ids] of Object.entries(equipmentId)) {
    if (ids.includes(id)) return type;
  }
  // Universal blueprint ID (e.g., 501000->1000)
  const iconId = id % 10000;
  if (iconId !== id) {
    for (const [type, ids] of Object.entries(equipmentBlueprintId)) {
      if (ids.includes(iconId)) return type;
    }
  }
  return null;
};

export const normalizeBluprintToEquipment = (id: number): number => {
  const type = getEquipmentType(id);
  const tier = getTierFromEquipmentId(id);

  if (!type || tier === 0) return id;

  const equipIds = equipmentId[type as keyof typeof equipmentId];
  return equipIds?.[tier - 1] ?? id;
};

export const convertEquipmentToBluprint = (id: number): number => {
  const type = getEquipmentType(id);
  const tier = getTierFromEquipmentId(id);

  if (!type || tier === 0) return id;

  const equipIds = equipmentBlueprintId[type as keyof typeof equipmentBlueprintId];
  return equipIds?.[tier - 1] ?? id;
};

export const calculateBlueprintCost = (equipmentTier: number): number => {
  return tierReplacementCosts[equipmentTier - 1] || 0;
};

export const getMaxTier = (stage: FarmingStage): number => {
  let max = 0;
  for (const dropKey of Object.keys(stage.drops)) {
    const equipId = Number(dropKey.split('_')[1]);
    if (!(equipId in blueprintIdToType)) {
      max = Math.max(max, getTierFromEquipmentId(equipId));
    }
  }
  return max;
};

interface Step1Result {
  runCounts: Record<number, number>;
  universalsGained: Record<string, number>;
  remaining: Record<string, number>;
}

function dropKeyNormalize(dropKey: string) {
  if (!dropKey.startsWith('Equipment_')) return dropKey;
  const equipId = Number(dropKey.split('_')[1]);
  const normalizeDropKey = `${dropKey.split('_')[0]}_${normalizeBluprintToEquipment(equipId) || equipId}`;
  return normalizeDropKey;
}

function step1TierLP(stages: FarmingStage[], remainingNeeds: Record<string, number>, normalMultiplier: number): Step1Result {
  const remaining = { ...remainingNeeds };
  console.log('[step1TierLP] remainingNeeds', remainingNeeds);
  const runCounts: Record<number, number> = {};
  const universalsGained: Record<string, number> = {};

  // Process tiers from 10 down to 1
  for (let tier = 10; tier >= 1; tier--) {
    // Filter stages where max tier in drops == this tier
    const tierStages = stages.filter((s) => s.type === 'Normal' && getMaxTier(s) === tier);

    // Extract needs for this tier only
    const tierNeeds: Record<string, number> = {};
    for (const [key, amount] of Object.entries(remaining)) {
      if (amount > 0) {
        const equipId = Number(key.split('_')[1]);
        if (!(equipId in blueprintIdToType)) {
          const itemTier = getTierFromEquipmentId(equipId);
          if (itemTier === tier) {
            tierNeeds[key] = amount;
          }
        }
      }
    }

    if (Object.keys(tierNeeds).length === 0) continue;

    // Build LP problem
    const tierNeedsArray = Object.keys(tierNeeds);
    const dropMatrix: number[][] = tierStages.map((stage) => {
      return tierNeedsArray.map((key) => {
        const dropRate = stage.drops[key] || stage.drops[`Equipment_${convertEquipmentToBluprint(Number(key.split('_')[1]))}`] || 0;
        return dropRate * normalMultiplier;
      });
    });

    const apCosts = tierStages.map((s) => s.ap);
    const neededAmounts = tierNeedsArray.map((key) => tierNeeds[key]);

    // Solve LP using existing solver
    const lpResult = solveOptimalRuns({
      dropMatrix,
      apCosts,
      neededAmounts,
      priorities: Array<boolean>(tierStages.length).fill(false),
    });

    console.log({
      dropMatrix,
      apCosts,
      neededAmounts,
      tier,
    });

    // console.log('lpResult-1',lpResult)

    // If infeasible or no result, use greedy fallback
    if (!lpResult || lpResult.length === 0) {
      console.log('step1TierLP, Try greedy fallback', tier, 'lpResult:', lpResult);
      // Try greedy fallback: each needed item picked from highest stage available
      const greedyRuns: Record<number, number> = {};
      for (const [key, need] of Object.entries(tierNeeds)) {
        if (need <= 0) continue;
        for (let stageIdx = tierStages.length - 1; stageIdx >= 0; stageIdx--) {
          const stage = tierStages[stageIdx];
          const dropRate = stage.drops[key] || 0;
          if (dropRate > 0) {
            const effectiveRate = dropRate * normalMultiplier;
            const runs = Math.ceil(need / effectiveRate);
            greedyRuns[stage.id] = (greedyRuns[stage.id] || 0) + runs;
            break;
          }
        }
      }

      // Apply greedy results with ALL drops (like LP results)
      for (const [stageIdStr, runs] of Object.entries(greedyRuns)) {
        const stageId = Number(stageIdStr);
        const stage = tierStages.find((s) => s.id === stageId);
        if (!stage) continue;

        runCounts[stageId] = (runCounts[stageId] || 0) + runs;

        // Update remaining for ALL drops from this stage
        for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
          const gained = dropRate * normalMultiplier * runs;
          const equipId = Number(dropKey.split('_')[1]);
          const normalizeDropKey = dropKeyNormalize(dropKey);

          if (equipId in blueprintIdToType) {
            const eqType = blueprintIdToType[equipId];
            universalsGained[eqType] = (universalsGained[eqType] || 0) + gained;
          } else {
            remaining[normalizeDropKey] = Math.max(0, (remaining[normalizeDropKey] || 0) - gained);
          }
        }
      }
      continue;
    }

    // console.log('lpResult',lpResult)
    // Apply LP results
    for (let i = 0; i < tierStages.length; i++) {
      const runs = Math.ceil(lpResult[i]);
      if (runs > 0) {
        const stage = tierStages[i];
        runCounts[stage.id] = (runCounts[stage.id] || 0) + runs;

        // console.log('runs',runs, 'tierStages',tierStages)

        // Update remaining for ALL drops from this stage
        for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
          const gained = dropRate * normalMultiplier * runs;
          const equipId = Number(dropKey.split('_')[1]);
          const normalizeDropKey = dropKeyNormalize(dropKey);

          if (equipId in blueprintIdToType) {
            // Universal blueprint
            const eqType = blueprintIdToType[equipId];
            universalsGained[eqType] = (universalsGained[eqType] || 0) + gained;
          } else {
            // Normal blueprint — always update, even if not in remaining initially
            // console.log('Normal blueprint — always update, even if not in remaining initially',dropKey)
            remaining[normalizeDropKey] = Math.max(0, (remaining[normalizeDropKey] || 0) - gained);
          }
        }
      }
    }
  }

  // remaining is the shortfall quantity after farming
  return { runCounts, universalsGained, remaining };
}

interface Step2Result {
  runCounts: Record<number, number>;
  blueprintsUsed: Record<string, number>;
  finalRemaining: Record<string, number>;
}

function step2UniversalReverseSubstitution(
  stages: FarmingStage[],
  step1Result: Step1Result,
  userBlueprints: Record<string, number>,
  originalRemaining: Record<string, number>,
  normalMultiplier: number,
): Step2Result {
  const runCounts = { ...step1Result.runCounts };
  const blueprintsUsed: Record<string, number> = {};

  // Available universal blueprints: Step 1 byproduct + user possession
  const availableUniversals: Record<string, number> = { ...step1Result.universalsGained };
  for (const [type, amount] of Object.entries(userBlueprints)) {
    availableUniversals[type] = (availableUniversals[type] || 0) + amount;
  }

  // Farming result state: accumulated normal blueprints obtained from current runCounts
  // Universal blueprints are managed separately in availableUniversals
  const farmed: Record<string, number> = {};
  for (const [stageIdStr, runs] of Object.entries(runCounts)) {
    const stage = stages.find((s) => s.id === Number(stageIdStr));
    if (!stage) continue;
    for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
      const equipId = Number(dropKey.split('_')[1]);
      const normalizeDropKey = dropKeyNormalize(dropKey);
      if (!(equipId in blueprintIdToType)) {
        farmed[normalizeDropKey] = (farmed[normalizeDropKey] || 0) + dropRate * normalMultiplier * runs;
      }
    }
  }

  // Quantity promised to be covered by blueprints in the while loop (prevents double deduction in finalRemaining)
  const blueprintCoverage: Record<string, number> = {};

  let removed = true;
  while (removed) {
    removed = false;

    // console.log('farmed',farmed)

    // Calculate current shortage (remainder not filled by farmed)
    const shortage: Record<string, number> = {};
    for (const [key, need] of Object.entries(originalRemaining)) {
      const s = Math.max(0, need - (farmed[key] || 0));
      if (s > 0) shortage[key] = s;
    }

    // console.log('shortage', shortage);

    // Calculate the cost/efficiency of 1 removal per stage
    let bestStageId: number | null = null;
    let bestEfficiency = -Infinity;
    let bestCostByType: Record<string, number> = {}; // Universal blueprint usage to fill the shortage
    let bestLossByType: Record<string, number> = {}; // Universal blueprints lost by removing the stage

    for (const [stageIdStr, runs] of Object.entries(runCounts)) {
      if (runs <= 0) continue;
      const stageId = Number(stageIdStr);
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) continue;

      const costByType: Record<string, number> = {};
      const lossByType: Record<string, number> = {};

      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        const equipId = Number(dropKey.split('_')[1]);
        const gainedPerRun = dropRate * normalMultiplier;
        const normalizeDropKey = dropKeyNormalize(dropKey);

        if (equipId in blueprintIdToType) {
          // Universal blueprint loss: no longer obtainable when the stage is removed
          const eqType = blueprintIdToType[equipId];
          lossByType[eqType] = (lossByType[eqType] || 0) + gainedPerRun;
        } else {
          // Normal blueprint loss: exhaust surplus resources first, and if still short, fill with universal blueprints
          const currentFarmed = farmed[normalizeDropKey] || 0;
          const need = originalRemaining[normalizeDropKey] || 0;
          const oldShortage = shortage[normalizeDropKey] || 0; // 0 if surplus
          const newShortage = Math.max(0, need - (currentFarmed - gainedPerRun));
          const shortageIncrease = newShortage - oldShortage; // Exhausted surplus is automatically offset

          if (shortageIncrease > 0) {
            const tier = getTierFromEquipmentId(equipId);
            const eqType = getEquipmentType(equipId);
            const blueprintCost = calculateBlueprintCost(tier);
            if (eqType && blueprintCost > 0) {
              costByType[eqType] = (costByType[eqType] || 0) + Math.ceil(shortageIncrease * blueprintCost);
            }
          }
        }
      }

      // canAfford: for each type, (cost + loss) <= availableUniversals
      let canAfford = true;
      const allTypes = new Set([...Object.keys(costByType), ...Object.keys(lossByType)]);
      for (const type of allTypes) {
        const total = (costByType[type] || 0) + (lossByType[type] || 0);
        if (total > 0 && (availableUniversals[type] || 0) < total) {
          canAfford = false;
          break;
        }
      }
      if (!canAfford) continue;

      // efficiency = AP saved / total universal blueprint expenditure (higher is better)
      const apSaved = stage.ap;
      const totalSpend = [...Object.values(costByType), ...Object.values(lossByType)].reduce((s, v) => s + v, 0);
      const efficiency = totalSpend > 0 ? apSaved / totalSpend : Infinity;

      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        bestStageId = stageId;
        bestCostByType = costByType;
        bestLossByType = lossByType;
      }
    }

    if (bestStageId !== null) {
      const stage = stages.find((s) => s.id === bestStageId);
      if (!stage) continue;

      // 1 removal
      runCounts[bestStageId]--;
      if (runCounts[bestStageId] <= 0) delete runCounts[bestStageId];

      // Tracking blueprintCoverage: calculated based on current shortage before updating farmed
      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        const equipId = Number(dropKey.split('_')[1]);
        const normalizeDropKey = dropKeyNormalize(dropKey);
        if (!(equipId in blueprintIdToType)) {
          const gainedPerRun = dropRate * normalMultiplier;
          const currentFarmed = farmed[normalizeDropKey] || 0;
          const needAmt = originalRemaining[normalizeDropKey] || 0;
          const oldShortage = shortage[normalizeDropKey] || 0;
          const newShortage = Math.max(0, needAmt - (currentFarmed - gainedPerRun));
          const increase = newShortage - oldShortage;
          if (increase > 0) {
            blueprintCoverage[normalizeDropKey] = (blueprintCoverage[normalizeDropKey] || 0) + increase;
          }
        }
      }

      // Update farmed (maintain farming result state)
      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        const equipId = Number(dropKey.split('_')[1]);
        const normalizeDropKey = dropKeyNormalize(dropKey);
        if (!(equipId in blueprintIdToType)) {
          farmed[normalizeDropKey] = Math.max(0, (farmed[normalizeDropKey] || 0) - dropRate * normalMultiplier);
        }
      }

      // Update availableUniversals: subtract the amount used to fill shortage + lost universal blueprints separately
      for (const [type, cost] of Object.entries(bestCostByType)) {
        availableUniversals[type] = (availableUniversals[type] || 0) - cost;
        blueprintsUsed[type] = (blueprintsUsed[type] || 0) + cost;
      }
      for (const [type, loss] of Object.entries(bestLossByType)) {
        availableUniversals[type] = (availableUniversals[type] || 0) - loss;
      }

      removed = true;
    }
  }

  // After while loop ends: handle uncovered shortfall from the loop with remaining availableUniversals
  const finalRemaining: Record<string, number> = {};
  for (const [key, need] of Object.entries(originalRemaining)) {
    // blueprintCoverage: amount already promised to be covered by blueprints in the loop -> prevents double deduction
    const shortfall = Math.max(0, need - (farmed[key] || 0) - (blueprintCoverage[key] || 0));
    if (shortfall <= 1e-9) continue;

    const equipId = Number(key.split('_')[1]);
    const eqType = getEquipmentType(equipId);
    const tier = getTierFromEquipmentId(equipId);
    const blueprintCost = calculateBlueprintCost(tier);

    if (eqType && blueprintCost > 0 && (availableUniversals[eqType] || 0) > 0) {
      const universalsNeeded = Math.ceil(shortfall * blueprintCost);
      const used = Math.min(universalsNeeded, availableUniversals[eqType]);
      availableUniversals[eqType] -= used;
      blueprintsUsed[eqType] = (blueprintsUsed[eqType] || 0) + used;
      const left = shortfall - used / blueprintCost;
      if (left > 1e-9) finalRemaining[key] = left;
    } else {
      finalRemaining[key] = shortfall;
    }
  }

  console.log('as2 res:', { runCounts, blueprintsUsed, finalRemaining });
  return { runCounts, blueprintsUsed, finalRemaining };
}

export interface OptimizeResult {
  runCounts: Record<number, number>;
  blueprintsUsed: Record<string, number>;
  finalRemaining: Record<string, number>;
}

export function optimizeNormalStages2Step(stages: FarmingStage[], remainingNeeds: Record<string, number>, userBlueprints: Record<string, number>, normalMultiplier: number): OptimizeResult {
  if (Object.keys(remainingNeeds).length === 0) {
    return { runCounts: {}, blueprintsUsed: {}, finalRemaining: {} };
  }

  const step1Result = step1TierLP(stages, remainingNeeds, normalMultiplier);
  // console.log('step1Result', step1Result);

  return step2UniversalReverseSubstitution(stages, step1Result, userBlueprints, { ...remainingNeeds }, normalMultiplier);
}

function step1TierLPHard(stages: FarmingStage[], remainingNeeds: Record<string, number>, hardMultiplier: number, maxRunsPerStage: number): Step1Result {
  const remaining = { ...remainingNeeds };
  const runCounts: Record<number, number> = {};
  const universalsGained: Record<string, number> = {};

  for (let tier = 10; tier >= 1; tier--) {
    const tierStages = stages.filter((s) => s.type === 'Hard' && getMaxTier(s) === tier);

    const tierNeeds: Record<string, number> = {};
    for (const [key, amount] of Object.entries(remaining)) {
      if (amount > 0) {
        const equipId = Number(key.split('_')[1]);
        if (!(equipId in blueprintIdToType)) {
          if (getTierFromEquipmentId(equipId) === tier) tierNeeds[key] = amount;
        }
      }
    }

    if (Object.keys(tierNeeds).length === 0 || tierStages.length === 0) continue;

    const tierNeedsArray = Object.keys(tierNeeds);
    const dropMatrix: number[][] = tierStages.map((stage) => tierNeedsArray.map((key) => (stage.drops[key] || 0) * hardMultiplier));

    const lpResult = solveOptimalRuns({
      dropMatrix,
      apCosts: tierStages.map((s) => s.ap),
      neededAmounts: tierNeedsArray.map((key) => tierNeeds[key]),
      priorities: Array<boolean>(tierStages.length).fill(false),
    });

    if (!lpResult || lpResult.length === 0) {
      // Greedy fallback with cap
      const greedyRuns: Record<number, number> = {};
      for (const [key, need] of Object.entries(tierNeeds)) {
        if (need <= 0) continue;
        for (let idx = tierStages.length - 1; idx >= 0; idx--) {
          const stage = tierStages[idx];
          const rate = (stage.drops[key] || 0) * hardMultiplier;
          if (rate > 0) {
            greedyRuns[stage.id] = Math.min((greedyRuns[stage.id] || 0) + Math.ceil(need / rate), maxRunsPerStage);
            break;
          }
        }
      }
      for (const [stageIdStr, runs] of Object.entries(greedyRuns)) {
        const stage = tierStages.find((s) => s.id === Number(stageIdStr));
        if (!stage) continue;
        runCounts[stage.id] = (runCounts[stage.id] || 0) + runs;
        for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
          const gained = dropRate * hardMultiplier * runs;
          const equipId = Number(dropKey.split('_')[1]);
          const normalizeDropKey = dropKeyNormalize(dropKey);

          if (equipId in blueprintIdToType) {
            universalsGained[blueprintIdToType[equipId]] = (universalsGained[blueprintIdToType[equipId]] || 0) + gained;
          } else {
            remaining[normalizeDropKey] = Math.max(0, (remaining[normalizeDropKey] || 0) - gained);
          }
        }
      }
      continue;
    }

    for (let i = 0; i < tierStages.length; i++) {
      const runs = Math.min(Math.ceil(lpResult[i]), maxRunsPerStage);
      if (runs <= 0) continue;
      const stage = tierStages[i];
      runCounts[stage.id] = (runCounts[stage.id] || 0) + runs;
      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        const gained = dropRate * hardMultiplier * runs;
        const equipId = Number(dropKey.split('_')[1]);
        const normalizeDropKey = dropKeyNormalize(dropKey);
        if (equipId in blueprintIdToType) {
          universalsGained[blueprintIdToType[equipId]] = (universalsGained[blueprintIdToType[equipId]] || 0) + gained;
        } else {
          remaining[normalizeDropKey] = Math.max(0, (remaining[normalizeDropKey] || 0) - gained);
        }
      }
    }
  }

  return { runCounts, universalsGained, remaining };
}

// Hard stage LP optimization (applies daily maxRunsPerStage limit).
// The remaining shortfall is passed to Normal LP.
export function optimizeHardStages(
  stages: FarmingStage[],
  remainingNeeds: Record<string, number>,
  hardMultiplier: number,
  maxRunsPerStage: number,
): { runCounts: Record<number, number>; remaining: Record<string, number> } {
  if (Object.keys(remainingNeeds).length === 0) return { runCounts: {}, remaining: {} };
  const { runCounts, remaining } = step1TierLPHard(stages, remainingNeeds, hardMultiplier, maxRunsPerStage);
  return { runCounts, remaining };
}

// Joint LP for hard + normal stages together per tier.
// Hard stages are placed first in the matrix (preferred when LP is indifferent).
// After solving, hard runs are capped at maxRunsPerStage; any shortfall is re-covered by normal-only LP.
function step1TierLPCombined(stages: FarmingStage[], remainingNeeds: Record<string, number>, normalMultiplier: number, hardMultiplier: number, maxRunsPerStage: number): Step1Result {
  const remaining = { ...remainingNeeds };
  const runCounts: Record<number, number> = {};
  const universalsGained: Record<string, number> = {};

  const getMultiplier = (s: FarmingStage) => (s.type === 'Hard' ? hardMultiplier : normalMultiplier);

  for (let tier = 10; tier >= 1; tier--) {
    const hardStages = stages.filter((s) => s.type === 'Hard' && getMaxTier(s) === tier).sort((a, b) => b.chapter - a.chapter || b.stageNum - a.stageNum);
    const normalStages = stages.filter((s) => s.type === 'Normal' && getMaxTier(s) === tier).sort((a, b) => b.chapter - a.chapter || b.stageNum - a.stageNum);

    if (hardStages.length === 0 && normalStages.length === 0) continue;

    // Hard 2n+2, Hard 2n+1, Normal 2n+2, Normal 2n+1
    const tierStages = [...hardStages, ...normalStages];
    const hardCount = hardStages.length;

    console.log(`tierStages, tier=${tier}`, tierStages);

    const tierNeeds: Record<string, number> = {};
    for (const [key, amount] of Object.entries(remaining)) {
      if (amount > 0) {
        const equipId = Number(key.split('_')[1]);
        if (!(equipId in blueprintIdToType) && getTierFromEquipmentId(equipId) === tier) {
          tierNeeds[key] = amount;
        }
      }
    }

    if (Object.keys(tierNeeds).length === 0) continue;

    const tierNeedsArray = Object.keys(tierNeeds);

    const lookupDropRate = (stage: FarmingStage, key: string) => {
      const direct = stage.drops[key] || 0;
      if (direct) return direct;
      const bpKey = `Equipment_${convertEquipmentToBluprint(Number(key.split('_')[1]))}`;
      return stage.drops[bpKey] || 0;
    };

    const dropMatrix: number[][] = tierStages.map((stage) => tierNeedsArray.map((key) => lookupDropRate(stage, key) * getMultiplier(stage)));

    console.log('dropMatrix', dropMatrix);
    const apCosts = tierStages.map((s) => s.ap);
    const neededAmounts = tierNeedsArray.map((key) => tierNeeds[key]);

    const lpResult = solveOptimalRuns({
      dropMatrix,
      apCosts,
      neededAmounts,
      priorities: Array<boolean>(tierStages.length).fill(false),
    });

    const applyDrops = (stage: FarmingStage, runs: number) => {
      runCounts[stage.id] = (runCounts[stage.id] || 0) + runs;
      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        const gained = dropRate * getMultiplier(stage) * runs;
        const equipId = Number(dropKey.split('_')[1]);
        const normalizeDropKey = dropKeyNormalize(dropKey);
        if (equipId in blueprintIdToType) {
          universalsGained[blueprintIdToType[equipId]] = (universalsGained[blueprintIdToType[equipId]] || 0) + gained;
        } else {
          remaining[normalizeDropKey] = Math.max(0, (remaining[normalizeDropKey] || 0) - gained);
        }
      }
    };

    if (!lpResult || lpResult.length === 0) {
      // Greedy fallback: hard stages first (already sorted to front), respect cap
      for (const [key, need] of Object.entries(tierNeeds)) {
        if (need <= 0) continue;
        let leftover = need;
        for (const stage of tierStages) {
          if (leftover <= 0) break;
          const rate = lookupDropRate(stage, key) * getMultiplier(stage);
          if (rate <= 0) continue;
          const cap = stage.type === 'Hard' ? maxRunsPerStage : Infinity;
          const already = runCounts[stage.id] || 0;
          const available = stage.type === 'Hard' ? Math.max(0, cap - already) : Infinity;
          const needed = Math.ceil(leftover / rate);
          const actual = isFinite(available) ? Math.min(needed, available) : needed;
          if (actual > 0) {
            applyDrops(stage, actual);
            leftover = Math.max(0, leftover - actual * rate);
          }
        }
      }
      continue;
    }

    // Apply capped hard runs and LP normal runs
    for (let i = 0; i < tierStages.length; i++) {
      const stage = tierStages[i];
      const isHard = i < hardCount;
      const runs = isHard ? Math.min(Math.ceil(lpResult[i]), maxRunsPerStage) : Math.ceil(lpResult[i]);
      if (runs > 0) applyDrops(stage, runs);
    }

    // If hard stages were capped, LP normal allocation may be insufficient — re-run normal-only LP
    const stillNeeded: Record<string, number> = {};
    for (const key of tierNeedsArray) {
      const leftover = remaining[key] ?? 0;
      if (leftover > 0) stillNeeded[key] = leftover;
    }

    if (Object.keys(stillNeeded).length > 0 && normalStages.length > 0) {
      const stillArray = Object.keys(stillNeeded);
      const fallbackMatrix = normalStages.map((stage) => stillArray.map((key) => lookupDropRate(stage, key) * normalMultiplier));
      const fallbackResult = solveOptimalRuns({
        dropMatrix: fallbackMatrix,
        apCosts: normalStages.map((s) => s.ap),
        neededAmounts: stillArray.map((k) => stillNeeded[k]),
        priorities: Array<boolean>(normalStages.length).fill(false),
      });
      if (fallbackResult && fallbackResult.length > 0) {
        for (let k = 0; k < normalStages.length; k++) {
          const runs = Math.ceil(fallbackResult[k]);
          if (runs > 0) applyDrops(normalStages[k], runs);
        }
      }
    }
  }

  return { runCounts, universalsGained, remaining };
}

// Copy of step2UniversalReverseSubstitution adapted for combined hard+normal stages.
// Uses per-stage multipliers: hardMultiplier for Hard stages, normalMultiplier for Normal stages.
function step2CombinedSubstitution(
  stages: FarmingStage[],
  step1Result: Step1Result,
  userBlueprints: Record<string, number>,
  originalRemaining: Record<string, number>,
  normalMultiplier: number,
  hardMultiplier: number,
): Step2Result {
  const runCounts = { ...step1Result.runCounts };
  const blueprintsUsed: Record<string, number> = {};

  const getMultiplier = (stage: FarmingStage) => (stage.type === 'Hard' ? hardMultiplier : normalMultiplier);

  const availableUniversals: Record<string, number> = { ...step1Result.universalsGained };
  for (const [type, amount] of Object.entries(userBlueprints)) {
    availableUniversals[type] = (availableUniversals[type] || 0) + amount;
  }

  const farmed: Record<string, number> = {};
  for (const [stageIdStr, runs] of Object.entries(runCounts)) {
    const stage = stages.find((s) => s.id === Number(stageIdStr));
    if (!stage) continue;
    for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
      const equipId = Number(dropKey.split('_')[1]);
      const normalizeDropKey = dropKeyNormalize(dropKey);
      if (!(equipId in blueprintIdToType)) {
        farmed[normalizeDropKey] = (farmed[normalizeDropKey] || 0) + dropRate * getMultiplier(stage) * runs;
      }
    }
  }

  const blueprintCoverage: Record<string, number> = {};

  let removed = true;
  while (removed) {
    removed = false;

    const shortage: Record<string, number> = {};
    for (const [key, need] of Object.entries(originalRemaining)) {
      const s = Math.max(0, need - (farmed[key] || 0));
      if (s > 0) shortage[key] = s;
    }

    let bestStageId: number | null = null;
    let bestEfficiency = -Infinity;
    let bestCostByType: Record<string, number> = {};
    let bestLossByType: Record<string, number> = {};

    for (const [stageIdStr, runs] of Object.entries(runCounts)) {
      if (runs <= 0) continue;
      const stageId = Number(stageIdStr);
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) continue;

      const costByType: Record<string, number> = {};
      const lossByType: Record<string, number> = {};

      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        const equipId = Number(dropKey.split('_')[1]);
        const gainedPerRun = dropRate * getMultiplier(stage);
        const normalizeDropKey = dropKeyNormalize(dropKey);

        if (equipId in blueprintIdToType) {
          const eqType = blueprintIdToType[equipId];
          lossByType[eqType] = (lossByType[eqType] || 0) + gainedPerRun;
        } else {
          const currentFarmed = farmed[normalizeDropKey] || 0;
          const need = originalRemaining[normalizeDropKey] || 0;
          const oldShortage = shortage[normalizeDropKey] || 0;
          const newShortage = Math.max(0, need - (currentFarmed - gainedPerRun));
          const shortageIncrease = newShortage - oldShortage;

          if (shortageIncrease > 0) {
            const tier = getTierFromEquipmentId(equipId);
            const eqType = getEquipmentType(equipId);
            const blueprintCost = calculateBlueprintCost(tier);
            if (eqType && blueprintCost > 0) {
              costByType[eqType] = (costByType[eqType] || 0) + Math.ceil(shortageIncrease * blueprintCost);
            }
          }
        }
      }

      let canAfford = true;
      const allTypes = new Set([...Object.keys(costByType), ...Object.keys(lossByType)]);
      for (const type of allTypes) {
        const total = (costByType[type] || 0) + (lossByType[type] || 0);
        if (total > 0 && (availableUniversals[type] || 0) < total) {
          canAfford = false;
          break;
        }
      }
      if (!canAfford) continue;

      const apSaved = stage.ap;
      const totalSpend = [...Object.values(costByType), ...Object.values(lossByType)].reduce((s, v) => s + v, 0);
      const efficiency = totalSpend > 0 ? apSaved / totalSpend : Infinity;

      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        bestStageId = stageId;
        bestCostByType = costByType;
        bestLossByType = lossByType;
      }
    }

    if (bestStageId !== null) {
      const stage = stages.find((s) => s.id === bestStageId);
      if (!stage) continue;

      runCounts[bestStageId]--;
      if (runCounts[bestStageId] <= 0) delete runCounts[bestStageId];

      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        const equipId = Number(dropKey.split('_')[1]);
        const normalizeDropKey = dropKeyNormalize(dropKey);
        if (!(equipId in blueprintIdToType)) {
          const gainedPerRun = dropRate * getMultiplier(stage);
          const currentFarmed = farmed[normalizeDropKey] || 0;
          const needAmt = originalRemaining[normalizeDropKey] || 0;
          const oldShortage = shortage[normalizeDropKey] || 0;
          const newShortage = Math.max(0, needAmt - (currentFarmed - gainedPerRun));
          const increase = newShortage - oldShortage;
          if (increase > 0) {
            blueprintCoverage[normalizeDropKey] = (blueprintCoverage[normalizeDropKey] || 0) + increase;
          }
        }
      }

      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        const equipId = Number(dropKey.split('_')[1]);
        const normalizeDropKey = dropKeyNormalize(dropKey);
        if (!(equipId in blueprintIdToType)) {
          farmed[normalizeDropKey] = Math.max(0, (farmed[normalizeDropKey] || 0) - dropRate * getMultiplier(stage));
        }
      }

      for (const [type, cost] of Object.entries(bestCostByType)) {
        availableUniversals[type] = (availableUniversals[type] || 0) - cost;
        blueprintsUsed[type] = (blueprintsUsed[type] || 0) + cost;
      }
      for (const [type, loss] of Object.entries(bestLossByType)) {
        availableUniversals[type] = (availableUniversals[type] || 0) - loss;
      }

      removed = true;
    }
  }

  const finalRemaining: Record<string, number> = {};
  for (const [key, need] of Object.entries(originalRemaining)) {
    const shortfall = Math.max(0, need - (farmed[key] || 0) - (blueprintCoverage[key] || 0));
    if (shortfall <= 1e-9) continue;

    const equipId = Number(key.split('_')[1]);
    const eqType = getEquipmentType(equipId);
    const tier = getTierFromEquipmentId(equipId);
    const blueprintCost = calculateBlueprintCost(tier);

    if (eqType && blueprintCost > 0 && (availableUniversals[eqType] || 0) > 0) {
      const universalsNeeded = Math.ceil(shortfall * blueprintCost);
      const used = Math.min(universalsNeeded, availableUniversals[eqType]);
      availableUniversals[eqType] -= used;
      blueprintsUsed[eqType] = (blueprintsUsed[eqType] || 0) + used;
      const left = shortfall - used / blueprintCost;
      if (left > 1e-9) finalRemaining[key] = left;
    } else {
      finalRemaining[key] = shortfall;
    }
  }

  return { runCounts, blueprintsUsed, finalRemaining };
}

// Combined LP: hard + normal stages solved jointly per tier to eliminate AP waste
// from hard-only pre-allocation when hard and normal stages share equipment types.
export function optimizeCombinedStages2Step(
  stages: FarmingStage[],
  remainingNeeds: Record<string, number>,
  userBlueprints: Record<string, number>,
  normalMultiplier: number,
  hardMultiplier: number,
  maxRunsPerStage: number,
): OptimizeResult {
  if (Object.keys(remainingNeeds).length === 0) {
    return { runCounts: {}, blueprintsUsed: {}, finalRemaining: {} };
  }

  console.log('optimizeCombinedStages2Step', stages, remainingNeeds, userBlueprints, normalMultiplier, hardMultiplier, maxRunsPerStage);

  const step1Result = step1TierLPCombined(stages, remainingNeeds, normalMultiplier, hardMultiplier, maxRunsPerStage);
  return step2CombinedSubstitution(stages, step1Result, userBlueprints, { ...remainingNeeds }, normalMultiplier, hardMultiplier);
}
