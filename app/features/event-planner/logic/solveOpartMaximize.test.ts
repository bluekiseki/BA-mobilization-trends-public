import { describe, it, expect } from 'vitest';
import { solveOpartMaximize } from './solveOpartMaximize';

describe('solveOpartMaximize', () => {
  // Test data: 4 stages (9-12), 3 items
  // Stage 0 (9): [28, 4, 4] drops
  // Stage 1 (10): [4, 32, 0] drops
  // Stage 2 (11): [4, 0, 32] drops
  // Stage 3 (12): [36, 0, 0] drops
  const dropMatrix = [
    [28, 4, 4],
    [4, 32, 0],
    [4, 0, 32],
    [36, 0, 0],
  ];
  const apCosts = [20, 20, 20, 20];
  const neededAmounts = [43113, 15650, 12949];
  const numItems = neededAmounts.length;

  it('should prioritize stage 3 (opart4) when maximizing opart4', () => {
    const opartDropRates = [0, 0, 0, 1]; // opart in stage 3
    const result = solveOpartMaximize({
      dropMatrix,
      apCosts,
      neededAmounts,
      opartDropRates,
    });

    // Stage 3 should have significant runs
    expect(result[3]).toBeGreaterThan(500);
    // Stage 0 should have minimal/zero runs (stage 3 handles item 1)
    expect(result[0]).toBeLessThanOrEqual(100);
  });

  it('should prioritize stage 0 (opart1) when maximizing opart1', () => {
    const opartDropRates = [1, 0, 0, 0]; // opart in stage 0
    const result = solveOpartMaximize({
      dropMatrix,
      apCosts,
      neededAmounts,
      opartDropRates,
    });

    // Stage 0 should have significant runs
    expect(result[0]).toBeGreaterThan(500);
    // Stage 3 should have zero/minimal runs
    expect(result[3]).toBeLessThanOrEqual(100);
  });

  it('should satisfy all item requirements', () => {
    const opartDropRates = [0, 0, 0, 1];
    const result = solveOpartMaximize({
      dropMatrix,
      apCosts,
      neededAmounts,
      opartDropRates,
    });

    // Calculate final item counts
    const finalItems = neededAmounts.map((_, j) => result.reduce((sum, x, i) => sum + x * dropMatrix[i][j], 0));

    // All items should meet requirements
    for (let j = 0; j < numItems; j++) {
      expect(finalItems[j]).toBeGreaterThanOrEqual(neededAmounts[j]);
    }
  });

  it('should control over-farming (item surplus ≤ maxSingleDrop)', () => {
    const maxSingleDrop = [36, 32, 32]; // max drop per item
    const opartDropRates = [0, 0, 0, 1];
    const result = solveOpartMaximize({
      dropMatrix,
      apCosts,
      neededAmounts,
      opartDropRates,
    });

    const finalItems = neededAmounts.map((_, j) => result.reduce((sum, x, i) => sum + x * dropMatrix[i][j], 0));

    // Over-farming should be ≤ maxSingleDrop
    for (let j = 0; j < neededAmounts.length; j++) {
      const overfarm = finalItems[j] - neededAmounts[j];
      expect(overfarm).toBeLessThanOrEqual(maxSingleDrop[j] + 1); // +1 for floating point tolerance
    }
  });

  it('should return zeros when no opart stage exists', () => {
    const opartDropRates = [0, 0, 0, 0]; // no opart
    const result = solveOpartMaximize({
      dropMatrix,
      apCosts,
      neededAmounts,
      opartDropRates,
    });

    expect(result.every((x) => x === 0)).toBe(true);
  });

  it('should handle opart in middle stages', () => {
    const opartDropRates = [0, 1, 0, 0]; // opart in stage 1
    const result = solveOpartMaximize({
      dropMatrix,
      apCosts,
      neededAmounts,
      opartDropRates,
    });

    // Stage 1 should have significant runs
    expect(result[1]).toBeGreaterThan(200);
  });
});
