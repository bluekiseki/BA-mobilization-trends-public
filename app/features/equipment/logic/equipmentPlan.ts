import {
  calculateBlueprintCost,
  getEquipmentType,
  getTierFromEquipmentId,
  blueprintIdToType,
  optimizeCombinedStages2Step,
  optimizeHardStages,
  optimizeNormalStages2Step,
  type OptimizeResult,
} from '~/utils/blueprintUtils';
import type { ResolvedStage } from '~/types/resolvedStage';

export type HardMode = 'aggressive' | 'optimized' | 'manual' | 'combined';

export interface DeductBlueprintsInput {
  rawRemainingNeeds: Record<string, number>;
  farmedByPlan: Record<string, number>;
  blueprints: Record<string, number>;
}

/** Greedy deduction of the owned (and farmed) universal blueprints from the remaining needs, used when the optimizer has not run. */
export function deductWithOwnedBlueprints({ rawRemainingNeeds, farmedByPlan, blueprints }: DeductBlueprintsInput) {
  const remaining = { ...rawRemainingNeeds };
  const blueprintsUsed: Record<string, number> = {};
  const blueprintsUsedByItem: Record<string, Record<string, number>> = {};
  const bpCopy = { ...blueprints };

  for (const [key, amt] of Object.entries(farmedByPlan)) {
    const id = Number(key.split('_')[1]);
    if (id in blueprintIdToType) {
      const bt = blueprintIdToType[id];
      bpCopy[bt] = (bpCopy[bt] || 0) + Math.floor(amt);
    }
  }
  for (const [key, needed] of Object.entries(remaining)) {
    let left = needed;
    const id = Number(key.split('_')[1]);
    const eqType = getEquipmentType(id);
    const tier = getTierFromEquipmentId(id);

    if (eqType && bpCopy[eqType]) {
      const cost = calculateBlueprintCost(tier);
      const univ = Math.ceil(left * cost);
      const used = Math.min(univ, bpCopy[eqType]);
      bpCopy[eqType] -= used;
      blueprintsUsed[eqType] = (blueprintsUsed[eqType] || 0) + used;
      if (!blueprintsUsedByItem[eqType]) blueprintsUsedByItem[eqType] = {};
      blueprintsUsedByItem[eqType][key] = (blueprintsUsedByItem[eqType][key] || 0) + used;
      left -= used / cost;
    }
    if (left > 1e-9) remaining[key] = left;
    else delete remaining[key];
  }
  return { remainingNeeds: remaining, blueprintsUsed, blueprintsUsedByItem };
}

export interface PlanOptimizationInput {
  hardMode: HardMode;
  runCounts: Record<number, number>;
  resolvedStages: ResolvedStage[];
  totalEquipmentNeeds: Record<string, number>;
  farmingDays: number;
  hardMultiplier: number;
  materialInventory: Record<string, number>;
  normalMultiplier: number;
  blueprints: Record<string, number>;
}

export interface OptimizationPlan {
  runCounts: Record<number, number>;
  optimizerOutput: Pick<OptimizeResult, 'blueprintsUsed' | 'finalRemaining'> | null;
}

/** Runs the stage optimizers for the chosen hard-stage mode and returns the run counts to apply. */
export function planOptimization({
  hardMode,
  runCounts,
  resolvedStages,
  totalEquipmentNeeds,
  farmingDays,
  hardMultiplier,
  materialInventory,
  normalMultiplier,
  blueprints,
}: PlanOptimizationInput): OptimizationPlan {
  const maxHardRuns = farmingDays * 3;
  let hardRunCounts: Record<number, number> = {};

  if (hardMode === 'combined') {
    const needs: Record<string, number> = {};
    for (const [k, amt] of Object.entries(totalEquipmentNeeds)) {
      const n = amt - (materialInventory[k] || 0);
      if (n > 0) needs[k] = n;
    }
    if (Object.keys(needs).length > 0) {
      const result = optimizeCombinedStages2Step(resolvedStages, needs, blueprints, normalMultiplier, hardMultiplier, maxHardRuns);
      return { runCounts: result.runCounts, optimizerOutput: { blueprintsUsed: result.blueprintsUsed, finalRemaining: result.finalRemaining } };
    }
    return { runCounts: {}, optimizerOutput: null };
  }

  if (hardMode === 'manual') {
    hardRunCounts = Object.fromEntries(Object.entries(runCounts).filter(([id]) => resolvedStages.find((s) => s.id === Number(id))?.type === 'Hard'));
  } else if (hardMode === 'aggressive') {
    const needed = new Set(Object.keys(totalEquipmentNeeds));
    resolvedStages
      .filter((s) => s.type === 'Hard' && Object.keys(s.drops).some((k) => needed.has(k)))
      .forEach((s) => {
        hardRunCounts[s.id] = maxHardRuns;
      });
  } else {
    const needsForHard: Record<string, number> = {};
    for (const [k, amt] of Object.entries(totalEquipmentNeeds)) {
      const n = amt - (materialInventory[k] || 0);
      if (n > 0) needsForHard[k] = n;
    }
    if (Object.keys(needsForHard).length > 0) hardRunCounts = optimizeHardStages(resolvedStages, needsForHard, hardMultiplier, maxHardRuns).runCounts;
  }

  const hardFarmed: Record<string, number> = {};
  for (const s of resolvedStages) {
    if (s.type !== 'Hard') continue;
    const runs = hardRunCounts[s.id] || 0;
    if (!runs) continue;
    for (const [k, d] of Object.entries(s.drops)) hardFarmed[k] = (hardFarmed[k] || 0) + d * runs * hardMultiplier;
  }

  const needsForNormal: Record<string, number> = {};
  for (const [k, amt] of Object.entries(totalEquipmentNeeds)) {
    const n = amt - (materialInventory[k] || 0) - (hardFarmed[k] || 0);
    if (n > 0) needsForNormal[k] = n;
  }

  const newCounts = { ...hardRunCounts };
  if (Object.keys(needsForNormal).length > 0) {
    const result = optimizeNormalStages2Step(resolvedStages, needsForNormal, blueprints, normalMultiplier);
    for (const [id, runs] of Object.entries(result.runCounts)) newCounts[Number(id)] = runs;
    return { runCounts: newCounts, optimizerOutput: { blueprintsUsed: result.blueprintsUsed, finalRemaining: result.finalRemaining } };
  }
  return { runCounts: newCounts, optimizerOutput: null };
}
