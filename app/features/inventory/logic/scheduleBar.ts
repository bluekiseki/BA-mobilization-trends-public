// 04:00 GMT+9 daily reset — same convention as TacticalPlanner.
// Adding this offset before flooring to UTC midnight maps GMT+9 04:00 → virtual day boundary.
export const GAME_DAY_OFFSET_MS = 5 * 3600 * 1000;
export type BarType = 'event' | 'raid' | 'eraid' | 'multifloor' | 'campaign';
export interface ScheduleBarItem {
  name: string;
  type: BarType;
  startMs: number;
  endMs: number;
}
