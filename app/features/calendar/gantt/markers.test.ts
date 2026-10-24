import { describe, expect, it } from 'vitest';
import { buildMarkers } from './markers';

const calculateLeftPx = (time: string) => new Date(time).getTime() / 3600000;

describe('buildMarkers', () => {
  // Range ends a few hours after 2026-10-31T15:00Z, which is 2026-11-01 00:00 in Asia/Seoul.
  const min = Date.UTC(2026, 9, 20);
  const max = Date.UTC(2026, 9, 31, 20);
  const params = { min, max, locale: 'en', server: 'kr' as const, calculateLeftPx };

  it('utc mode is independent of the runtime timezone', () => {
    const utc = buildMarkers({ ...params, tz: 'utc' });
    expect(utc.monthly.map((m) => m.date)).toEqual([new Date(Date.UTC(2026, 9, 1)).toISOString()]);
    expect(utc.monthly[0].label).toBe('10/2026');
  });

  it('local mode follows the runtime timezone', () => {
    const local = buildMarkers({ ...params, tz: 'local' });
    const expected = new Date(2026, 9, 1).getTime() <= max ? 1 : 0;
    expect(local.monthly.filter((m) => new Date(m.date).getMonth() === 9)).toHaveLength(expected);
  });
});
