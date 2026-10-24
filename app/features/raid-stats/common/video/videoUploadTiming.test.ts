import { describe, expect, it } from 'vitest';
import { getVideoUploadTiming } from './videoUploadTiming';

const period = { startTime: '2026-10-14T11:00:00+09:00', endTime: '2026-10-21T03:59:59+09:00' };
const timing = (date: string) => getVideoUploadTiming(Date.parse(date) / 1000, period);

describe('video upload timing', () => {
  it('uses the actual opening time and the 04:00 day boundary', () => {
    expect(timing('2026-10-14T10:59:59+09:00')).toBe('before');
    expect(timing(period.startTime)).toBe(1);
    expect(timing('2026-10-15T03:59:59+09:00')).toBe(1);
    expect(timing('2026-10-15T04:00:00+09:00')).toBe(2);
  });

  it('keeps the last second inside the raid and labels later uploads', () => {
    expect(timing(period.endTime)).toBe(7);
    expect(timing('2026-10-21T04:00:00+09:00')).toBe('after');
  });

  it('supports shortened raids without assuming a seven-day duration', () => {
    expect(getVideoUploadTiming(Date.parse('2026-10-17T04:00:00+09:00') / 1000, { ...period, endTime: '2026-10-17T03:59:59+09:00' })).toBe('after');
  });

  it('omits labels when dates are unavailable or invalid', () => {
    expect(getVideoUploadTiming(undefined, period)).toBeNull();
    expect(getVideoUploadTiming(Number.NaN, period)).toBeNull();
    expect(getVideoUploadTiming(1, undefined)).toBeNull();
    expect(getVideoUploadTiming(1, { ...period, startTime: 'invalid' })).toBeNull();
  });
});
