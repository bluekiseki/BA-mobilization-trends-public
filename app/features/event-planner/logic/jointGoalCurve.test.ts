import { describe, it, expect } from 'vitest';
import { buildJointCurve, solveJointAtAp, solveLp, type JointModel } from './jointGoalCurve';

describe('solveLp', () => {
  it('solves a small bounded LP', () => {
    // max x + y: x + 2y <= 4, 3x + y <= 6 -> x = 1.6, y = 1.2
    const r = solveLp(
      [1, 1],
      [
        [1, 2],
        [3, 1],
      ],
      [4, 6],
    );
    expect(r.feasible).toBe(true);
    expect(r.value).toBeCloseTo(2.8, 6);
  });

  it('handles a negative right-hand side (a lower bound)', () => {
    // max -x: x >= 2 (as -x <= -2), x <= 5 -> -2
    const r = solveLp([-1], [[-1], [1]], [-2, 5]);
    expect(r.feasible).toBe(true);
    expect(r.value).toBeCloseTo(-2, 6);
  });

  it('reports infeasible systems', () => {
    expect(solveLp([1], [[1], [-1]], [1, -3]).feasible).toBe(false);
  });
});

describe('solveJointAtAp', () => {
  // Stage 1 costs 10 AP and gives 1 target + 3 currency per run; its first clear also gives 5 target. The plan
  // commits to buying something that costs 12 currency.
  const model: JointModel = {
    apKey: 'AP',
    targetKey: 'T',
    columns: [],
    chains: [
      [
        {
          in: new Map([['AP', 10]]),
          out: new Map([
            ['T', 6],
            ['C', 3],
          ]),
          repeat: {
            in: new Map([['AP', 10]]),
            out: new Map([
              ['T', 1],
              ['C', 3],
            ]),
            cap: Infinity,
          },
        },
      ],
    ],
    fixed: [{ in: new Map([['C', 12]]), out: new Map() }],
    constants: new Map(),
  };

  it('needs the clear plus enough repeats to fund the purchase (hand: 10 + 3 x 10 = 40 AP)', () => {
    expect(solveJointAtAp(model, [1], 39)).toBeNull();
    // 6 from the clear + 3 repeats of 1
    expect(solveJointAtAp(model, [1], 40)).toBeCloseTo(9, 6);
    // 5 repeats at 60 AP
    expect(solveJointAtAp(model, [1], 60)).toBeCloseTo(11, 6);
  });

  it('plots nothing below the funding AP and grows after it', () => {
    const curve = buildJointCurve(model, 60, 7);
    expect(curve[0].amount).toBeNull();
    expect(curve[curve.length - 1].amount).toBeCloseTo(11, 6);
  });
});
