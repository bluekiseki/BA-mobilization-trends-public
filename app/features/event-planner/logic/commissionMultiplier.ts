import { loadScheduleDataV2, type ScheduleItemV2 } from '~/utils/calender.data.v2';

/** Highest Commission campaign multiplier overlapping [startMs, endMs], or the fallback when none does. */
export function pickCommissionMultiplier(campaigns: ScheduleItemV2[], startMs: number, endMs: number, fallback: number): number {
  let best = fallback;
  for (const item of campaigns) {
    if (item.details?.campaignType !== 'Commission') continue;
    const multiplier = item.details.multiplier ?? 1;
    if (!Number.isFinite(multiplier) || multiplier <= best) continue;
    if (new Date(item.startTime).getTime() <= endMs && new Date(item.endTime).getTime() >= startMs) best = multiplier;
  }
  return best;
}

/** Commission multiplier during the run of an event (JP schedule) (matched by event id), or the fallback when the run is unknown. */
export function getEventCommissionMultiplier(eventId: number, fallback: number): number {
  const { tracks } = loadScheduleDataV2({ server: 'jp', tracksToLoad: ['event', 'campaign'] });
  const run = (tracks.event ?? []).find((item) => Number(item.eventId) === eventId);
  if (!run) return fallback;
  return pickCommissionMultiplier(tracks.campaign ?? [], new Date(run.startTime).getTime(), new Date(run.endTime).getTime(), fallback);
}
