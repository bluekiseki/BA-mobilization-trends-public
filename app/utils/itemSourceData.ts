import { cdn } from '~/utils/cdn';
import type { CoinShopMonthly, EventDropIndex, EventFixedTotals, MultifloorRewards, RaidSeasonRewards } from '~/utils/itemOutlook';

const cache = new Map<string, Promise<unknown>>();

/** Fetches a static JSON once per page session; a failed request is retried on the next call. */
function loadOnce<T>(path: string, fallback: T): Promise<T> {
  const cached = cache.get(path);
  if (cached) return cached as Promise<T>;
  const request = (async () => {
    try {
      const response = await fetch(cdn(path));
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return (await response.json()) as T;
    } catch {
      cache.delete(path);
      return fallback;
    }
  })();
  cache.set(path, request);
  return request;
}

export const loadEventDropIndex = () => loadOnce<EventDropIndex>('/ew/event_drop_index.json', {});

export const loadRaidSeasonRewards = () => loadOnce<RaidSeasonRewards | null>('/ew/raid_season_rewards.json', null);

export const loadEventFixedTotals = () => loadOnce<EventFixedTotals | null>('/ew/event_fixed_totals.json', null);

export const loadMultifloorRewards = () => loadOnce<MultifloorRewards | null>('/ew/multifloor_floor_rewards.json', null);

export const loadCoinShopMonthly = () => loadOnce<CoinShopMonthly | null>('/ew/coin_shop_monthly.json', null);
