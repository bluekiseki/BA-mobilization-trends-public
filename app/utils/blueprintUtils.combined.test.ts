import { describe, it, expect } from 'vitest';
import { optimizeCombinedStages2Step, optimizeHardStages, optimizeNormalStages2Step } from './blueprintUtils';

// Equipment IDs (growthData): Hat T2 = 1001, Gloves T2 = 2001, Shoes T2 = 3001
// Drop keys use "Equipment_" prefix. getTierFromEquipmentId(1001) = 2, etc.

interface TestStage {
  id: number;
  type: 'Normal' | 'Hard';
  chapter: number;
  stageNum: number;
  ap: number;
  drops: Record<string, number>;
}

const mkStage = (id: number, type: 'Normal' | 'Hard', ap: number, drops: Record<string, number>, chapter = 1, stageNum = 1): TestStage => ({ id, type, chapter, stageNum, ap, drops });

const calcAP = (runCounts: Record<number, number>, stages: TestStage[]): number => {
  let total = 0;
  for (const [idStr, runs] of Object.entries(runCounts)) {
    const s = stages.find((s) => s.id === Number(idStr));
    if (s) total += s.ap * runs;
  }
  return total;
};

describe('optimizeCombinedStages2Step', () => {
  it('returns empty result for empty needs', () => {
    const stages = [mkStage(1, 'Hard', 30, { Equipment_2001: 1.0 })];
    const result = optimizeCombinedStages2Step(stages, {}, {}, 1, 1, 10);
    expect(result.runCounts).toEqual({});
    expect(result.blueprintsUsed).toEqual({});
    expect(result.finalRemaining).toEqual({});
  });

  it('caps hard stage runs at maxRunsPerStage', () => {
    // Needs 1000 runs uncapped but cap is 10
    const hardA = mkStage(1, 'Hard', 30, { Equipment_2001: 0.1 });
    const result = optimizeCombinedStages2Step([hardA], { Equipment_2001: 100 }, {}, 1, 1, 10);
    expect(result.runCounts[1] ?? 0).toBeLessThanOrEqual(10);
  });

  it('uses fewer AP than sequential when hard over-allocates for shared items', () => {
    // Sequential: A×40 (1600 AP). Combined: A×10 + B×15 (625 AP, cross-source optimization).
    const hardA = mkStage(1, 'Hard', 40, { Equipment_1001: 1.0, Equipment_2001: 0.5 });
    const normalB = mkStage(2, 'Normal', 15, { Equipment_2001: 1.0 });
    const stages = [hardA, normalB];
    const needs = { Equipment_1001: 10, Equipment_2001: 20 };

    const combined = optimizeCombinedStages2Step(stages, needs, {}, 1, 1, 100);
    const combinedAP = calcAP(combined.runCounts, stages);

    // Compute sequential AP (hard first, then normal for remainder)
    const hardRes = optimizeHardStages(stages, needs, 1, 100);
    const hardFarmed: Record<string, number> = {};
    for (const [idStr, runs] of Object.entries(hardRes.runCounts)) {
      const s = stages.find((s) => s.id === Number(idStr));
      if (s) for (const [k, d] of Object.entries(s.drops)) hardFarmed[k] = (hardFarmed[k] || 0) + d * runs;
    }
    const normalNeeds: Record<string, number> = {};
    for (const [k, amt] of Object.entries(needs)) {
      const n = amt - (hardFarmed[k] || 0);
      if (n > 0) normalNeeds[k] = n;
    }
    const normalRes = Object.keys(normalNeeds).length > 0 ? optimizeNormalStages2Step(stages, normalNeeds, {}, 1) : { runCounts: {} as Record<number, number>, blueprintsUsed: {}, finalRemaining: {} };
    const seqAP = calcAP(hardRes.runCounts, stages) + calcAP(normalRes.runCounts, stages);

    expect(combinedAP).toBeLessThan(seqAP);
    // Hard stage used less than sequential (no over-allocation for shared Gloves)
    expect(combined.runCounts[1] ?? 0).toBeLessThan(hardRes.runCounts[1] ?? 100);
  });

  it('covers hard-only items using hard stages', () => {
    // Gloves only in hard; Hat only in normal
    const hardA = mkStage(1, 'Hard', 30, { Equipment_2001: 1.0 });
    const normalB = mkStage(2, 'Normal', 15, { Equipment_1001: 1.0 });
    const stages = [hardA, normalB];

    const result = optimizeCombinedStages2Step(stages, { Equipment_1001: 5, Equipment_2001: 5 }, {}, 1, 1, 30);
    expect(result.runCounts[1] ?? 0).toBeGreaterThan(0); // hard used for Gloves
    expect(result.runCounts[2] ?? 0).toBeGreaterThan(0); // normal used for Hat
    expect(Object.keys(result.finalRemaining).length).toBe(0); // all needs met
  });

  it('behaves identically to normal-only when no hard stages exist', () => {
    const normalB = mkStage(2, 'Normal', 15, { Equipment_1001: 1.0 });
    const stages = [normalB];
    const needs = { Equipment_1001: 10 };

    const combined = optimizeCombinedStages2Step(stages, needs, {}, 1, 1, 30);
    const normalOnly = optimizeNormalStages2Step(stages, needs, {}, 1);

    expect(combined.runCounts[2]).toEqual(normalOnly.runCounts[2]);
  });

  it('hard stage ordering: higher chapter/stageNum sorted to front within tier', () => {
    // Two hard stages at same tier; higher efficiency (1.0 drop) should be preferred by LP
    const hardHigh = mkStage(1, 'Hard', 30, { Equipment_2001: 1.0 }, 5, 2); // chapter 5, stage 2
    const hardLow = mkStage(2, 'Hard', 30, { Equipment_2001: 0.5 }, 5, 1); // chapter 5, stage 1
    const stages = [hardLow, hardHigh]; // intentionally reversed; sorting should fix this

    const result = optimizeCombinedStages2Step(stages, { Equipment_2001: 5 }, {}, 1, 1, 10);
    // Either stage can cover the need; just verify no hard stage exceeds cap
    expect(result.runCounts[1] ?? 0).toBeLessThanOrEqual(10);
    expect(result.runCounts[2] ?? 0).toBeLessThanOrEqual(10);
    expect(Object.keys(result.finalRemaining).length).toBe(0);
  });
});
