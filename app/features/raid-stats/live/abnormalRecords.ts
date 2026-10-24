import type { LastData, TimelineData } from '~/features/raid-stats/live/livetype';

// Records the upstream data provider flagged as suspected cheating carry `h: true`.
// This is the provider's flag, not our own judgment.
const ABNORMAL_KEY = 'h';

const isAbnormalEntry = (value: unknown): boolean => typeof value === 'object' && value !== null && (value as Record<string, unknown>)[ABNORMAL_KEY] === true;

/**
 * Deep-clone `value`, dropping every array element flagged as abnormal.
 * Score-distribution entries are the only objects carrying `h`, so a generic walk is safe
 * and covers every shape (raid `boss.d`, grand-assault `total`/`total.bossN.d`/`bossN.d`,
 * and the same keys inside timeline points).
 */
function stripAbnormalDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return (value as unknown[]).filter((item) => !isAbnormalEntry(item)).map((item) => stripAbnormalDeep(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) out[key] = stripAbnormalDeep(nested);
    return out;
  }
  return value;
}

const stripAbnormal = <T>(value: T): T => stripAbnormalDeep(value) as T;

/** Count distinct ranks flagged as abnormal in the current snapshot (i.e. how many records get hidden). */
export function countAbnormalRecords(lastData: LastData): number {
  const flaggedRanks = new Set<number>();
  const scan = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(scan);
      return;
    }
    const obj = value as Record<string, unknown>;
    if (obj[ABNORMAL_KEY] === true && typeof obj.r === 'number') flaggedRanks.add(obj.r);
    Object.values(obj).forEach(scan);
  };
  scan(lastData.data);
  return flaggedRanks.size;
}

/** Return copies of the live datasets with abnormal records removed. */
export function filterAbnormalRecords(lastData: LastData, timelineData: TimelineData): { lastData: LastData; timelineData: TimelineData } {
  return {
    lastData: { ...lastData, data: stripAbnormal(lastData.data) },
    timelineData: stripAbnormal(timelineData),
  };
}
