import { describe, expect, it, vi } from 'vitest';
import { createDownloadTracker } from './downloadTracker';

describe('createDownloadTracker', () => {
  it('maps combined byte progress into the given band', () => {
    const onPercent = vi.fn();
    const tracker = createDownloadTracker({ a: 100, b: 100 }, 0, 30, onPercent);

    tracker.report('a')({ loaded: 50, total: 100 });
    // a: 50/100, b: 0/100 → fraction 0.25 → 7.5 → 8
    expect(onPercent).toHaveBeenLastCalledWith(8);

    tracker.report('b')({ loaded: 100, total: 100 });
    // a: 50, b: 100 → 150/200 = 0.75 → 22.5 → 23
    expect(onPercent).toHaveBeenLastCalledWith(23);
  });

  it('uses the estimate until a real total is known', () => {
    const onPercent = vi.fn();
    const tracker = createDownloadTracker({ a: 1000 }, 0, 100, onPercent);
    tracker.report('a')({ loaded: 250, total: null });
    expect(onPercent).toHaveBeenLastCalledWith(25);
  });

  it('never lets total fall below bytes already received (gzip overshoot)', () => {
    const onPercent = vi.fn();
    const tracker = createDownloadTracker({ a: 100 }, 0, 100, onPercent);
    // Content-Length is the compressed size; the stream yields more decompressed bytes.
    tracker.report('a')({ loaded: 400, total: 100 });
    expect(onPercent).toHaveBeenLastCalledWith(100);
  });

  it('settle() completes a download whose bytes cannot be observed', () => {
    const onPercent = vi.fn();
    const tracker = createDownloadTracker({ a: 100, b: 100 }, 0, 100, onPercent);
    tracker.report('a')({ loaded: 100, total: 100 });
    tracker.settle('b');
    expect(onPercent).toHaveBeenLastCalledWith(100);
  });

  it('emits only when the integer percent changes', () => {
    const onPercent = vi.fn();
    const tracker = createDownloadTracker({ a: 10_000 }, 0, 100, onPercent);
    const report = tracker.report('a');
    report({ loaded: 10, total: 10_000 }); // 0%
    report({ loaded: 20, total: 10_000 }); // still 0%
    report({ loaded: 150, total: 10_000 }); // 2%
    expect(onPercent.mock.calls).toEqual([[0], [2]]);
  });

  it('throws for an unknown download key', () => {
    const tracker = createDownloadTracker({ a: 1 }, 0, 100, () => {});
    expect(() => tracker.report('b')).toThrow(/Unknown download key/);
  });
});
