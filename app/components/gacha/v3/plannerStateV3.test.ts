import { describe, expect, it } from 'vitest';
import type { BannerStrategy } from '~/types/gacha';
import type { PyroxeneConfig } from '~/utils/pyroxeneCalc';
import { simulationKeyV3, updatePermanentTickets } from './plannerStateV3';

const config: PyroxeneConfig = {
  currentPyroxene: 0,
  monthlyCard: false,
  halfMonthlyCard: false,
  monthlyPackCost: 0,
  monthlyExtraGem: 0,
  apRefreshes_normal: 0,
  apRefreshes_event: 0,
  raidRank: 'platinum',
  pvpRankTier: 100,
};
const strategy: BannerStrategy = { bannerId: 'first', isActive: true, maxPull: 200, minPulls: 0, studentConfigs: {}, isFes: false, freePulls: 0 };
const key = (settings = config, strategies: Record<string, BannerStrategy> = { first: strategy }, owned: number[] = []) => simulationKeyV3(strategies, settings, [], [], [], 'KR', owned);

describe('v3 permanent ticket editing', () => {
  const batches = [
    { id: 'a', expiresAt: null, ticket1Count: 5, ticket10Count: 2 },
    { id: 'dated', expiresAt: '2026-10-31', ticket1Count: 10, ticket10Count: 3 },
    { id: 'b', expiresAt: null, ticket1Count: 7, ticket10Count: 1 },
  ];
  it('reduces the aggregate while retaining IDs, dated tickets and the other denomination', () => {
    const next = updatePermanentTickets(batches, 'ticket1Count', 3, 'new');
    expect(next).toEqual([{ ...batches[0], ticket1Count: 3 }, batches[1], { ...batches[2], ticket1Count: 0 }]);
    expect(batches[0].ticket1Count).toBe(5);
    expect(batches[2].ticket1Count).toBe(7);
  });
  it('increases the existing aggregate without duplicating batches', () => {
    expect(updatePermanentTickets(batches, 'ticket10Count', 5, 'new')).toEqual([{ ...batches[0], ticket10Count: 4 }, batches[1], batches[2]]);
  });
  it('creates a permanent batch without modifying an expiring batch', () => {
    expect(updatePermanentTickets([batches[1]], 'ticket1Count', 4, 'new')).toEqual([batches[1], { id: 'new', expiresAt: null, ticket1Count: 4, ticket10Count: 0 }]);
  });
});

describe('v3 result validity', () => {
  it('keeps simulations valid after income or AP-only edits', () => {
    expect(key({ ...config, currentPyroxene: 48000, monthlyCard: true, raidRank: 'gold', apRefreshes_event: 3 })).toBe(key());
  });
  it('invalidates simulations for active strategy, ticket or owned student changes', () => {
    expect(key(config, { first: { ...strategy, maxPull: 300 } })).not.toBe(key());
    expect(key({ ...config, manualTicketBatches: [{ id: 'ticket', expiresAt: null, ticket1Count: 1, ticket10Count: 0 }] })).not.toBe(key());
    expect(key({ ...config, consumeExpiringTickets: false })).not.toBe(key());
    expect(key(config, { first: strategy }, [1])).not.toBe(key());
  });
  it('ignores inactive strategies and owned-student ordering', () => {
    expect(key(config, { first: strategy, inactive: { ...strategy, bannerId: 'inactive', isActive: false } })).toBe(key());
    expect(key(config, { first: strategy }, [1, 2])).toBe(key(config, { first: strategy }, [2, 1]));
  });
});
