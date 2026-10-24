import { PV_LIST, type PvEntry } from '../data/pv';
import { fesEvents, type FesEvent } from './fes';
import type { Server, ServerSchedule } from './releaseDates';

// What sits between the stories on the timeline: Fes recruitments and promotional videos.
export type TimelineExtra = { kind: 'fes'; date: string; fes: FesEvent } | { kind: 'pv'; date: string; pv: PvEntry };

// Everything that happened on `server`, earliest first. A video that has no date on this server is left out.
export function timelineExtras(schedules: Record<Server, ServerSchedule>, server: Server, videos: PvEntry[] = PV_LIST): TimelineExtra[] {
  const fes: TimelineExtra[] = fesEvents(schedules, server).map((event) => ({ kind: 'fes', date: event.date, fes: event }));
  const pv: TimelineExtra[] = videos.flatMap((entry) => {
    const video = entry.videos[server];
    return video ? [{ kind: 'pv' as const, date: video.date, pv: entry }] : [];
  });
  return [...fes, ...pv].sort((a, b) => a.date.localeCompare(b.date));
}
