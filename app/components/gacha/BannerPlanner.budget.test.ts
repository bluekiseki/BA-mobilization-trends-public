// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BannerStrategy } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';
import BannerPlanner from './BannerPlanner';

// The frozen legacy (v1) banner planner stores its budget as `maxPull` (1 spark = 200 pulls).
// Data saved earlier still carries `maxSparks`, built here from a plain record so the deprecated field is not referenced.
const day = 86_400_000;
const banner = {
  id: 'b1',
  startTime: new Date(Date.now() - day).toISOString(),
  endTime: new Date(Date.now() + day).toISOString(),
  bannerType: '',
  isFes: false,
  isLimitedBanner: false,
  isRerunBanner: false,
  isRecall: false,
  freePulls: 0,
  useChargeSystem: false,
  pickupStudents: [
    { id: 1, name: 'Alpha' },
    { id: 2, name: 'Beta' },
  ],
} as unknown as BannerPeriod;

const config = (studentId: number) => ({ studentId, mode: 'skip', priority: studentId, opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 });
const makeStrategy = (extra: Record<string, number>): BannerStrategy =>
  ({ bannerId: 'b1', isActive: true, minPulls: 0, freePulls: 0, isFes: false, studentConfigs: { 1: config(1), 2: config(2) }, ...extra }) as unknown as BannerStrategy;

const setSelect = (select: HTMLSelectElement, value: string) =>
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

function render(strategy: BannerStrategy) {
  const onUpdateStrategy = vi.fn();
  const onUpdateStudentConfig = vi.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(BannerPlanner, { banners: [banner], strategies: { b1: strategy }, portraitMap: {}, onUpdateStrategy, onUpdateStudentConfig, currentServer: 'KR' })));
  const budget = container.querySelector('select.w-24') as HTMLSelectElement | null;
  const modes = Array.from(container.querySelectorAll('select')).filter((s) => s.querySelector('option[value="must"]') !== null);
  return { container, root, budget, modes, onUpdateStrategy, onUpdateStudentConfig };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('legacy BannerPlanner budget', () => {
  it('shows one spark for a default strategy and the stored number for data saved with maxSparks', () => {
    expect(render(makeStrategy({ maxPull: 200 })).budget?.value).toBe('1');
    expect(render(makeStrategy({ maxPull: 600 })).budget?.value).toBe('3');
    expect(render(makeStrategy({ maxSparks: 3 })).budget?.value).toBe('3');
    expect(render(makeStrategy({})).budget?.value).toBe('1');
  });

  it('writes the chosen spark count as maxPull', () => {
    const { budget, onUpdateStrategy } = render(makeStrategy({ maxPull: 200 }));
    expect(budget).not.toBeNull();
    setSelect(budget as HTMLSelectElement, '2');
    expect(onUpdateStrategy).toHaveBeenCalledWith('b1', { maxPull: 400 });
  });

  it('raises the budget to cover every required student, and leaves it alone when it is already enough', () => {
    const { modes, onUpdateStrategy, onUpdateStudentConfig } = render(makeStrategy({ maxPull: 200 }));
    expect(modes).toHaveLength(2);
    setSelect(modes[0], 'must');
    expect(onUpdateStudentConfig).toHaveBeenCalledWith('b1', 1, { mode: 'must' });
    expect(onUpdateStrategy).not.toHaveBeenCalled();

    // Both students become required: the second requirement exceeds one spark, so the budget grows to two sparks.
    const strategy = makeStrategy({ maxPull: 200 });
    strategy.studentConfigs[1] = { ...strategy.studentConfigs[1], mode: 'must' };
    const { modes: modes2, onUpdateStrategy: update2 } = render(strategy);
    setSelect(modes2[1], 'must');
    expect(update2).toHaveBeenCalledTimes(1);
    const [, updates] = update2.mock.calls[0] as [string, Partial<BannerStrategy>];
    expect(updates.maxPull).toBe(400);
    expect(updates.studentConfigs?.[2].mode).toBe('must');
  });
});
