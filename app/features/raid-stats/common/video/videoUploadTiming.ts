export interface RaidPeriod {
  startTime: string;
  endTime: string;
}

export function getVideoUploadTiming(timestamp: number | undefined, period: RaidPeriod | undefined): 'before' | 'after' | number | null {
  if (timestamp === undefined || !Number.isFinite(timestamp) || !period) return null;
  const start = Date.parse(period.startTime);
  const end = Date.parse(period.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const uploaded = timestamp * 1000;
  if (uploaded < start) return 'before';
  if (uploaded > end) return 'after';

  // Raid days reset at 04:00 in UTC+9, independently of the opening time.
  const dayMs = 86400000;
  const resetOffset = 5 * 3600000;
  return Math.floor((uploaded + resetOffset) / dayMs) - Math.floor((start + resetOffset) / dayMs) + 1;
}
