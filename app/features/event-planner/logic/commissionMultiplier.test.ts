import { describe, expect, it } from 'vitest';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { pickCommissionMultiplier } from './commissionMultiplier';

const campaign = (campaignType: string, multiplier: number, start: string, end: string): ScheduleItemV2 => ({
  id: `${campaignType}-${start}`,
  type: 'campaign',
  startTime: start,
  endTime: end,
  details: { campaignType, multiplier },
});

describe('pickCommissionMultiplier', () => {
  const items = [campaign('Commission', 3, '2026-11-17T00:00:00Z', '2026-11-24T00:00:00Z'), campaign('Bounty', 3, '2026-11-17T00:00:00Z', '2026-11-24T00:00:00Z')];

  it('uses the Commission multiplier when it overlaps the event', () => {
    expect(pickCommissionMultiplier(items, Date.parse('2026-11-20T00:00:00Z'), Date.parse('2026-12-01T00:00:00Z'), 2)).toBe(3);
  });

  it('falls back when nothing overlaps or only other campaigns do', () => {
    expect(pickCommissionMultiplier(items, Date.parse('2026-12-02T00:00:00Z'), Date.parse('2026-12-09T00:00:00Z'), 2)).toBe(2);
    expect(pickCommissionMultiplier([items[1]], Date.parse('2026-11-20T00:00:00Z'), Date.parse('2026-11-21T00:00:00Z'), 2)).toBe(2);
  });
});
