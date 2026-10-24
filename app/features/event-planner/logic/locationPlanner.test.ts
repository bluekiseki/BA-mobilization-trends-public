import { describe, expect, it, vi } from 'vitest';
import type { LocationConfig, LocationData } from '~/types/minigame/location';
import { getLoadedEvent, loadEventsFromCdn } from './loadEventsFromCdn';
import { calculateLocation, createLocationAutoConfig, getLocationMaxRuns, getLocationRows, getLocationSpendableCurrency, locationRowKey } from './locationPlanner';

vi.hoisted(() => vi.stubEnv('VITE_USE_CDN', 'true'));

type LocationEvent = { location: LocationData };

const LOCATION_EVENT_IDS = [808, 817, 824, 855, 862, 10808, 10817];
const events = await loadEventsFromCdn<LocationEvent>(LOCATION_EVENT_IDS);
const event = getLoadedEvent(events, 808);
const data = event.location;

const completePlan = (): LocationConfig => ({
  runs: Object.fromEntries(data.zone.slice(0, 7).map((zone) => [locationRowKey(zone.LocationRank, data.zone[0].RewardGroupId), zone.LocationRank])),
});

describe('Location schedule planning', () => {
  it('requires 28 schedules and 14,000 event items to reach rank 8', () => {
    const result = calculateLocation(data, completePlan());
    expect(result.ranks.map((rank) => rank.requiredRuns)).toEqual([1, 2, 3, 4, 5, 6, 7, null]);
    expect(result.ranks.map((rank) => rank.cumulativeThreshold)).toEqual([500, 1500, 3000, 5000, 7500, 10500, 14000, 14000]);
    expect(result.runs).toBe(28);
    expect(result.cost.Item_80060).toBe(14000);
    expect(result.ranks.slice(0, 7).every((rank) => rank.status === 'complete')).toBe(true);
  });

  it('uses the highest unlocked reward tier for each region', () => {
    const ranks = getLocationRows(data);
    const firstGroup = data.zone[0].RewardGroupId;
    const firstAtRank2 = ranks[1].rows.find((row) => row.groupId === firstGroup);
    const firstAtRank3 = ranks[2].rows.find((row) => row.groupId === firstGroup);
    const firstAtRank4 = ranks[3].rows.find((row) => row.groupId === firstGroup);
    expect(firstAtRank2?.rewards).toEqual(firstAtRank3?.rewards);
    expect(firstAtRank4?.rewards).not.toEqual(firstAtRank3?.rewards);
  });

  it('combines duplicate reward rolls into one expected quantity', () => {
    const modified: LocationData = structuredClone(data);
    const reward = modified.reward.find((entry) => entry.ScheduleGroupId === modified.zone[0].RewardGroupId && entry.LocationRank === 1);
    if (!reward) throw new Error('Missing fixture reward');
    reward.ExtraRewardParcelId.push(reward.ExtraRewardParcelId[0]);
    reward.ExtraRewardParcelTypeStr.push(reward.ExtraRewardParcelTypeStr[0]);
    reward.ExtraRewardAmount.push(2);
    reward.ExtraRewardProb.push(5000);
    reward.ExtraFavorExp = 4;
    reward.ExtraFavorExpProb = 2500;
    const row = getLocationRows(modified)[0].rows[0];
    const duplicated = row.rewards.find((item) => item.key === `Item_${reward.ExtraRewardParcelId[0]}`);
    expect(row.rewards.filter((item) => item.key === duplicated?.key)).toHaveLength(1);
    expect(duplicated?.expected).toBeCloseTo((reward.ExtraRewardAmount[0] * reward.ExtraRewardProb[0]) / 10000 + 1);
    expect(row.favorExp).toBeCloseTo(row.visitors * (reward.FavorExp + 1));
  });

  it('excludes rank overflow and later ranks while preserving valid earlier runs', () => {
    const firstGroup = data.zone[0].RewardGroupId;
    const secondGroup = data.zone[1].RewardGroupId;
    const result = calculateLocation(data, {
      runs: {
        [locationRowKey(1, firstGroup)]: 1,
        [locationRowKey(2, firstGroup)]: 1,
        [locationRowKey(2, secondGroup)]: 2,
        [locationRowKey(3, firstGroup)]: 3,
      },
    });
    expect(result.runs).toBe(2);
    expect(result.excludedRuns).toBe(5);
    expect(result.ranks[1].status).toBe('excess');
    expect(result.ranks[2].status).toBe('blocked');
  });

  it('fills a finite rank even before currency supply is entered', () => {
    const firstGroup = data.zone[0].RewardGroupId;
    const secondGroup = data.zone[1].RewardGroupId;
    const result = calculateLocation(data, {
      runs: { [locationRowKey(1, firstGroup)]: 1, [locationRowKey(2, firstGroup)]: 1 },
    });
    expect(getLocationMaxRuns(result, 2, locationRowKey(2, secondGroup), 1500)).toBe(1);
    expect(getLocationMaxRuns(result, 2, locationRowKey(2, secondGroup), 0)).toBe(1);
  });

  it('carries surplus rank points into the next rank instead of rounding each rank independently', () => {
    const modified: LocationData = structuredClone(data);
    modified.zone[0].EventPointForLocationRank = 750;
    modified.zone[1].EventPointForLocationRank = 1000;
    modified.zone[2].EventPointForLocationRank = 1250;
    const ranks = getLocationRows(modified);
    expect(ranks.slice(0, 3).map((rank) => rank.requiredRuns)).toEqual([2, 2, 2]);
    expect(ranks.slice(0, 3).map((rank) => rank.carriedPoints)).toEqual([0, 250, 250]);
    expect(ranks.slice(0, 3).map((rank) => rank.cumulativeThreshold)).toEqual([750, 1750, 3000]);
    modified.info[0].ScheduleEventPointCostParcelAmount = 1000;
    expect(
      getLocationRows(modified)
        .slice(0, 3)
        .map((rank) => rank.requiredRuns),
    ).toEqual([2, 2, 2]);
    const firstGroup = data.zone[0].RewardGroupId;
    const result = calculateLocation(modified, {
      runs: {
        [locationRowKey(1, firstGroup)]: 2,
        [locationRowKey(2, firstGroup)]: 2,
        [locationRowKey(3, firstGroup)]: 2,
      },
    });
    expect(result.ranks.slice(0, 3).every((rank) => rank.status === 'complete')).toBe(true);
    expect(result.runs).toBe(6);
    expect(result.cost.Item_80060).toBe(6000);
  });

  it('ignores saved keys for unavailable regions and invalid counts', () => {
    const firstGroup = data.zone[0].RewardGroupId;
    const result = calculateLocation(data, {
      runs: {
        [locationRowKey(1, firstGroup)]: -2,
        [locationRowKey(1, data.zone[7].RewardGroupId)]: 100,
        [locationRowKey(2, firstGroup)]: 1.5,
      },
    });
    expect(result.startRank).toBeNull();
    expect(result.runs).toBe(0);
  });

  it('lets a later rank be filled while earlier ranks still need attention', () => {
    const firstGroup = data.zone[0].RewardGroupId;
    const result = calculateLocation(data, {
      runs: { [locationRowKey(1, firstGroup)]: 1, [locationRowKey(2, firstGroup)]: 1 },
    });
    expect(getLocationMaxRuns(result, 3, locationRowKey(3, firstGroup), 0)).toBe(3);
  });

  it('lets MAX fill an earlier rank after planning started at a higher rank', () => {
    const firstGroup = data.zone[0].RewardGroupId;
    const result = calculateLocation(data, { runs: { [locationRowKey(3, firstGroup)]: 2 } });
    expect(result.startRank).toBe(3);
    expect(getLocationMaxRuns(result, 1, locationRowKey(1, firstGroup), 0)).toBe(1);
  });

  it('builds all 36 unlocked rank-region cells for every current Location event', () => {
    for (const id of LOCATION_EVENT_IDS) {
      const current = getLoadedEvent(events, id);
      const ranks = getLocationRows(current.location);
      expect(ranks.map((rank) => rank.rows.length)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(ranks.flatMap((rank) => rank.rows)).toHaveLength(36);
      expect(ranks.every((rank) => rank.rows.every((row) => row.rewards.length > 0))).toBe(true);
    }
  });

  it('auto-fills each unlocked region once through rank 7 and preserves rank 8', () => {
    for (const id of LOCATION_EVENT_IDS) {
      const current = getLoadedEvent(events, id);
      const rank8Key = locationRowKey(8, current.location.zone[7].RewardGroupId);
      const before: LocationConfig = { runs: { [locationRowKey(1, current.location.zone[0].RewardGroupId)]: 99, [rank8Key]: 2 } };
      const config = createLocationAutoConfig(calculateLocation(current.location, before), before);
      const result = calculateLocation(current.location, config);
      expect(result.ranks.slice(0, 7).every((rank) => rank.status === 'complete' && rank.rows.every((row) => row.runs === 1))).toBe(true);
      expect(result.ranks[7].rows.find((row) => row.key === rank8Key)?.runs).toBe(2);
      expect(result.runs).toBe(30);
    }
  });

  it('computes MAX currency from real transactions without cumulative goals or its own spend', () => {
    const spendable = getLocationSpendableCurrency(
      { 80060: 1000 },
      [
        { source: 'farming', items: { Item_80060: { amount: 2000, isBonusApplied: false } } },
        { source: 'shop_cost', items: { Item_80060: { amount: -500, isBonusApplied: false } } },
        { source: 'totalReward_cost', items: { Item_80060: { amount: -10000, isBonusApplied: false, goalKind: 'cumulative' } } },
        { source: 'location_cost', items: { Item_80060: { amount: -500, isBonusApplied: false } } },
      ],
      'Item_80060',
    );
    expect(spendable).toBe(2500);
    const result = calculateLocation(data, { runs: { [locationRowKey(1, data.zone[0].RewardGroupId)]: 1 } });
    expect(getLocationMaxRuns(result, 1, locationRowKey(1, data.zone[0].RewardGroupId), spendable)).toBe(1);
  });

  it('keeps an existing rank-8 allocation when MAX is pressed again', () => {
    const rank8Key = locationRowKey(8, data.zone[7].RewardGroupId);
    const first = calculateLocation(data, { ...completePlan(), runs: { ...completePlan().runs, [rank8Key]: 2 } });
    expect(getLocationMaxRuns(first, 8, rank8Key, 16000)).toBe(4);
    const second = calculateLocation(data, { ...completePlan(), runs: { ...completePlan().runs, [rank8Key]: 4 } });
    expect(getLocationMaxRuns(second, 8, rank8Key, 16000)).toBe(4);
  });
});
