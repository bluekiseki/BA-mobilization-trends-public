import { useEffect, useMemo, useState } from 'react';
import { useEventPlanStore } from '~/store/planner/useEventPlanStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { buildExpectedIncome, type CoinShopMonthly, type EventFixedTotals, type IncomeByKey, type MultifloorRewards, type RaidSeasonRewards, type RewardServer } from '~/utils/itemOutlook';
import { loadCoinShopMonthly, loadEventFixedTotals, loadMultifloorRewards, loadRaidSeasonRewards } from '~/utils/itemSourceData';

interface UseExpectedIncomeOptions {
  server: RewardServer;
  events: ScheduleItemV2[];
  raidItems: ScheduleItemV2[];
  multifloorItems: ScheduleItemV2[];
  today: string;
  getTitle: (item: ScheduleItemV2) => string;
  skipKeys?: ReadonlySet<string>;
}

/** Future income from saved event plans and the sources the user assumes in full; read-only. */
export function useExpectedIncome({ server, events, raidItems, multifloorItems, today, getTitle, skipKeys }: UseExpectedIncomeOptions): IncomeByKey {
  const eventPlans = useEventPlanStore((s) => s.plans);
  const eventIncomeMode = useResourcePlanStore((s) => s.eventIncomeMode);
  const assumptions = useResourcePlanStore((s) => s.assumeAllIncome);
  const maxFloors = useResourcePlanStore((s) => s.multifloorMaxFloors);
  const defaultMaxFloor = useResourcePlanStore((s) => s.multifloorDefaultMaxFloor);
  const [multifloorRewards, setMultifloorRewards] = useState<MultifloorRewards | null>(null);
  const autoBuy = useResourcePlanStore((s) => s.autoBuyShopItems);
  const [coinShopMonthly, setCoinShopMonthly] = useState<CoinShopMonthly | null>(null);
  const [eventTotals, setEventTotals] = useState<EventFixedTotals | null>(null);
  const [raidRewards, setRaidRewards] = useState<RaidSeasonRewards | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([loadEventFixedTotals(), loadRaidSeasonRewards(), loadMultifloorRewards(), loadCoinShopMonthly()]).then(([shop, raid, multifloor, coinShop]) => {
      if (!active) return;
      setEventTotals(shop);
      setRaidRewards(raid);
      setMultifloorRewards(multifloor);
      setCoinShopMonthly(coinShop);
    });
    return () => {
      active = false;
    };
  }, []);

  return useMemo(
    () =>
      buildExpectedIncome({
        eventPlans,
        events,
        raidItems,
        multifloorItems,
        multifloor: { rewards: multifloorRewards, maxFloors, defaultMaxFloor },
        eventTotals,
        eventIncomeMode,
        coinShop: { monthly: coinShopMonthly, autoBuy: autoBuy ?? {} },
        raidRewards,
        server,
        assumptions,
        today,
        getTitle,
        skipKeys,
      }),
    [
      eventPlans,
      events,
      raidItems,
      multifloorItems,
      multifloorRewards,
      maxFloors,
      defaultMaxFloor,
      eventTotals,
      eventIncomeMode,
      coinShopMonthly,
      autoBuy,
      raidRewards,
      assumptions,
      today,
      getTitle,
      skipKeys,
    ],
  );
}
