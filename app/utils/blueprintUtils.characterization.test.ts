import { describe, expect, it, vi } from 'vitest';
import { optimizeCombinedStages2Step, optimizeNormalStages2Step } from './blueprintUtils';

// Pins the current output of the step1/step2 optimizers so that merging their duplicated bodies cannot change results.
// Equipment IDs (growthData): Hat T2 = 1001, Gloves T2 = 2001, Shoes T2 = 3001; universal Hat blueprint = Equipment_501000.

interface TestStage {
  id: number;
  type: 'Normal' | 'Hard';
  chapter: number;
  stageNum: number;
  ap: number;
  drops: Record<string, number>;
}

const mkStage = (id: number, type: 'Normal' | 'Hard', ap: number, drops: Record<string, number>): TestStage => ({ id, type, chapter: 1, stageNum: id, ap, drops });

const normalStages = [
  mkStage(1, 'Normal', 10, { Equipment_1001: 1.0, Equipment_2001: 0.5 }),
  mkStage(2, 'Normal', 15, { Equipment_2001: 1.0, Equipment_3001: 0.5, Equipment_501000: 0.2 }),
  mkStage(3, 'Normal', 20, { Equipment_3001: 1.0, Equipment_1001: 0.25 }),
];
const hardStages = [mkStage(11, 'Hard', 20, { Equipment_1001: 1.0, Equipment_2001: 0.5, Equipment_502000: 0.1 }), mkStage(12, 'Hard', 25, { Equipment_3001: 1.0 })];

const scenarios: { name: string; needs: Record<string, number>; blueprints: Record<string, number> }[] = [
  { name: 'no blueprints', needs: { Equipment_1001: 10, Equipment_2001: 20, Equipment_3001: 15 }, blueprints: {} },
  { name: 'with universal blueprints', needs: { Equipment_1001: 30, Equipment_2001: 25, Equipment_3001: 40 }, blueprints: { Hat: 5, Gloves: 10, Shoes: 3 } },
  { name: 'blueprints exceed needs', needs: { Equipment_1001: 4, Equipment_2001: 2 }, blueprints: { Hat: 50, Gloves: 50 } },
  { name: 'single item', needs: { Equipment_3001: 7 }, blueprints: { Shoes: 2 } },
];

describe('step2 characterization', () => {
  for (const { name, needs, blueprints } of scenarios) {
    it(`optimizeNormalStages2Step: ${name}`, () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      expect(optimizeNormalStages2Step(normalStages, needs, blueprints, 1.5)).toMatchSnapshot();
    });

    it(`optimizeCombinedStages2Step: ${name}`, () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      expect(optimizeCombinedStages2Step([...hardStages, ...normalStages], needs, blueprints, 1.5, 2, 20)).toMatchSnapshot();
    });

    it(`combined with normal-only stages matches normal: ${name}`, () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const normal = optimizeNormalStages2Step(normalStages, needs, blueprints, 1.5);
      const combined = optimizeCombinedStages2Step(normalStages, needs, blueprints, 1.5, 2, 20);
      expect(combined).toEqual(normal);
    });
  }
});
