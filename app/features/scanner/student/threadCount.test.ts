import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickStudentThreadCount } from './threadCount';

describe('student WASM thread budget', () => {
  beforeEach(() => {
    vi.stubGlobal('crossOriginIsolated', true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 4],
    [8, 4],
    [16, 4],
    [0, 1],
    [-1, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])('budgets %s logical cores to %s threads', (cores, threads) => {
    vi.stubGlobal('navigator', { hardwareConcurrency: cores });
    expect(pickStudentThreadCount()).toBe(threads);
  });

  it.each([
    [1, 1],
    [2, 1],
    [4, 2],
    [8, 4],
  ])('caps an 8-core device reporting %s GiB at %s threads', (deviceMemory, threads) => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory });
    expect(pickStudentThreadCount()).toBe(threads);
  });

  it('uses one thread when hardware concurrency is unavailable', () => {
    vi.stubGlobal('navigator', {});
    expect(pickStudentThreadCount()).toBe(1);
  });

  it('uses one thread without document isolation or SharedArrayBuffer', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 16 });
    vi.stubGlobal('crossOriginIsolated', false);
    expect(pickStudentThreadCount()).toBe(1);
    vi.stubGlobal('crossOriginIsolated', true);
    vi.stubGlobal('SharedArrayBuffer', undefined);
    expect(pickStudentThreadCount()).toBe(1);
  });
});
