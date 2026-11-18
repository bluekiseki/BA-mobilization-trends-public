import type { ManualTicketBatchInput, PyroxeneConfig, PlannerSchedule } from '~/utils/pyroxeneCalc';
import { buildInitialTicketBatches, clampCharge } from '~/utils/pyroxeneCalc';
import type { BannerStrategy, Student } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';

export function updatePermanentTickets(batches: ManualTicketBatchInput[], key: 'ticket1Count' | 'ticket10Count', total: number, newId: string): ManualTicketBatchInput[] {
  const next = batches.map((batch) => ({ ...batch }));
  const current = next.filter((batch) => !batch.expiresAt).reduce((sum, batch) => sum + batch[key], 0);
  let delta = Math.max(0, Math.floor(total)) - current;
  if (delta > 0) {
    const first = next.find((batch) => !batch.expiresAt);
    if (first) first[key] += delta;
    else next.push({ id: newId, expiresAt: null, ticket1Count: 0, ticket10Count: 0, [key]: delta });
  } else {
    for (let index = next.length - 1; index >= 0 && delta < 0; index--) {
      const batch = next[index];
      if (batch.expiresAt) continue;
      const change = Math.min(batch[key], -delta);
      batch[key] -= change;
      delta += change;
    }
  }
  return next;
}

export function simulationKeyV3(
  strategies: Record<string, BannerStrategy>,
  config: PyroxeneConfig,
  schedules: PlannerSchedule[],
  banners: BannerPeriod[],
  students: Student[],
  region: string,
  owned: number[],
): string {
  return JSON.stringify({
    strategies: Object.values(strategies)
      .filter((strategy) => strategy.isActive)
      .sort((a, b) => a.bannerId.localeCompare(b.bannerId)),
    tickets: buildInitialTicketBatches(config, schedules),
    consumeExpiringTickets: config.consumeExpiringTickets ?? true,
    charge: [clampCharge(config.chargeNormal), clampCharge(config.chargeLimited)],
    banners,
    students,
    region,
    owned: [...owned].sort((a, b) => a - b),
  });
}
